//! Wasm port of megaminxSolver.ts's own buildReachableMap: the setup-move
//! BFS that findSafeApplication/findFinishingApplication call up to
//! maxReachable=300,000 times per invocation. Ported here (not the whole
//! solve pipeline) because this is the one loop profiling identified as
//! dominant, and porting just it keeps the JS/Wasm boundary small: MOVE_TABLE
//! and the current state cross it once per call, one packed `u64` key
//! crosses it per query, and everything else (library iteration, commutator
//! matching, applySeq for the final chosen sequence) stays in JS unchanged.
//!
//! No wasm-bindgen: the ABI is a handful of `extern "C"` functions moving
//! plain bytes through Wasm's own linear memory, read directly via
//! `WebAssembly.Memory` from the JS side (see megaminxSearchWasm.ts).
//!
//! Rebuild after editing this file: `cargo build --target wasm32-unknown-unknown
//! --release && cp target/wasm32-unknown-unknown/release/megaminx_search.wasm .`
//! -- the committed `megaminx_search.wasm` next to this crate (not `target/`,
//! which is gitignored) is the actual runtime artifact megaminxSearchWasm.ts
//! loads, so it must be regenerated and committed alongside any source change.

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

/// Fast, non-cryptographic hasher for the u64 search keys used by this
/// module's two `key_to_id` maps (compute_key/compute_edge_state_key
/// output -- see ReachableIndex and Tree below). These keys never come
/// from untrusted input (they're derived from the puzzle's own piece
/// positions, packed base-30/60), so std HashMap's default SipHash --
/// built for DoS resistance against adversarial keys -- buys nothing
/// here and costs real mixing work on every single BFS expansion step,
/// the hottest inner loop in this whole module. Same multiply-rotate
/// technique as rustc's own internal FxHash, used for exactly this
/// reason (integer keys that are already well-spread by construction
/// don't need cryptographic-strength avalanche).
#[derive(Default)]
struct FxHasher(u64);

impl Hasher for FxHasher {
    fn write(&mut self, bytes: &[u8]) {
        // Only ever called with u64 keys (write_u64 below) by this
        // module's own HashMaps -- this generic fallback exists solely
        // to satisfy the Hasher trait, never actually exercised.
        for &b in bytes {
            self.0 = (self.0.rotate_left(5) ^ b as u64).wrapping_mul(0x517c_c1b7_2722_0a95);
        }
    }
    fn write_u64(&mut self, i: u64) {
        self.0 = (self.0.rotate_left(5) ^ i).wrapping_mul(0x517c_c1b7_2722_0a95);
    }
    fn finish(&self) -> u64 {
        self.0
    }
}

type FastMap<K, V> = HashMap<K, V, BuildHasherDefault<FxHasher>>;

#[derive(Clone, Copy, PartialEq)]
struct State {
    corner_perm: [i8; 20],
    corner_orient: [i8; 20],
    edge_perm: [i8; 30],
    edge_orient: [i8; 30],
}

/// A zero-filled scratch TEMPLATE, NOT the solved megaminx state --
/// `corner_perm: [0; 20]` means "every position holds piece 0", not the
/// identity permutation. Only ever used as an initializer immediately
/// overwritten field-by-field (apply_move's own `let mut out = SOLVED;`,
/// read_state_scratch's own starting point before every byte is set from
/// the scratch buffer) -- NEVER pass this to something that treats it as
/// an actual state, such as a search target. Use `solved_state()` for that
/// (confirmed the hard way: solve_cross's own bidirectional search
/// against this by mistake never found ANY correct solution, not even
/// the trivial already-solved case, since it was searching for a
/// physically nonsensical target).
const SOLVED: State = State {
    corner_perm: [0; 20],
    corner_orient: [0; 20],
    edge_perm: [0; 30],
    edge_orient: [0; 30],
};

/// The GENUINE solved megaminx state: identity permutation (piece i sits
/// at position i), zero orientation everywhere.
fn solved_state() -> State {
    let mut s = SOLVED;
    for i in 0..20 {
        s.corner_perm[i] = i as i8;
    }
    for i in 0..30 {
        s.edge_perm[i] = i as i8;
    }
    s
}

/// [face 0..12][sign 0=+1,1=-1] each contributing 100 i8 values in order
/// cornerPerm[20], cornerOrientDelta[20], edgePerm[30], edgeOrientDelta[30]
/// -- exactly MOVE_TABLE's own shape in megaminxState.ts, flattened.
static mut MOVE_TABLE: Vec<i8> = Vec::new();

fn apply_move(state: &State, face: u8, sign_negative: bool) -> State {
    let base = (face as usize) * 200 + if sign_negative { 100 } else { 0 };
    let mt = unsafe { &*&raw const MOVE_TABLE };
    let mcp = &mt[base..base + 20];
    let mcod = &mt[base + 20..base + 40];
    let mep = &mt[base + 40..base + 70];
    let meod = &mt[base + 70..base + 100];

    let mut out = SOLVED;
    for pos in 0..20 {
        let from = mcp[pos] as usize;
        out.corner_perm[pos] = state.corner_perm[from];
        // Both operands are always non-negative and individually <3 (see
        // megaminxState.ts's own buildMoveTable: cornerOrientDelta comes
        // from a bySlot.findIndex over a 3-element array, so 0..3), so the
        // sum is always in 0..6 and never needs more than one subtraction
        // to land back in 0..3 -- a plain branch beats rem_euclid's more
        // general (and, for wasm32, division-based) implementation here.
        let sum = state.corner_orient[from] + mcod[pos];
        out.corner_orient[pos] = if sum >= 3 { sum - 3 } else { sum };
    }
    for pos in 0..30 {
        let from = mep[pos] as usize;
        out.edge_perm[pos] = state.edge_perm[from];
        // Same reasoning, mod 2: both operands non-negative and <2, so
        // parity of the sum is exactly what mod 2 needs -- a bitmask.
        out.edge_orient[pos] = (state.edge_orient[from] + meod[pos]) & 1;
    }
    out
}

/// Mirrors positionOnlyKeyFor's own base-30 packing exactly: `pieces` must
/// already be sorted ascending (the JS side sorts before crossing the
/// boundary), and `kind` selects which permutation array to scan (0 =
/// corner, 30 otherwise = edge -- matches PieceKind.count, 20 or 30).
fn compute_key(state: &State, kind: u8, pieces: &[i8]) -> u64 {
    let n = pieces.len();
    let count = if kind == 0 { 20 } else { 30 };
    let perm: &[i8] = if kind == 0 { &state.corner_perm } else { &state.edge_perm };
    // O(count) instead of O(count * n): a piece-id -> slot lookup table
    // (piece ids are always <30, corner or edge) replaces the inner
    // linear scan through `pieces` that used to run for every position.
    // Called on every single BFS-explored state (this module's own
    // hottest function by call count), so this is a real complexity win,
    // not just a constant-factor one.
    let mut slot_for_piece = [-1i8; 30];
    for i in 0..n {
        slot_for_piece[pieces[i] as usize] = i as i8;
    }
    let mut positions = [0i8; 8]; // n is always <=8, see findFinishingApplication's own guard
    let mut remaining = n;
    for pos in 0..count {
        if remaining == 0 {
            break;
        }
        let slot = slot_for_piece[perm[pos] as usize];
        if slot >= 0 {
            positions[slot as usize] = pos as i8;
            remaining -= 1;
        }
    }
    let mut key: u64 = 0;
    for i in 0..n {
        key = key * 30 + positions[i] as u64;
    }
    key
}

struct ReachableIndex {
    key_to_id: FastMap<u64, u32>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
}

// ---------------------------------------------------------------------
// MEGAMINX_3SEC_REACHABILITY_REUSE_ANALYSIS_V1 -- pure diagnostic
// instrumentation (no algorithm change): logs one record per
// build_reachable_impl call made FROM find_safe_application /
// find_finishing_application (build_reachable_impl's own body is
// untouched), so a JS-side benchmark can determine, after a real solve,
// how many of those calls shared the exact same (root state, kind,
// pieces, maxDepth, maxReachable) -- i.e. would have done identical work
// -- without changing what any call returns. Read via reach_log_ptr/
// reach_log_count, cleared via reach_log_reset; never read internally by
// any solver logic.
// ---------------------------------------------------------------------
fn hash_state(state: &State) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV-1a offset basis
    for &b in state.corner_perm.iter().chain(state.corner_orient.iter()).chain(state.edge_perm.iter()).chain(state.edge_orient.iter()) {
        h ^= b as u8 as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3); // FNV-1a prime
    }
    h
}

/// 32 u64 words/record: [state_hash, packed_pieces(8 sorted piece ids as
/// bytes, 0xFF padding), (kind|caller_tag<<8|pieces_len<<16), max_depth,
/// max_reachable, result_size, expanded_nodes, generated_states,
/// max_depth_reached, termination_reason, pairs_visited, candidates_hit,
/// success_visit_index, success_key_discovery_id, reject_fixed_ok_fail,
/// reject_blocked, cross_touches_reject, cross_touches_pass,
/// cross_not_touches_reject, cross_not_touches_pass, definition_mismatch,
/// unique_setup_paths, all_touch_full, full_touches_count,
/// full_reachable_size, winning_support_size, attempted_le6, attempted_gt6,
/// fixedfail_le6, fixedfail_gt6, blocked_le6, blocked_gt6]. Words 7-10 come
/// from LAST_BFS_STATS, populated
/// by build_reachable_impl itself immediately before it returns (see
/// MEGAMINX_3SEC_REACHABILITY_COST_PROFILE_V1's own comment there) --
/// valid here because log_reach_call is always called immediately after
/// the build_reachable_impl call it documents, with no other
/// build_reachable_impl call in between (this module is single-threaded,
/// no reentrancy). Words 11-14 (MEGAMINX_3SEC_PAIR_ANCHOR_EXHAUSTION_ANALYSIS_V1)
/// describe the matching-loop scan that follows the BFS in
/// find_safe_application's own two branches -- -1 (stored as u32::MAX)
/// for the last two when no candidate ever succeeded, or when the caller
/// (find_finishing_application, a structurally different permutation
/// search) has no such loop to report. Words 15-16
/// (MEGAMINX_3SEC_FAILED_CANDIDATE_REASON_ANALYSIS_V1) tally
/// try_candidate's own two (and only two) rejection points -- both 0 for
/// find_finishing_application, which has no try_candidate of this shape.
/// Words 17-22 (MEGAMINX_3SEC_SETUP_PATH_FIXED_FILTER_VALIDATION_V1)
/// cross-tab "does the setup path alone already touch a fixed position"
/// against the eventual fixed_ok result, plus setup-path-level
/// aggregates -- all 0 for find_finishing_application, which has no
/// setup-path concept of this shape. Words 23-25
/// (MEGAMINX_3SEC_CALL_LEVEL_FIXED_FILTER_VALIDATION_V2): whether EVERY
/// entry in the BFS's own full reachable-map (not just the subset the
/// library actually references) touches a fixed position -- the one
/// signal genuinely computable BEFORE the library scan starts, since it
/// depends only on build_reachable_impl's own output. Words 26-32
/// (MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_NECESSITY_V1): winning_support_size
/// is the WINNING commutator's own `support.len()` on success (u32::MAX
/// sentinel otherwise) -- since `library` is built by buildCommutatorLibrary
/// as buckets 1..maxSupport concatenated in ascending order and the
/// matching loop below scans it start-to-finish breaking on first hit,
/// this is exactly "the smallest support size that had a working
/// candidate for this call", letting a maxSupport-N restriction's effect
/// be read straight off this one field's distribution (removing support
/// >N entries can only turn a call whose winning_support_size db>N into a
/// failure; it can never change a call whose winning_support_size<=N,
/// since the scan would already have broken before ever reaching the
/// removed entries). attempted_le6/gt6, fixedfail_le6/gt6, blocked_le6/gt6
/// split the SAME existing pairs_visited/reject_fixed_ok_fail/reject_blocked
/// tallies by whether the (commutator,anchor) pair's own commutator has
/// support.len()<=6 or >6 -- the concrete maxSupport=10->6 boundary this
/// Sprint is asked to evaluate.
static mut REACH_LOG: Vec<u64> = Vec::new();

#[allow(clippy::too_many_arguments)]
fn log_reach_call(
    state: &State, kind: u8, pieces: &[i8], caller_tag: u8, max_depth: u32, max_reachable: u32, result_size: u32,
    pairs_visited: u32, candidates_hit: u32, success_visit_index: i32, success_key_discovery_id: i32, reject_fixed_ok_fail: u32, reject_blocked: u32,
    cross_touches_reject: u32, cross_touches_pass: u32, cross_not_touches_reject: u32, cross_not_touches_pass: u32, definition_mismatch: u32, unique_setup_paths: u32,
    all_touch_full: bool, full_touches_count: u32, full_reachable_size: u32,
    winning_support_size: i32, attempted_le6: u32, attempted_gt6: u32, fixedfail_le6: u32, fixedfail_gt6: u32, blocked_le6: u32, blocked_gt6: u32,
) {
    let log = unsafe { &mut *&raw mut REACH_LOG };
    let mut sorted: [u8; 8] = [0xFF; 8];
    let n = pieces.len().min(8);
    for i in 0..n {
        sorted[i] = pieces[i] as u8;
    }
    sorted[..n].sort_unstable();
    let mut packed: u64 = 0;
    for i in 0..8 {
        packed |= (sorted[i] as u64) << (i * 8);
    }
    let bfs = unsafe { LAST_BFS_STATS };
    log.push(hash_state(state));
    log.push(packed);
    log.push((kind as u64) | ((caller_tag as u64) << 8) | ((n as u64) << 16));
    log.push(max_depth as u64);
    log.push(max_reachable as u64);
    log.push(result_size as u64);
    log.push(bfs.expanded_nodes as u64);
    log.push(bfs.generated_states as u64);
    log.push(bfs.max_depth_reached as u64);
    log.push(bfs.termination_reason as u64);
    log.push(pairs_visited as u64);
    log.push(candidates_hit as u64);
    log.push(success_visit_index as u32 as u64);
    log.push(success_key_discovery_id as u32 as u64);
    log.push(reject_fixed_ok_fail as u64);
    log.push(reject_blocked as u64);
    log.push(cross_touches_reject as u64);
    log.push(cross_touches_pass as u64);
    log.push(cross_not_touches_reject as u64);
    log.push(cross_not_touches_pass as u64);
    log.push(definition_mismatch as u64);
    log.push(unique_setup_paths as u64);
    log.push(if all_touch_full { 1 } else { 0 });
    log.push(full_touches_count as u64);
    log.push(full_reachable_size as u64);
    log.push(winning_support_size as u32 as u64);
    log.push(attempted_le6 as u64);
    log.push(attempted_gt6 as u64);
    log.push(fixedfail_le6 as u64);
    log.push(fixedfail_gt6 as u64);
    log.push(blocked_le6 as u64);
    log.push(blocked_gt6 as u64);
}

#[no_mangle]
pub unsafe extern "C" fn reach_log_count() -> u32 {
    ((&*&raw const REACH_LOG).len() / 32) as u32
}

#[no_mangle]
pub unsafe extern "C" fn reach_log_ptr() -> *const u64 {
    (&*&raw const REACH_LOG).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn reach_log_reset() {
    (&mut *&raw mut REACH_LOG).clear();
}

/// Only the CURRENT frontier's own states are ever read (to generate the
/// next level) -- a state is never touched again once its own children
/// have been expanded, so keeping every discovered node's state alive in
/// a global, ever-growing Vec (as an earlier version of this function
/// did) held onto up to maxReachable x 100 bytes (30MB at the default
/// cap) that was never read again past its own single expansion. States
/// now travel ONLY inside `frontier`/`next`, so peak memory is bounded by
/// one level's own width, not the total node count.
fn build_reachable_impl(state: State, kind: u8, pieces: &[i8], max_depth: u32, max_reachable: u32) -> ReachableIndex {
    let mut key_to_id: FastMap<u64, u32> = FastMap::default();
    let mut parent: Vec<i32> = Vec::new();
    let mut move_face: Vec<u8> = Vec::new();
    let mut move_sign_negative: Vec<bool> = Vec::new();

    key_to_id.insert(compute_key(&state, kind, pieces), 0);
    parent.push(-1);
    move_face.push(0);
    move_sign_negative.push(false);

    // Double-buffered frontier/next: two Vecs reused (via .clear(), which
    // keeps their already-grown capacity) and swapped every depth level,
    // instead of allocating a fresh `next` Vec each level and dropping the
    // old `frontier` -- each buffer's own capacity still grows the usual
    // amortized way on its first few levels, but never gets thrown away
    // and reallocated from scratch once it's reached this search's own
    // typical level width.
    let mut buf_a: Vec<(State, u32)> = vec![(state, 0)];
    let mut buf_b: Vec<(State, u32)> = Vec::new();
    let mut frontier = &mut buf_a;
    let mut next = &mut buf_b;

    // MEGAMINX_3SEC_REACHABILITY_COST_PROFILE_V1 -- pure diagnostic
    // counters (see LAST_BFS_STATS below): incremented alongside the
    // existing loop, never read by it, never affecting which keys/paths
    // get recorded -- same non-interference guarantee as REACH_LOG itself.
    let mut expanded_nodes: u32 = 0;
    let mut generated_states: u32 = 0;

    let mut depth: u32 = 0;
    let mut hit_max_reachable = false;
    'depth_loop: while depth < max_depth && !frontier.is_empty() && (key_to_id.len() as u32) < max_reachable {
        next.clear();
        for &(base_state, id) in frontier.iter() {
            expanded_nodes += 1;
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    generated_states += 1;
                    let child = apply_move(&base_state, face, sign_negative);
                    let key = compute_key(&child, kind, pieces);
                    if key_to_id.contains_key(&key) {
                        continue;
                    }
                    if (key_to_id.len() as u32) >= max_reachable {
                        // Same effective stopping point as the JS version's
                        // own `if (keyToId.size >= maxReachable) break`: no
                        // further key ever gets inserted past this point
                        // either way, so exiting all three loops now instead
                        // of spinning through the rest as no-ops changes
                        // nothing about which keys/paths get recorded.
                        hit_max_reachable = true;
                        break 'depth_loop;
                    }
                    let child_id = parent.len() as u32;
                    key_to_id.insert(key, child_id);
                    parent.push(id as i32);
                    move_face.push(face);
                    move_sign_negative.push(sign_negative);
                    next.push((child, child_id));
                }
            }
        }
        std::mem::swap(&mut frontier, &mut next);
        depth += 1;
    }

    // 0=MAX_DEPTH, 1=MAX_REACHABLE, 2=SEARCH_EXHAUSTED, 3=OTHER -- checked
    // in this order since MAX_REACHABLE can coincide with the depth cap
    // (the more specific, certain signal), and an empty next frontier is
    // only meaningful once neither cap fired.
    let termination_reason: u8 = if hit_max_reachable || (key_to_id.len() as u32) >= max_reachable {
        1
    } else if depth >= max_depth {
        0
    } else if frontier.is_empty() {
        2
    } else {
        3
    };
    unsafe {
        LAST_BFS_STATS = BfsStats { expanded_nodes, generated_states, max_depth_reached: depth, termination_reason };
    }

    ReachableIndex { key_to_id, parent, move_face, move_sign_negative }
}

#[derive(Clone, Copy, Default)]
struct BfsStats {
    expanded_nodes: u32,
    generated_states: u32,
    max_depth_reached: u32,
    termination_reason: u8,
}
static mut LAST_BFS_STATS: BfsStats = BfsStats { expanded_nodes: 0, generated_states: 0, max_depth_reached: 0, termination_reason: 3 };

fn reconstruct(index: &ReachableIndex, id: u32) -> Vec<(u8, bool)> {
    let mut moves = Vec::new();
    let mut cur = id as i32;
    while index.parent[cur as usize] != -1 {
        moves.push((index.move_face[cur as usize], index.move_sign_negative[cur as usize]));
        cur = index.parent[cur as usize];
    }
    moves.reverse();
    moves
}

static mut CURRENT_INDEX: Option<ReachableIndex> = None;
static mut RESULT_BUF: Vec<u8> = Vec::new();

/// Lets JS write an input buffer (state, tracked pieces) into Wasm's own
/// linear memory before a call that reads from it.
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    let _ = Vec::from_raw_parts(ptr, len, len);
}

/// `ptr` must point at exactly 2400 bytes: MOVE_TABLE flattened as
/// [face 0..12][sign 0=+1,1=-1] x (cornerPerm[20] ++ cornerOrientDelta[20]
/// ++ edgePerm[30] ++ edgeOrientDelta[30]). Call once at module init.
#[no_mangle]
pub unsafe extern "C" fn init_move_table(ptr: *const u8) {
    let slice = std::slice::from_raw_parts(ptr as *const i8, 2400);
    MOVE_TABLE = slice.to_vec();
}

// ---------------------------------------------------------------------
// Static scratch buffers for the small, fixed-upper-bound inputs every
// hot-path call (build_reachable, find_safe_application) used to pass
// via a fresh alloc()/dealloc() pair each time -- profiling this
// project's own JS side never isolated the exact cost of that per-call
// allocator churn, but it's pure overhead regardless of size (Rust's
// global allocator does real bookkeeping work on every alloc/dealloc),
// so removing it is a safe, unconditional win. JS fetches each pointer
// ONCE (it never moves -- these are plain `static mut` arrays, not
// reallocated Vecs) and writes fresh bytes into the same address on
// every call instead of asking Wasm to allocate a new one.
// ---------------------------------------------------------------------
static mut STATE_SCRATCH: [u8; 100] = [0; 100];
static mut PIECES_SCRATCH: [u8; 8] = [0; 8]; // max tracked pieces, see findFinishingApplication's own wrongPositions.length<=8 guard
static mut FIXED_CORNERS_SCRATCH: [u8; 20] = [0; 20];
static mut FIXED_EDGES_SCRATCH: [u8; 30] = [0; 30];
static mut TARGET_POSITIONS_SCRATCH: [u8; 30] = [0; 30];

#[no_mangle]
pub unsafe extern "C" fn state_scratch_ptr() -> *mut u8 {
    (&raw mut STATE_SCRATCH) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn pieces_scratch_ptr() -> *mut u8 {
    (&raw mut PIECES_SCRATCH) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn fixed_corners_scratch_ptr() -> *mut u8 {
    (&raw mut FIXED_CORNERS_SCRATCH) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn fixed_edges_scratch_ptr() -> *mut u8 {
    (&raw mut FIXED_EDGES_SCRATCH) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn target_positions_scratch_ptr() -> *mut u8 {
    (&raw mut TARGET_POSITIONS_SCRATCH) as *mut u8
}

fn read_state_scratch() -> State {
    let bytes = unsafe { &*&raw const STATE_SCRATCH };
    let mut state = SOLVED;
    for i in 0..20 {
        state.corner_perm[i] = bytes[i] as i8;
        state.corner_orient[i] = bytes[20 + i] as i8;
    }
    for i in 0..30 {
        state.edge_perm[i] = bytes[40 + i] as i8;
        state.edge_orient[i] = bytes[70 + i] as i8;
    }
    state
}

/// Reads state and tracked pieces from the static scratch buffers (see
/// above) instead of caller-supplied pointers. Replaces whatever
/// reachable index a previous call built -- this module only ever holds
/// the ONE index a single findSafeApplication/findFinishingApplication
/// call is actively querying, matching how the JS callers themselves use
/// buildReachableMap's own return value.
#[no_mangle]
pub unsafe extern "C" fn build_reachable(kind: u8, pieces_len: u32, max_depth: u32, max_reachable: u32) {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    CURRENT_INDEX = Some(build_reachable_impl(state, kind, &pieces[..pieces_len as usize], max_depth, max_reachable));
}

/// key = (key_hi << 32) | key_lo, splitting the JS-side safe-integer key
/// into two u32 halves so the whole ABI stays BigInt-free (see this
/// project's own Step-4 dev notes on why plain numbers beat BigInt here).
/// Returns the move count on a hit (results readable via result_ptr(), 2
/// bytes/move: face, signNegative as 0/1) or -1 on a miss.
#[no_mangle]
pub unsafe extern "C" fn query(key_lo: u32, key_hi: u32) -> i32 {
    let key = ((key_hi as u64) << 32) | (key_lo as u64);
    let Some(index) = &*&raw const CURRENT_INDEX else { return -1 };
    let Some(&id) = index.key_to_id.get(&key) else { return -1 };
    let moves = reconstruct(index, id);
    let result_buf = &mut *&raw mut RESULT_BUF;
    result_buf.clear();
    for (face, sign_negative) in &moves {
        result_buf.push(*face);
        result_buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn result_ptr() -> *const u8 {
    (&*&raw const RESULT_BUF).as_ptr()
}

// ---------------------------------------------------------------------
// findSafeApplication, ported whole (not just its own buildReachableMap
// call): profiling after the findFinishingApplication cap tuning above
// showed findSafeApplication's own JS-side matching loop had grown to
// ~49% of a full solve's own time (it was ~16% before that tuning cut
// findFinishingApplication down -- same absolute cost, just a bigger
// share of a much smaller total). The loop itself is cheap per
// iteration, but it runs it for every (commutator, anchor) pair in a
// library of up to ~700 entries, crossing back into JS for each
// candidate's applySeq/fixedOk/countWrongKind -- moving the whole
// candidate-matching loop here keeps it a single Wasm call per
// findSafeApplication invocation instead of hundreds of small JS/Wasm
// round trips (plus JS array allocation) per invocation.
//
// A commutator's OWN data (seq, movingSupport, destination) never
// changes once a phase's library is built, so it's uploaded ONCE per
// distinct library (JS caches the returned handle by the library
// array's own identity) rather than re-serialized on every call.
// ---------------------------------------------------------------------

struct Commutator {
    seq: Vec<(u8, bool)>,
    // Full support: every position this commutator's result TOUCHES
    // (permutation moved OR orientation-only twisted) -- a superset of
    // moving_support below. find_finishing_application's own exact-match
    // search needs this (it assigns EVERY wrong piece to a support slot,
    // pure-twist slots included, since the joint match just needs the
    // final state solved, not each individual move to relocate a piece);
    // find_safe_application's single-piece routing needs the smaller
    // moving_support instead (see its own field comment for why).
    support: Vec<u8>,
    moving_support: Vec<u8>,
    destination: Vec<u8>,
}

static mut LIBRARIES: Vec<Vec<Commutator>> = Vec::new();

/// Buffer format, repeated `entry_count` times: seqLen:u8, seq (seqLen x
/// [face:u8, signNegative:u8]), supportLen:u8, support (supportLen x u8),
/// movingSupportLen:u8, movingSupport (movingSupportLen x u8), destination
/// (kind.count x u8 -- 20 or 30, matching `kind`). `kind` and the
/// destination/support/movingSupport arrays are already resolved for
/// whichever piece kind this library targets (the JS side never uploads a
/// library for the "wrong" kind), so this module never needs to carry both
/// corner and edge variants per entry.
#[no_mangle]
pub unsafe extern "C" fn upload_library(kind: u8, entry_count: u32, total_len: u32, ptr: *const u8) -> u32 {
    let dest_len = if kind == 0 { 20 } else { 30 };
    let bytes = std::slice::from_raw_parts(ptr, total_len as usize);
    let mut cursor = 0usize;
    let mut entries = Vec::with_capacity(entry_count as usize);
    for _ in 0..entry_count {
        let seq_len = bytes[cursor] as usize;
        cursor += 1;
        let mut seq = Vec::with_capacity(seq_len);
        for _ in 0..seq_len {
            seq.push((bytes[cursor], bytes[cursor + 1] != 0));
            cursor += 2;
        }
        let support_len = bytes[cursor] as usize;
        cursor += 1;
        let support = bytes[cursor..cursor + support_len].to_vec();
        cursor += support_len;
        let ms_len = bytes[cursor] as usize;
        cursor += 1;
        let moving_support = bytes[cursor..cursor + ms_len].to_vec();
        cursor += ms_len;
        let destination = bytes[cursor..cursor + dest_len].to_vec();
        cursor += dest_len;
        entries.push(Commutator { seq, support, moving_support, destination });
    }
    let libs = &mut *&raw mut LIBRARIES;
    libs.push(entries);
    (libs.len() - 1) as u32
}

fn apply_seq(state: State, seq: &[(u8, bool)]) -> State {
    let mut s = state;
    for &(face, sign_negative) in seq {
        s = apply_move(&s, face, sign_negative);
    }
    s
}

fn invert_seq(seq: &[(u8, bool)]) -> Vec<(u8, bool)> {
    seq.iter().rev().map(|&(face, sign_negative)| (face, !sign_negative)).collect()
}

fn fixed_ok(state: &State, fixed_corners: &[u8], fixed_edges: &[u8]) -> bool {
    fixed_corners.iter().all(|&p| state.corner_perm[p as usize] == p as i8 && state.corner_orient[p as usize] == 0)
        && fixed_edges.iter().all(|&p| state.edge_perm[p as usize] == p as i8 && state.edge_orient[p as usize] == 0)
}

fn count_wrong(kind: u8, state: &State, target_positions: &[u8]) -> u32 {
    let (perm, orient): (&[i8], &[i8]) = if kind == 0 { (&state.corner_perm, &state.corner_orient) } else { (&state.edge_perm, &state.edge_orient) };
    let mut n = 0u32;
    for &p in target_positions {
        let p = p as usize;
        if perm[p] != p as i8 || orient[p] != 0 {
            n += 1;
        }
    }
    n
}

static mut FSA_RESULT_BUF: Vec<u8> = Vec::new();

/// Mirrors findSafeApplication's own two branches exactly (see
/// megaminxSolver.ts's own findSafeApplication for the JS this replaces).
/// `target`/`displaced` equal means the single-anchor branch (maxDepth 9);
/// otherwise the joint (target, displaced) branch (maxDepth 11). Returns
/// the winning move count (>=0) with the result written to
/// FSA_RESULT_BUF as [state: 100 bytes][moves: count x 2 bytes], or -1 if
/// no candidate in the library satisfies fixedOk + the wrongAfter
/// condition -- callers fall back to trying the next target position,
/// exactly as before.
#[no_mangle]
pub unsafe extern "C" fn find_safe_application(
    lib_handle: u32,
    kind: u8,
    target: u8,
    displaced: u8,
    fixed_corners_len: u32,
    fixed_edges_len: u32,
    target_positions_len: u32,
    wrong_before: u32,
    require_improvement: u8,
) -> i32 {
    let state = read_state_scratch();
    let fixed_corners = &(&*&raw const FIXED_CORNERS_SCRATCH)[..fixed_corners_len as usize];
    let fixed_edges = &(&*&raw const FIXED_EDGES_SCRATCH)[..fixed_edges_len as usize];
    let target_positions = &(&*&raw const TARGET_POSITIONS_SCRATCH)[..target_positions_len as usize];
    let require_improvement = require_improvement != 0;

    let library = &(&*&raw const LIBRARIES)[lib_handle as usize];

    // MEGAMINX_3SEC_FAILED_CANDIDATE_REASON_ANALYSIS_V1 -- pure diagnostic
    // counters for try_candidate's own two (and only two) rejection
    // points, tallied exactly as the existing branches already fire, not
    // a new condition invented for this Sprint.
    let mut reject_fixed_ok_fail: u32 = 0;
    let mut reject_blocked: u32 = 0;

    // MEGAMINX_3SEC_SETUP_PATH_FIXED_FILTER_VALIDATION_V1 -- pure
    // diagnostic: does the SETUP PATH ALONE (before the commutator is
    // even applied) already break the fixed invariant? Two independent
    // definitions, both measured (not assumed equal) per the work order:
    //   - "support" -- compose s_path from the identity/solved state and
    //     check fixed_ok on that (state-independent structural fact about
    //     which positions the sequence's own permutation touches).
    //   - "actual" -- apply s_path to the REAL current `state` (whose
    //     fixed positions are already solved, by the fixed-set invariant)
    //     and check fixed_ok on that intermediate, setup-only result.
    // Memoized per distinct BFS-discovery id (the same setup path is
    // reconstructed repeatedly whenever multiple commutators share an
    // anchor/dest key), which doubles as this Sprint's own setup-path-level
    // aggregation (unique_setup_paths, candidates per path).
    let mut setup_cache: FastMap<u32, (bool, bool)> = FastMap::default();
    let mut cross_touches_reject: u32 = 0;
    let mut cross_touches_pass: u32 = 0; // touches_fixed(actual)=true AND fixed_ok PASSED -- the safety-critical bucket
    let mut cross_not_touches_reject: u32 = 0;
    let mut cross_not_touches_pass: u32 = 0;
    let mut definition_mismatch: u32 = 0; // support-based vs actual-based disagree, tallied once per unique setup path

    // MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_NECESSITY_V1 -- pure diagnostic:
    // splits the SAME reject_fixed_ok_fail/reject_blocked tallies above by
    // whether the current commutator's own support.len() is <=6 or >6, to
    // evaluate the concrete maxSupport=10->6 library-size boundary.
    let mut attempted_le6: u32 = 0;
    let mut attempted_gt6: u32 = 0;
    let mut fixedfail_le6: u32 = 0;
    let mut fixedfail_gt6: u32 = 0;
    let mut blocked_le6: u32 = 0;
    let mut blocked_gt6: u32 = 0;

    let mut try_candidate = |s_path: &[(u8, bool)], c: &Commutator, touches_fixed_actual: bool, support_le6: bool| -> Option<(State, Vec<(u8, bool)>)> {
        let s_inv = invert_seq(s_path);
        let mut full_seq = Vec::with_capacity(s_path.len() + c.seq.len() + s_inv.len());
        full_seq.extend_from_slice(s_path);
        full_seq.extend_from_slice(&c.seq);
        full_seq.extend_from_slice(&s_inv);
        let result_state = apply_seq(state, &full_seq);
        if !fixed_ok(&result_state, fixed_corners, fixed_edges) {
            reject_fixed_ok_fail += 1;
            if support_le6 { fixedfail_le6 += 1 } else { fixedfail_gt6 += 1 }
            if touches_fixed_actual { cross_touches_reject += 1 } else { cross_not_touches_reject += 1 }
            return None;
        }
        if touches_fixed_actual { cross_touches_pass += 1 } else { cross_not_touches_pass += 1 }
        let wrong_after = count_wrong(kind, &result_state, target_positions);
        let blocked = if require_improvement { wrong_after >= wrong_before } else { wrong_after > wrong_before };
        if blocked {
            reject_blocked += 1;
            if support_le6 { blocked_le6 += 1 } else { blocked_gt6 += 1 }
            return None;
        }
        Some((result_state, full_seq))
    };

    let mut touches_fixed_for = |id: u32, s_path: &[(u8, bool)]| -> bool {
        if let Some(&(_support, actual)) = setup_cache.get(&id) {
            return actual;
        }
        let support = !fixed_ok(&apply_seq(solved_state(), s_path), fixed_corners, fixed_edges);
        let actual = !fixed_ok(&apply_seq(state, s_path), fixed_corners, fixed_edges);
        if support != actual {
            definition_mismatch += 1;
        }
        setup_cache.insert(id, (support, actual));
        actual
    };

    // MEGAMINX_3SEC_CALL_LEVEL_FIXED_FILTER_VALIDATION_V2 -- pure
    // diagnostic: unlike touches_fixed_for above (memoized only over
    // setup paths the LIBRARY actually references), this walks the BFS's
    // ENTIRE reachable-map output -- the one thing genuinely computable
    // BEFORE the library scan even starts, since it depends only on
    // build_reachable_impl's own result, not on the library. Tells us
    // whether "every setup path this call could possibly use touches a
    // fixed position" is knowable ahead of the 4,160-pair scan it might
    // let a future (not-this-Sprint) design skip.
    let full_reachable_touch_stats = |reachable: &ReachableIndex| -> (bool, u32, u32) {
        let mut touches_count = 0u32;
        let total = reachable.key_to_id.len() as u32;
        for &id in reachable.key_to_id.values() {
            let path = reconstruct(reachable, id);
            if !fixed_ok(&apply_seq(state, &path), fixed_corners, fixed_edges) {
                touches_count += 1;
            }
        }
        (total > 0 && touches_count == total, touches_count, total)
    };

    // MEGAMINX_3SEC_PAIR_ANCHOR_EXHAUSTION_ANALYSIS_V1 -- pure diagnostic
    // counters for the matching loop below (separate from build_reachable_impl's
    // own BFS-side counters): pairs_visited counts (commutator, anchor)
    // iterations actually taken (same iteration the loop always did; just
    // tallied), candidates_hit counts how many of those had a matching
    // reachable key (i.e. reached try_candidate), and success_visit_index/
    // success_key_discovery_id capture, on a hit, how far into the scan
    // (and how early/late in the BFS's OWN discovery order) the winning
    // candidate was found. None of these are read by the loop itself.
    let mut pairs_visited: u32 = 0;
    let mut candidates_hit: u32 = 0;
    let mut success_visit_index: i32 = -1;
    let mut success_key_discovery_id: i32 = -1;
    let mut winning_support_size: i32 = -1;

    let (found, anchor_mode, log_pieces, log_max_depth, log_max_reachable, reachable_len, all_touch_full, full_touches_count, full_reachable_size) = if displaced == target {
        let reachable = build_reachable_impl(state, kind, &[target as i8], 9, 300_000);
        let (all_touch_full, full_touches_count, full_reachable_size) = full_reachable_touch_stats(&reachable);
        let mut result = None;
        'search: for c in library {
            let support_le6 = c.support.len() <= 6;
            for &anchor in &c.moving_support {
                pairs_visited += 1;
                if support_le6 { attempted_le6 += 1 } else { attempted_gt6 += 1 }
                let Some(&id) = reachable.key_to_id.get(&(anchor as u64)) else { continue };
                candidates_hit += 1;
                let s_path = reconstruct(&reachable, id);
                let touches = touches_fixed_for(id, &s_path);
                if let Some(hit) = try_candidate(&s_path, c, touches, support_le6) {
                    result = Some(hit);
                    success_visit_index = pairs_visited as i32;
                    success_key_discovery_id = id as i32;
                    winning_support_size = c.support.len() as i32;
                    break 'search;
                }
            }
        }
        let len = reachable.key_to_id.len() as u32;
        (result, 0u8, vec![target as i8], 9u32, 300_000u32, len, all_touch_full, full_touches_count, full_reachable_size)
    } else {
        let mut pieces = [target as i8, displaced as i8];
        pieces.sort();
        let reachable = build_reachable_impl(state, kind, &pieces, 11, 300_000);
        let (all_touch_full, full_touches_count, full_reachable_size) = full_reachable_touch_stats(&reachable);
        let mut result = None;
        'search2: for c in library {
            let support_le6 = c.support.len() <= 6;
            for &anchor in &c.moving_support {
                let dest = c.destination[anchor as usize];
                if dest == anchor {
                    continue;
                }
                pairs_visited += 1;
                if support_le6 { attempted_le6 += 1 } else { attempted_gt6 += 1 }
                let key = if target <= displaced { anchor as u64 * 30 + dest as u64 } else { dest as u64 * 30 + anchor as u64 };
                let Some(&id) = reachable.key_to_id.get(&key) else { continue };
                candidates_hit += 1;
                let s_path = reconstruct(&reachable, id);
                let touches = touches_fixed_for(id, &s_path);
                if let Some(hit) = try_candidate(&s_path, c, touches, support_le6) {
                    result = Some(hit);
                    success_visit_index = pairs_visited as i32;
                    success_key_discovery_id = id as i32;
                    winning_support_size = c.support.len() as i32;
                    break 'search2;
                }
            }
        }
        let len = reachable.key_to_id.len() as u32;
        (result, 1u8, pieces.to_vec(), 11u32, 300_000u32, len, all_touch_full, full_touches_count, full_reachable_size)
    };
    let unique_setup_paths = setup_cache.len() as u32;
    log_reach_call(
        &state, kind, &log_pieces, anchor_mode, log_max_depth, log_max_reachable, reachable_len,
        pairs_visited, candidates_hit, success_visit_index, success_key_discovery_id, reject_fixed_ok_fail, reject_blocked,
        cross_touches_reject, cross_touches_pass, cross_not_touches_reject, cross_not_touches_pass, definition_mismatch, unique_setup_paths,
        all_touch_full, full_touches_count, full_reachable_size,
        winning_support_size, attempted_le6, attempted_gt6, fixedfail_le6, fixedfail_gt6, blocked_le6, blocked_gt6,
    );

    let Some((result_state, full_seq)) = found else { return -1 };

    let buf = &mut *&raw mut FSA_RESULT_BUF;
    buf.clear();
    buf.extend(result_state.corner_perm.iter().map(|&x| x as u8));
    buf.extend(result_state.corner_orient.iter().map(|&x| x as u8));
    buf.extend(result_state.edge_perm.iter().map(|&x| x as u8));
    buf.extend(result_state.edge_orient.iter().map(|&x| x as u8));
    for (face, sign_negative) in &full_seq {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    full_seq.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn fsa_result_ptr() -> *const u8 {
    (&*&raw const FSA_RESULT_BUF).as_ptr()
}

/// Context findFinishingApplication's own matching loop needs threaded
/// through the recursive permutation search below -- bundled into a
/// struct instead of a long parameter list.
struct FfaContext<'a> {
    sorted_pieces: &'a [i8],
    state: State,
    fixed_corners: &'a [u8],
    fixed_edges: &'a [u8],
    kind: u8,
    wrong_pieces: &'a [i8],
}

/// In-place permutation generation (Steinhaus-Johnson-Trombone via
/// adjacent swaps -- simplest correct variant) with early exit on the
/// first hit, unlike the JS original this replaces (megaminxSolver.ts's
/// own findFinishingApplication) which eagerly built EVERY one of the
/// n! permutations into its own array via `permutations()` before trying
/// any of them -- wasteful given this search misses ~91% of the time
/// (see this module's own upload_library/find_safe_application dev
/// notes), so most calls were paying full n! allocation for nothing.
fn try_permutations(assignment: &mut [i8], k: usize, support: &[u8], seq: &[(u8, bool)], reachable: &ReachableIndex, ctx: &FfaContext) -> Option<(State, Vec<(u8, bool)>)> {
    if k == assignment.len() {
        // piece id is <30, so a flat lookup array beats a HashMap here.
        let mut piece_to_pos = [0u8; 30];
        for i in 0..assignment.len() {
            piece_to_pos[assignment[i] as usize] = support[i];
        }
        let mut key: u64 = 0;
        for &p in ctx.sorted_pieces {
            key = key * 30 + piece_to_pos[p as usize] as u64;
        }
        let Some(&id) = reachable.key_to_id.get(&key) else { return None };
        let s_path = reconstruct(reachable, id);
        let s_inv = invert_seq(&s_path);
        let mut full_seq = Vec::with_capacity(s_path.len() + seq.len() + s_inv.len());
        full_seq.extend_from_slice(&s_path);
        full_seq.extend_from_slice(seq);
        full_seq.extend_from_slice(&s_inv);
        let result_state = apply_seq(ctx.state, &full_seq);
        if !fixed_ok(&result_state, ctx.fixed_corners, ctx.fixed_edges) {
            return None;
        }
        let (rperm, rorient): (&[i8], &[i8]) = if ctx.kind == 0 { (&result_state.corner_perm, &result_state.corner_orient) } else { (&result_state.edge_perm, &result_state.edge_orient) };
        for &piece in ctx.wrong_pieces {
            let p = piece as usize;
            if rperm[p] != piece || rorient[p] != 0 {
                return None;
            }
        }
        return Some((result_state, full_seq));
    }
    for i in k..assignment.len() {
        assignment.swap(k, i);
        let hit = try_permutations(assignment, k + 1, support, seq, reachable, ctx);
        assignment.swap(k, i);
        if hit.is_some() {
            return hit;
        }
    }
    None
}

/// Wasm-backed drop-in for megaminxSolver.ts's own findFinishingApplication
/// (the joint, all-wrong-pieces-at-once exact-finish search): builds its
/// own reachable map (same build_reachable_impl BFS find_safe_application
/// uses) and runs the full commutator/permutation matching loop here
/// instead of round-tripping through JS per (commutator, permutation) pair
/// -- see this module's own Task #34 dev notes (megaminxSolver.ts) for why:
/// profiled directly, this JS-side matching loop was ~21% of a full
/// solve's own time, distinct from (and additional to) buildReachableMap's
/// own share. Reuses find_safe_application's own FSA_RESULT_BUF/
/// fsa_result_ptr for output (never called concurrently with it -- this
/// module is single-threaded). Returns the move count on a hit or -1 on a
/// miss, exactly like find_safe_application.
#[no_mangle]
pub unsafe extern "C" fn find_finishing_application(lib_handle: u32, kind: u8, wrong_positions_len: u32, fixed_corners_len: u32, fixed_edges_len: u32, max_depth: u32, max_reachable: u32) -> i32 {
    let state = read_state_scratch();
    let n = wrong_positions_len as usize;
    let wrong_positions = &(&*&raw const PIECES_SCRATCH)[..n];
    let fixed_corners = &(&*&raw const FIXED_CORNERS_SCRATCH)[..fixed_corners_len as usize];
    let fixed_edges = &(&*&raw const FIXED_EDGES_SCRATCH)[..fixed_edges_len as usize];

    let perm: &[i8] = if kind == 0 { &state.corner_perm } else { &state.edge_perm };
    let mut wrong_pieces_buf = [0i8; 8];
    for i in 0..n {
        wrong_pieces_buf[i] = perm[wrong_positions[i] as usize];
    }
    let wrong_pieces = &wrong_pieces_buf[..n];
    let mut sorted_pieces_buf = [0i8; 8];
    sorted_pieces_buf[..n].copy_from_slice(wrong_pieces);
    sorted_pieces_buf[..n].sort_unstable();
    let sorted_pieces = &sorted_pieces_buf[..n];

    let reachable = build_reachable_impl(state, kind, wrong_pieces, max_depth, max_reachable);
    // find_finishing_application's own matching (try_permutations) is a
    // recursive permutation search, not the simple linear scan
    // find_safe_application's two branches use -- no equivalent
    // pairs_visited/candidates_hit concept to report, hence the 0/0/-1/-1
    // placeholders (see REACH_LOG's own dev notes).
    log_reach_call(&state, kind, wrong_pieces, 2, max_depth, max_reachable, reachable.key_to_id.len() as u32, 0, 0, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, false, 0, 0, -1, 0, 0, 0, 0, 0, 0);
    let library = &(&*&raw const LIBRARIES)[lib_handle as usize];
    let ctx = FfaContext { sorted_pieces, state, fixed_corners, fixed_edges, kind, wrong_pieces };

    let mut assignment_buf = [0i8; 8];
    assignment_buf[..n].copy_from_slice(wrong_pieces);
    let assignment = &mut assignment_buf[..n];

    let mut found: Option<(State, Vec<(u8, bool)>)> = None;
    for c in library {
        if c.support.len() != n {
            continue;
        }
        if let Some(hit) = try_permutations(assignment, 0, &c.support, &c.seq, &reachable, &ctx) {
            found = Some(hit);
            break;
        }
    }

    let Some((result_state, full_seq)) = found else { return -1 };

    let buf = &mut *&raw mut FSA_RESULT_BUF;
    buf.clear();
    buf.extend(result_state.corner_perm.iter().map(|&x| x as u8));
    buf.extend(result_state.corner_orient.iter().map(|&x| x as u8));
    buf.extend(result_state.edge_perm.iter().map(|&x| x as u8));
    buf.extend(result_state.edge_orient.iter().map(|&x| x as u8));
    for (face, sign_negative) in &full_seq {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    full_seq.len() as i32
}

// ---------------------------------------------------------------------
// solveCross, ported whole -- a deliberately SMALL, self-contained pilot
// for "port solve-level control flow into Wasm, not just search
// primitives" before committing to the rest of the pipeline (solveFirstLayer
// through solveMegaminx). If this doesn't show a further win worth the
// risk of re-deriving already-hard-won correctness fixes in Rust, the
// rest of the pipeline stays in JS.
//
// Mirrors megaminxSolver.ts's own bidirectionalSearch + crossKey
// (edgeStateKeyFor) exactly: meet-in-the-middle BFS from `state` to
// SOLVED, keyed by 5 edges' own (position, orientation) packed base-60
// (see compute_edge_state_key below, identical packing to
// wasm-search's own compute_key but base-60 with orientation folded in).
// ---------------------------------------------------------------------

fn compute_edge_state_key(state: &State, pieces: &[i8]) -> u64 {
    let n = pieces.len();
    // Same O(30) piece-id -> slot lookup table as compute_key above,
    // instead of a per-position O(n) linear scan through `pieces`.
    let mut slot_for_piece = [-1i8; 30];
    for i in 0..n {
        slot_for_piece[pieces[i] as usize] = i as i8;
    }
    let mut positions = [0i8; 8];
    let mut remaining = n;
    for pos in 0..30 {
        if remaining == 0 {
            break;
        }
        let slot = slot_for_piece[state.edge_perm[pos] as usize];
        if slot >= 0 {
            positions[slot as usize] = pos as i8;
            remaining -= 1;
        }
    }
    let mut key: u64 = 0;
    for i in 0..n {
        key = key * 60 + positions[i] as u64 * 2 + state.edge_orient[positions[i] as usize] as u64;
    }
    key
}

/// One direction's own parent-pointer search tree (see build_reachable_impl's
/// own dev notes on why states travel only in the frontier, not a global Vec).
struct Tree {
    key_to_id: FastMap<u64, u32>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
}

impl Tree {
    fn new(state: State, key: u64) -> (Tree, Vec<(State, u32)>) {
        let mut key_to_id: FastMap<u64, u32> = FastMap::default();
        key_to_id.insert(key, 0u32);
        let tree = Tree { key_to_id, parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
        (tree, vec![(state, 0)])
    }

    /// Path from this tree's own root to `id`, in root-to-id move order.
    fn reconstruct(&self, id: u32) -> Vec<(u8, bool)> {
        let mut moves = Vec::new();
        let mut cur = id as i32;
        while self.parent[cur as usize] != -1 {
            moves.push((self.move_face[cur as usize], self.move_sign_negative[cur as usize]));
            cur = self.parent[cur as usize];
        }
        moves.reverse();
        moves
    }
}

fn invert_pairs(seq: &[(u8, bool)]) -> Vec<(u8, bool)> {
    seq.iter().rev().map(|&(face, sign_negative)| (face, !sign_negative)).collect()
}

// ---------------------------------------------------------------------
// MEGAMINX_SOLVECROSS_COMPLETENESS_V1 -- pure diagnostic instrumentation
// (no algorithm/control-flow change) for solve_cross's own bidirectional
// search: a failure census to determine WHY a call fails within
// max_half_depth, not just THAT it fails. Read via cross_log_ptr/
// cross_log_count, cleared via cross_log_reset; never read internally by
// any production logic.
// ---------------------------------------------------------------------
#[derive(Clone, Copy, Default)]
struct CrossStats {
    found: bool,
    solution_length: u32,
    forward_rounds: u32,
    backward_rounds: u32,
    forward_final_size: u32,
    backward_final_size: u32,
    total_generated: u32,
    total_accepted: u32,
    meeting_attempts: u32,
    termination_reason: u32, // 0=meet_found, 1=frontier_exceeded, 2=rounds_exhausted
    rounds_completed: u32,
    round_side_bitmask: u64, // bit i = 1 -> round i expanded backward, 0 -> forward
    round_new_counts: [u32; 16],
}
static mut LAST_CROSS_STATS: CrossStats = CrossStats {
    found: false,
    solution_length: 0,
    forward_rounds: 0,
    backward_rounds: 0,
    forward_final_size: 0,
    backward_final_size: 0,
    total_generated: 0,
    total_accepted: 0,
    meeting_attempts: 0,
    termination_reason: 0,
    rounds_completed: 0,
    round_side_bitmask: 0,
    round_new_counts: [0; 16],
};

/// 32 u64 words/record: [state_hash, max_half_depth, max_frontier_size,
/// pieces_len, found, solution_length, forward_rounds, backward_rounds,
/// forward_final_size, backward_final_size, total_generated,
/// total_accepted, meeting_attempts, termination_reason, rounds_completed,
/// round_side_bitmask, round_new_counts[16]].
static mut CROSS_LOG: Vec<u64> = Vec::new();

#[allow(clippy::too_many_arguments)]
fn log_cross_call(state: &State, max_half_depth: u32, max_frontier_size: u32, pieces_len: u32) {
    let log = unsafe { &mut *&raw mut CROSS_LOG };
    let s = unsafe { LAST_CROSS_STATS };
    log.push(hash_state(state));
    log.push(max_half_depth as u64);
    log.push(max_frontier_size as u64);
    log.push(pieces_len as u64);
    log.push(if s.found { 1 } else { 0 });
    log.push(s.solution_length as u64);
    log.push(s.forward_rounds as u64);
    log.push(s.backward_rounds as u64);
    log.push(s.forward_final_size as u64);
    log.push(s.backward_final_size as u64);
    log.push(s.total_generated as u64);
    log.push(s.total_accepted as u64);
    log.push(s.meeting_attempts as u64);
    log.push(s.termination_reason as u64);
    log.push(s.rounds_completed as u64);
    log.push(s.round_side_bitmask);
    for i in 0..16 {
        log.push(s.round_new_counts[i] as u64);
    }
}

#[no_mangle]
pub unsafe extern "C" fn cross_log_count() -> u32 {
    ((&*&raw const CROSS_LOG).len() / 32) as u32
}

#[no_mangle]
pub unsafe extern "C" fn cross_log_ptr() -> *const u64 {
    (&*&raw const CROSS_LOG).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn cross_log_reset() {
    (&mut *&raw mut CROSS_LOG).clear();
}

fn bidirectional_search_impl(state: State, target: State, pieces: &[i8], max_half_depth: u32, max_frontier_size: u32) -> Option<Vec<(u8, bool)>> {
    let target_key = compute_edge_state_key(&target, pieces);
    let (mut forward, mut forward_frontier) = Tree::new(state, compute_edge_state_key(&state, pieces));
    let (mut backward, mut backward_frontier) = Tree::new(target, target_key);

    // Diagnostic-only locals (MEGAMINX_SOLVECROSS_COMPLETENESS_V1) -- read
    // by log_cross_call via LAST_CROSS_STATS after this function returns,
    // never influence a single branch/return of the actual search below.
    let mut forward_rounds: u32 = 0;
    let mut backward_rounds: u32 = 0;
    let mut total_generated: u32 = 0;
    let mut total_accepted: u32 = 0;
    let mut meeting_attempts: u32 = 0;
    let mut round_side_bitmask: u64 = 0;
    let mut round_new_counts: [u32; 16] = [0; 16];

    #[allow(clippy::too_many_arguments)]
    fn write_stats(
        found: bool, solution_length: u32, termination_reason: u32, rounds_completed: u32, forward_rounds: u32, backward_rounds: u32,
        total_generated: u32, total_accepted: u32, meeting_attempts: u32, round_side_bitmask: u64, round_new_counts: [u32; 16], forward: &Tree, backward: &Tree,
    ) {
        unsafe {
            LAST_CROSS_STATS = CrossStats {
                found,
                solution_length,
                forward_rounds,
                backward_rounds,
                forward_final_size: forward.key_to_id.len() as u32,
                backward_final_size: backward.key_to_id.len() as u32,
                total_generated,
                total_accepted,
                meeting_attempts,
                termination_reason,
                rounds_completed,
                round_side_bitmask,
                round_new_counts,
            };
        }
    }

    let try_meet = |forward: &Tree, backward: &Tree| -> Option<Vec<(u8, bool)>> {
        for (&key, &fid) in &forward.key_to_id {
            if let Some(&bid) = backward.key_to_id.get(&key) {
                let mut joined = forward.reconstruct(fid);
                joined.extend(invert_pairs(&backward.reconstruct(bid)));
                return Some(joined);
            }
        }
        None
    };

    meeting_attempts += 1;
    if let Some(m) = try_meet(&forward, &backward) {
        let len = m.len() as u32;
        write_stats(true, len, 0, 0, forward_rounds, backward_rounds, total_generated, total_accepted, meeting_attempts, round_side_bitmask, round_new_counts, &forward, &backward);
        return Some(m);
    }

    // Reused scratch buffer for whichever side gets expanded this round
    // (only one of forward_frontier/backward_frontier is ever replaced
    // per round) -- .clear() keeps its already-grown capacity instead of
    // allocating a fresh Vec every round the way a `let mut next =
    // Vec::new()` inside the loop would.
    let mut next: Vec<(State, u32)> = Vec::new();
    for round in 0..max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.key_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        if round < 64 { round_side_bitmask |= (if expand_forward { 0u64 } else { 1u64 }) << round }
        let mut accepted_this_round: u32 = 0;
        let (tree, frontier): (&mut Tree, &[(State, u32)]) = if expand_forward { (&mut forward, &forward_frontier) } else { (&mut backward, &backward_frontier) };
        next.clear();
        for &(base_state, id) in frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    let child = apply_move(&base_state, face, sign_negative);
                    let key = compute_edge_state_key(&child, pieces);
                    total_generated += 1;
                    if tree.key_to_id.contains_key(&key) {
                        continue;
                    }
                    if (next.len() as u32) >= max_frontier_size {
                        // Matches the JS version's own per-LEVEL cap
                        // exactly: `next.size` there is a fresh Map built
                        // THIS round, not the tree's cumulative total --
                        // capping against key_to_id.len() (the running
                        // total) instead would trip this far too early on
                        // any search whose cumulative discovered-key count
                        // simply grows past max_frontier_size over many
                        // rounds, even though no single round ever came
                        // close to that many NEW keys.
                        total_accepted += accepted_this_round;
                        if (round as usize) < 16 { round_new_counts[round as usize] = accepted_this_round }
                        write_stats(false, u32::MAX, 1, round, forward_rounds, backward_rounds, total_generated, total_accepted, meeting_attempts, round_side_bitmask, round_new_counts, &forward, &backward);
                        return None;
                    }
                    let child_id = tree.parent.len() as u32;
                    // Backward tree records moves in the SAME root-to-node
                    // order as forward (see Tree::reconstruct's own doc) --
                    // the meet-in-the-middle logic inverts the backward
                    // side's own path once, at the very end, not per move.
                    tree.key_to_id.insert(key, child_id);
                    tree.parent.push(id as i32);
                    tree.move_face.push(face);
                    tree.move_sign_negative.push(sign_negative);
                    next.push((child, child_id));
                    accepted_this_round += 1;
                }
            }
        }
        total_accepted += accepted_this_round;
        if (round as usize) < 16 { round_new_counts[round as usize] = accepted_this_round }
        if expand_forward {
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            std::mem::swap(&mut backward_frontier, &mut next);
        }
        meeting_attempts += 1;
        if let Some(m) = try_meet(&forward, &backward) {
            let len = m.len() as u32;
            write_stats(true, len, 0, round + 1, forward_rounds, backward_rounds, total_generated, total_accepted, meeting_attempts, round_side_bitmask, round_new_counts, &forward, &backward);
            return Some(m);
        }
    }
    write_stats(false, u32::MAX, 2, max_half_depth, forward_rounds, backward_rounds, total_generated, total_accepted, meeting_attempts, round_side_bitmask, round_new_counts, &forward, &backward);
    None
}

static mut SOLVE_RESULT_BUF: Vec<u8> = Vec::new();

/// `pieces_len` piece ids live in PIECES_SCRATCH (sorted ascending, same
/// contract as build_reachable's own pieces input). Current state comes
/// from STATE_SCRATCH; the search target is always the solved state.
/// Returns the solution's move count (>=0, result readable via
/// solve_result_ptr(), 2 bytes/move: face, signNegative as 0/1) or -1 if
/// no solution was found within max_half_depth/max_frontier_size.
#[no_mangle]
pub unsafe extern "C" fn solve_cross(pieces_len: u32, max_half_depth: u32, max_frontier_size: u32) -> i32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let result = bidirectional_search_impl(state, solved_state(), &pieces[..pieces_len as usize], max_half_depth, max_frontier_size);
    log_cross_call(&state, max_half_depth, max_frontier_size, pieces_len);
    let Some(moves) = result else {
        return -1;
    };
    let buf = &mut *&raw mut SOLVE_RESULT_BUF;
    buf.clear();
    for (face, sign_negative) in &moves {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn solve_result_ptr() -> *const u8 {
    (&*&raw const SOLVE_RESULT_BUF).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1 -- isolated Rust port
// of the JS-validated backward-only C5 symmetry canonicalization candidate
// (solveCrossBackwardSymmetryCandidate.bench.test.ts's own candidateSearch).
// A fully separate function + export pair: does NOT touch solve_cross,
// bidirectional_search_impl, or the production maxHalfDepth=12 default in
// any way. Forward stays completely raw (identical semantics to
// bidirectional_search_impl's own forward side); only backward is
// deduplicated by ORBIT (canonical key = min raw edge-state key over the
// 5 face-0-stabilizer symmetry images, see canonical_key below).
//
// All numeric constants below (PI_F_INV_POWERS, SIGMA, SIGMA_INV) are
// copied verbatim from the already-validated JS computation
// (solveCrossSymmetryFeasibility.bench.test.ts's own deriveSymmetryTable /
// buildConjugationContext, themselves derived via direct geometric
// simulation against THREE.js) -- this module has no geometry engine to
// re-derive them with, so they are ported as data, not re-derived. Every
// mathematical property they're supposed to satisfy (fixes SOLVED,
// order-5, sequence-conjugation via pi_F^{-1}) is re-checked in Rust by
// sym_selftest below, so a transcription error here would be caught, not
// silently trusted.
//
// Memory note: unlike the JS prototype (which stores each node's own full
// MegaminxState), neither tree here keeps full states for anything but
// the current frontier -- same "states travel only through the frontier"
// discipline as bidirectional_search_impl/build_reachable_impl. The one
// case that needs a full state outside the frontier (the winning forward
// node, at meeting time, to run find_symmetry_index) recomputes it by
// replaying its own path from the root via apply_seq -- deterministic and
// bit-identical to keeping the state around, just computed once (the
// search returns immediately on the first hit) instead of stored per node.
// =======================================================================

const PI_F_INV_POWERS: [[u8; 12]; 5] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 2, 6, 4, 7, 9, 5, 11, 3, 1, 10, 8],
    [0, 6, 5, 7, 11, 1, 9, 8, 4, 2, 10, 3],
    [0, 5, 9, 11, 8, 2, 1, 3, 7, 6, 10, 4],
    [0, 9, 1, 8, 3, 6, 2, 4, 11, 5, 10, 7],
];

/// piFInv^{-j} = piFInv^{(5-j)%5} -- the power needed to translate a
/// canonical-frame match back to F's own real frame (see
/// solveCrossBackwardSymmetryCandidate.bench.test.ts's own conjPowerForJ).
const CONJ_POWER_FOR_J: [usize; 5] = [0, 4, 3, 2, 1];

const SIGMA: State = State {
    corner_perm: [16, 3, 10, 15, 12, 9, 4, 19, 0, 11, 8, 7, 17, 6, 1, 18, 2, 13, 14, 5],
    corner_orient: [0, 2, 0, 1, 2, 2, 1, 1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 1, 2, 0],
    edge_perm: [4, 0, 1, 2, 3, 9, 10, 11, 5, 21, 22, 15, 16, 17, 12, 20, 23, 24, 8, 27, 28, 18, 19, 26, 29, 13, 14, 6, 7, 25],
    edge_orient: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1],
};

const SIGMA_INV: State = State {
    corner_perm: [8, 14, 16, 1, 6, 19, 13, 11, 10, 5, 2, 9, 4, 17, 18, 3, 0, 12, 15, 7],
    corner_orient: [0, 0, 0, 1, 2, 0, 1, 0, 0, 1, 0, 0, 1, 2, 1, 2, 0, 0, 2, 2],
    edge_perm: [1, 2, 3, 4, 0, 8, 27, 28, 18, 5, 6, 7, 14, 25, 26, 11, 12, 13, 21, 22, 15, 9, 10, 16, 17, 29, 23, 19, 20, 24],
    edge_orient: [0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1],
};

/// Generic A-then-B composition: result[pos] = A[B.perm[pos]], orientation
/// mod-added (A's own orientation at B's source position, plus B's own
/// delta at pos) -- identical formula to apply_move, just against a full
/// State operand (B) instead of a MOVE_TABLE slice, since a MegaminxState
/// is itself formally a transform from solved (see this Sprint's own
/// composeTransforms in solveCrossSymmetryFeasibility.bench.test.ts).
fn compose_transforms(a: &State, b: &State) -> State {
    let mut out = SOLVED;
    for pos in 0..20 {
        let from = b.corner_perm[pos] as usize;
        out.corner_perm[pos] = a.corner_perm[from];
        let sum = a.corner_orient[from] + b.corner_orient[pos];
        out.corner_orient[pos] = if sum >= 3 { sum - 3 } else { sum };
    }
    for pos in 0..30 {
        let from = b.edge_perm[pos] as usize;
        out.edge_perm[pos] = a.edge_perm[from];
        out.edge_orient[pos] = (a.edge_orient[from] + b.edge_orient[pos]) & 1;
    }
    out
}

/// True two-sided conjugation sigma . S . sigma^-1 -- fixes SOLVED (unlike
/// the right-multiplication `S . sigma` the earlier Feasibility Sprint
/// used, which does NOT fix SOLVED -- the false-solve bug that distinction
/// caused in the JS prototype before it was caught and fixed, see this
/// file's own MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1 dev
/// history in the bench test this ports).
fn conjugate_state(state: &State) -> State {
    compose_transforms(&compose_transforms(&SIGMA, state), &SIGMA_INV)
}

/// min over k=0..4 of compute_edge_state_key(conjugateState^k(state)) -- a
/// genuine orbit label (proven orbit-invariant in the JS prototype, 0
/// mismatches across 50x4 trials) on cross-substates specifically.
fn canonical_key(state: &State, pieces: &[i8]) -> u64 {
    let mut best = compute_edge_state_key(state, pieces);
    let mut cur = *state;
    for _ in 0..4 {
        cur = conjugate_state(&cur);
        let k = compute_edge_state_key(&cur, pieces);
        if k < best {
            best = k;
        }
    }
    best
}

/// Finds j in 0..4 with key(conjugateState^j(f_state)) == target_key
/// exactly. A canonical-key match guarantees some j exists; a missing hit
/// here would be a soundness bug (mirrors
/// solveCrossBackwardSymmetryCandidate.bench.test.ts's own
/// findSymmetryIndex, which throws on this same condition).
fn find_symmetry_index(f_state: &State, target_key: u64, pieces: &[i8]) -> usize {
    let mut cur = *f_state;
    for j in 0..5 {
        if compute_edge_state_key(&cur, pieces) == target_key {
            return j;
        }
        cur = conjugate_state(&cur);
    }
    panic!("find_symmetry_index: no matching power found -- canonical-key match without a real match");
}

fn conjugate_seq(seq: &[(u8, bool)], pi_pow: &[u8; 12]) -> Vec<(u8, bool)> {
    seq.iter().map(|&(face, sign_negative)| (pi_pow[face as usize], sign_negative)).collect()
}

fn reconstruct_generic(parent: &[i32], move_face: &[u8], move_sign_negative: &[bool], id: u32) -> Vec<(u8, bool)> {
    let mut moves = Vec::new();
    let mut cur = id as i32;
    while parent[cur as usize] != -1 {
        moves.push((move_face[cur as usize], move_sign_negative[cur as usize]));
        cur = parent[cur as usize];
    }
    moves.reverse();
    moves
}

/// Forward's own raw dedup index (unchanged semantics from
/// bidirectional_search_impl's own Tree), plus a parallel canon_key[id]
/// array -- forward never dedups by canonical key, it only needs to know
/// each of its own node's canonical label to look itself up in backward's
/// canonical table at meeting time.
struct SymForwardTree {
    key_to_id: FastMap<u64, u32>,
    canon_key: Vec<u64>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
}

/// Backward's own dedup index is keyed by CANONICAL key (the orbit
/// reduction) -- real_key[id] is the one representative real state's own
/// raw key, kept so meeting-time path conjugation knows exactly which
/// symmetry image of the forward state landed on this representative.
struct SymBackwardTree {
    canon_to_id: FastMap<u64, u32>,
    real_key: Vec<u64>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
}

#[derive(Clone, Copy, Default)]
struct SymCandidateStats {
    found: bool,
    solution_length: u32,
    forward_rounds: u32,
    backward_rounds: u32,
    forward_final_size: u32,
    backward_canonical_final_size: u32,
    meeting_attempts: u32,
    termination_reason: u32, // 0=meet_found, 1=frontier_exceeded, 2=rounds_exhausted
    rounds_completed: u32,
    peak_forward_frontier: u32,
    peak_backward_frontier: u32,
}

fn symmetry_candidate_search_impl(root: State, target: State, pieces: &[i8], max_half_depth: u32, max_frontier_size: u32) -> (Option<Vec<(u8, bool)>>, SymCandidateStats) {
    let root_key = compute_edge_state_key(&root, pieces);
    let root_canon = canonical_key(&root, pieces);
    let mut forward = SymForwardTree { key_to_id: FastMap::default(), canon_key: vec![root_canon], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    forward.key_to_id.insert(root_key, 0);

    let target_key = compute_edge_state_key(&target, pieces);
    let target_canon = canonical_key(&target, pieces);
    let mut backward = SymBackwardTree { canon_to_id: FastMap::default(), real_key: vec![target_key], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    backward.canon_to_id.insert(target_canon, 0);

    let mut forward_frontier: Vec<(State, u32)> = vec![(root, 0)];
    let mut backward_frontier: Vec<(State, u32)> = vec![(target, 0)];

    let mut forward_rounds: u32 = 0;
    let mut backward_rounds: u32 = 0;
    let mut meeting_attempts: u32 = 0;
    let mut peak_forward_frontier: u32 = 1;
    let mut peak_backward_frontier: u32 = 1;

    // Only ever invoked immediately before a return (either on the actual
    // hit, or -- when it misses -- as a no-op scan run once per round), so
    // the apply_seq replay it performs on a hit to recover F's own full
    // state (never otherwise stored, see this block's own top comment)
    // costs at most one path-length's worth of moves, not a per-node cost.
    let try_meet = |forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]| -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    };

    macro_rules! stats_at {
        ($found:expr, $len:expr, $term:expr, $rounds_completed:expr) => {
            SymCandidateStats {
                found: $found,
                solution_length: $len,
                forward_rounds,
                backward_rounds,
                forward_final_size: forward.key_to_id.len() as u32,
                backward_canonical_final_size: backward.canon_to_id.len() as u32,
                meeting_attempts,
                termination_reason: $term,
                rounds_completed: $rounds_completed,
                peak_forward_frontier,
                peak_backward_frontier,
            }
        };
    }

    meeting_attempts += 1;
    if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
        let len = m.len() as u32;
        return (Some(m), stats_at!(true, len, 0, 0));
    }

    let mut next: Vec<(State, u32)> = Vec::new();
    for round in 0..max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.canon_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, round));
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let canon = canonical_key(&child, pieces);
                        if backward.canon_to_id.contains_key(&canon) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, round));
                        }
                        let child_id = backward.parent.len() as u32;
                        let child_key = compute_edge_state_key(&child, pieces);
                        backward.canon_to_id.insert(canon, child_id);
                        backward.real_key.push(child_key);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        meeting_attempts += 1;
        if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
            let len = m.len() as u32;
            return (Some(m), stats_at!(true, len, 0, round + 1));
        }
    }

    (None, stats_at!(false, u32::MAX, 2, max_half_depth))
}

static mut SYM_RESULT_BUF: Vec<u8> = Vec::new();
static mut LAST_SYM_STATS_WORDS: [u32; 11] = [0; 11];

fn write_last_sym_stats(stats: &SymCandidateStats) {
    unsafe {
        LAST_SYM_STATS_WORDS = [
            if stats.found { 1 } else { 0 },
            stats.solution_length,
            stats.forward_rounds,
            stats.backward_rounds,
            stats.forward_final_size,
            stats.backward_canonical_final_size,
            stats.meeting_attempts,
            stats.termination_reason,
            stats.rounds_completed,
            stats.peak_forward_frontier,
            stats.peak_backward_frontier,
        ];
    }
}

/// `pieces_len` piece ids live in PIECES_SCRATCH, current state in
/// STATE_SCRATCH -- same contract as solve_cross (reuses the same scratch
/// buffers; never called concurrently with it, this module is
/// single-threaded). Returns the solution's move count (>=0, readable via
/// sym_result_ptr(), 2 bytes/move: face, signNegative as 0/1) or -1 if no
/// solution was found within max_half_depth/max_frontier_size. Per-call
/// stats readable via sym_stats_ptr() immediately after.
#[no_mangle]
pub unsafe extern "C" fn solve_cross_symmetry_candidate(pieces_len: u32, max_half_depth: u32, max_frontier_size: u32) -> i32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let (result, stats) = symmetry_candidate_search_impl(state, solved_state(), &pieces[..pieces_len as usize], max_half_depth, max_frontier_size);
    write_last_sym_stats(&stats);
    let Some(moves) = result else {
        return -1;
    };
    let buf = &mut *&raw mut SYM_RESULT_BUF;
    buf.clear();
    for (face, sign_negative) in &moves {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn sym_result_ptr() -> *const u8 {
    (&*&raw const SYM_RESULT_BUF).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn sym_stats_ptr() -> *const u32 {
    (&raw const LAST_SYM_STATS_WORDS) as *const u32
}

// ---------------------------------------------------------------------
// Gate A -- Rust-side re-verification of the ported symmetry math's own
// algebraic properties (SOLVED-invariance, order-5, sequence-conjugation
// via pi_F^{-1}), run purely in Rust against the SAME MOVE_TABLE the JS
// host already loaded via init_move_table (no geometry re-derivation, no
// dependency on JS-side randomness -- a self-contained xorshift32 PRNG
// generates the trial move sequences). Exists so a transcription error in
// SIGMA/SIGMA_INV/PI_F_INV_POWERS above would be caught here, not trusted
// silently just because it was copied from an already-validated source.
// ---------------------------------------------------------------------
struct XorShift32(u32);
impl XorShift32 {
    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    fn next_face(&mut self) -> u8 {
        (self.next_u32() % 12) as u8
    }
    fn next_sign_negative(&mut self) -> bool {
        self.next_u32() % 2 == 0
    }
}

fn random_seq(rng: &mut XorShift32, len: usize) -> Vec<(u8, bool)> {
    (0..len).map(|_| (rng.next_face(), rng.next_sign_negative())).collect()
}

static mut SYM_SELFTEST_RESULT: [u32; 4] = [0; 4];

/// Runs the 4 Gate-A checks with the given trial counts and writes pass
/// counts (out of each requested trial count) to SYM_SELFTEST_RESULT,
/// readable via sym_selftest_result_ptr(): [solved_invariant, order5,
/// sequence_conjugation, move_conjugation].
#[no_mangle]
pub unsafe extern "C" fn sym_selftest(trials_invariant: u32, trials_order5: u32, trials_seqconj: u32, trials_moveconj: u32) {
    let mut rng = XorShift32(0x9E37_79B9);
    let mut pass = [0u32; 4];

    for _ in 0..trials_invariant {
        if conjugate_state(&solved_state()) == solved_state() {
            pass[0] += 1;
        }
    }

    for _ in 0..trials_order5 {
        let len = 3 + (rng.next_u32() % 20) as usize;
        let seq = random_seq(&mut rng, len);
        let s = apply_seq(solved_state(), &seq);
        let mut cur = s;
        for _ in 0..5 {
            cur = conjugate_state(&cur);
        }
        if cur == s {
            pass[1] += 1;
        }
    }

    for _ in 0..trials_seqconj {
        let len = 1 + (rng.next_u32() % 15) as usize;
        let seq = random_seq(&mut rng, len);
        let lhs = conjugate_state(&apply_seq(solved_state(), &seq));
        let relabeled = conjugate_seq(&seq, &PI_F_INV_POWERS[1]);
        let rhs = apply_seq(solved_state(), &relabeled);
        if lhs == rhs {
            pass[2] += 1;
        }
    }

    for _ in 0..trials_moveconj {
        let seq = [(rng.next_face(), rng.next_sign_negative())];
        let lhs = conjugate_state(&apply_seq(solved_state(), &seq));
        let relabeled = conjugate_seq(&seq, &PI_F_INV_POWERS[1]);
        let rhs = apply_seq(solved_state(), &relabeled);
        if lhs == rhs {
            pass[3] += 1;
        }
    }

    SYM_SELFTEST_RESULT = pass;
}

#[no_mangle]
pub unsafe extern "C" fn sym_selftest_result_ptr() -> *const u32 {
    (&raw const SYM_SELFTEST_RESULT) as *const u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_SYMMETRY_FALLBACK_SHARED_FORWARD_V1 -- isolated
// experiment: does reusing depth12's own (raw, failed) forward tree as
// the starting point for the depth13+symmetry candidate's own forward
// side eliminate the duplicate forward-generation cost the SEQUENTIAL
// fallback (solve_cross(depth12), then on failure
// solve_cross_symmetry_candidate(depth13) from a completely fresh
// forward) currently pays?
//
// Forward's own expansion is provably independent of what backward is
// doing -- it only depends on its own round count (apply_move + raw-key
// dedup, nothing about backward's contents) -- so a forward tree built
// during a FAILED depth12 attempt is bit-for-bit the same tree the
// candidate's own forward side would independently build, PROVIDED it
// reaches the same round count. This module tests that reuse directly,
// as a fully separate function chain: it does NOT touch solve_cross,
// bidirectional_search_impl, or solve_cross_symmetry_candidate, and is
// NOT wired into production (megaminxSolver.ts is not touched by this
// Sprint at all).
//
// Design: phase 1 is a structural copy of bidirectional_search_impl's own
// round loop (same round cap, same frontier cap, same expand-smaller-side
// policy, backward stays completely plain/raw -- a REAL depth12-equivalent
// meeting check), with exactly one behavioral addition: forward's own
// tree ALSO tracks canon_key per node (SymForwardTree instead of a plain
// Tree), computed at the same moment each forward node is created. This
// is a small, constant per-node "insurance premium" paid whether or not
// depth12 ultimately succeeds, in exchange for making a captured forward
// tree immediately reusable by phase 2 with ZERO retrofit cost (retrofitting
// canon_key onto an already-built raw tree afterwards would need every
// node's own State, which this module's whole memory-efficiency
// discipline deliberately never stores outside the frontier -- computing
// canon_key inline, once, as each node is born, is the only way to get it
// without a second full tree walk).
//
// Phase 2 only runs if phase 1 failed via ROUNDS_EXHAUSTED (a FRONTIER_EXCEEDED
// failure is not safely reusable -- the frontier was truncated mid-round,
// so "forward_rounds" wouldn't mean a complete round -- phase 2 is skipped
// in that case, reported as not-reusable rather than silently guessing).
// It builds a completely FRESH canonical backward tree (from SOLVED,
// round 0 -- depth12's own raw backward is discarded, it cannot be reused
// for canonical dedup), keeps forward exactly as inherited, and continues
// the SAME "smaller side expands" interleaving policy for as many more
// rounds as needed to reach the total round budget (default 13, matching
// the validated candidate's own value) -- robust to however many rounds
// depth12's own trajectory happened to give forward (no assumption that
// it's exactly 6), since the interleaving policy naturally tops up
// whichever side needs more.
// =======================================================================

struct Phase1Capture {
    forward: SymForwardTree,
    forward_frontier: Vec<(State, u32)>,
    forward_rounds: u32,
}

struct Phase1Result {
    found: Option<Vec<(u8, bool)>>,
    captured: Option<Phase1Capture>, // Some only on ROUNDS_EXHAUSTED (reusable); None on FRONTIER_EXCEEDED
    forward_rounds: u32,
    backward_rounds: u32,
    peak_forward_frontier: u32,
    peak_backward_frontier: u32,
}

fn phase1_raw_capture_forward_impl(state: State, target: State, pieces: &[i8], max_half_depth: u32, max_frontier_size: u32) -> Phase1Result {
    let root_key = compute_edge_state_key(&state, pieces);
    let root_canon = canonical_key(&state, pieces);
    let mut forward = SymForwardTree { key_to_id: FastMap::default(), canon_key: vec![root_canon], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    forward.key_to_id.insert(root_key, 0);
    let target_key = compute_edge_state_key(&target, pieces);
    let (mut backward, mut backward_frontier) = Tree::new(target, target_key);

    let mut forward_frontier: Vec<(State, u32)> = vec![(state, 0)];
    let mut forward_rounds: u32 = 0;
    let mut backward_rounds: u32 = 0;
    let mut peak_forward_frontier: u32 = 1;
    let mut peak_backward_frontier: u32 = 1;

    let try_meet = |forward: &SymForwardTree, backward: &Tree| -> Option<Vec<(u8, bool)>> {
        for (&key, &fid) in &forward.key_to_id {
            if let Some(&bid) = backward.key_to_id.get(&key) {
                let mut joined = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
                joined.extend(invert_pairs(&backward.reconstruct(bid)));
                return Some(joined);
            }
        }
        None
    };

    if let Some(m) = try_meet(&forward, &backward) {
        return Phase1Result { found: Some(m), captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
    }

    let mut next: Vec<(State, u32)> = Vec::new();
    for _round in 0..max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.key_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return Phase1Result { found: None, captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if backward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return Phase1Result { found: None, captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
                        }
                        let child_id = backward.parent.len() as u32;
                        backward.key_to_id.insert(key, child_id);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        if let Some(m) = try_meet(&forward, &backward) {
            return Phase1Result { found: Some(m), captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
        }
    }

    Phase1Result {
        found: None,
        captured: Some(Phase1Capture { forward, forward_frontier, forward_rounds }),
        forward_rounds,
        backward_rounds,
        peak_forward_frontier,
        peak_backward_frontier,
    }
}

#[allow(clippy::too_many_arguments)]
fn phase2_continue_with_canonical_backward_impl(
    mut forward: SymForwardTree,
    mut forward_frontier: Vec<(State, u32)>,
    forward_rounds_so_far: u32,
    root: State,
    target: State,
    pieces: &[i8],
    total_max_half_depth: u32,
    max_frontier_size: u32,
) -> (Option<Vec<(u8, bool)>>, SymCandidateStats) {
    let target_key = compute_edge_state_key(&target, pieces);
    let target_canon = canonical_key(&target, pieces);
    let mut backward = SymBackwardTree { canon_to_id: FastMap::default(), real_key: vec![target_key], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    backward.canon_to_id.insert(target_canon, 0);
    let mut backward_frontier: Vec<(State, u32)> = vec![(target, 0)];

    let mut forward_rounds = forward_rounds_so_far;
    let mut backward_rounds: u32 = 0;
    let mut meeting_attempts: u32 = 0;
    let mut peak_forward_frontier: u32 = forward_frontier.len() as u32;
    let mut peak_backward_frontier: u32 = 1;

    let try_meet = |forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]| -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    };

    macro_rules! stats_at {
        ($found:expr, $len:expr, $term:expr, $rounds_completed:expr) => {
            SymCandidateStats {
                found: $found,
                solution_length: $len,
                forward_rounds,
                backward_rounds,
                forward_final_size: forward.key_to_id.len() as u32,
                backward_canonical_final_size: backward.canon_to_id.len() as u32,
                meeting_attempts,
                termination_reason: $term,
                rounds_completed: $rounds_completed,
                peak_forward_frontier,
                peak_backward_frontier,
            }
        };
    }

    meeting_attempts += 1;
    if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
        let len = m.len() as u32;
        return (Some(m), stats_at!(true, len, 0, forward_rounds_so_far));
    }

    let mut rounds_used = forward_rounds_so_far;
    let mut next: Vec<(State, u32)> = Vec::new();
    while rounds_used < total_max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.canon_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, rounds_used));
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let canon = canonical_key(&child, pieces);
                        if backward.canon_to_id.contains_key(&canon) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, rounds_used));
                        }
                        let child_id = backward.parent.len() as u32;
                        let child_key = compute_edge_state_key(&child, pieces);
                        backward.canon_to_id.insert(canon, child_id);
                        backward.real_key.push(child_key);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        rounds_used += 1;
        meeting_attempts += 1;
        if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
            let len = m.len() as u32;
            return (Some(m), stats_at!(true, len, 0, rounds_used));
        }
    }

    (None, stats_at!(false, u32::MAX, 2, rounds_used))
}

#[derive(Clone, Copy, Default)]
struct SharedForwardStats {
    found: bool,
    solution_length: u32,
    phase1_forward_rounds: u32,
    phase1_backward_rounds: u32, // raw, discarded before phase 2
    phase1_termination: u32,     // 0=meet_found_in_phase1, 1=frontier_exceeded_not_reusable, 2=rounds_exhausted_captured
    phase2_forward_rounds_total: u32, // includes the inherited rounds
    phase2_backward_rounds: u32,
    phase2_termination: u32, // 0=meet_found, 1=frontier_exceeded, 2=rounds_exhausted; u32::MAX if phase 2 never ran
    total_rounds: u32,
    peak_forward_frontier: u32,
    peak_backward_frontier_phase1_raw: u32,
    peak_backward_frontier_phase2_canonical: u32,
}

#[allow(clippy::too_many_arguments)]
fn shared_forward_fallback_impl(state: State, pieces: &[i8], depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> (Option<Vec<(u8, bool)>>, SharedForwardStats) {
    let target = solved_state();
    let phase1 = phase1_raw_capture_forward_impl(state, target, pieces, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        let len = path.len() as u32;
        return (
            Some(path),
            SharedForwardStats {
                found: true,
                solution_length: len,
                phase1_forward_rounds: phase1.forward_rounds,
                phase1_backward_rounds: phase1.backward_rounds,
                phase1_termination: 0,
                phase2_forward_rounds_total: 0,
                phase2_backward_rounds: 0,
                phase2_termination: u32::MAX,
                total_rounds: phase1.forward_rounds + phase1.backward_rounds,
                peak_forward_frontier: phase1.peak_forward_frontier,
                peak_backward_frontier_phase1_raw: phase1.peak_backward_frontier,
                peak_backward_frontier_phase2_canonical: 0,
            },
        );
    }

    let Some(cap) = phase1.captured else {
        return (
            None,
            SharedForwardStats {
                found: false,
                solution_length: u32::MAX,
                phase1_forward_rounds: phase1.forward_rounds,
                phase1_backward_rounds: phase1.backward_rounds,
                phase1_termination: 1,
                phase2_forward_rounds_total: 0,
                phase2_backward_rounds: 0,
                phase2_termination: u32::MAX,
                total_rounds: phase1.forward_rounds + phase1.backward_rounds,
                peak_forward_frontier: phase1.peak_forward_frontier,
                peak_backward_frontier_phase1_raw: phase1.peak_backward_frontier,
                peak_backward_frontier_phase2_canonical: 0,
            },
        );
    };

    let (result, phase2_stats) = phase2_continue_with_canonical_backward_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces, total_max_half_depth, candidate_max_frontier);

    let stats = SharedForwardStats {
        found: phase2_stats.found,
        solution_length: phase2_stats.solution_length,
        phase1_forward_rounds: phase1.forward_rounds,
        phase1_backward_rounds: phase1.backward_rounds,
        phase1_termination: 2,
        phase2_forward_rounds_total: phase2_stats.forward_rounds,
        phase2_backward_rounds: phase2_stats.backward_rounds,
        phase2_termination: phase2_stats.termination_reason,
        total_rounds: phase2_stats.rounds_completed,
        peak_forward_frontier: phase1.peak_forward_frontier.max(phase2_stats.peak_forward_frontier),
        peak_backward_frontier_phase1_raw: phase1.peak_backward_frontier,
        peak_backward_frontier_phase2_canonical: phase2_stats.peak_backward_frontier,
    };
    (result, stats)
}

static mut SHARED_FWD_RESULT_BUF: Vec<u8> = Vec::new();
static mut LAST_SHARED_FWD_STATS_WORDS: [u32; 12] = [0; 12];

fn write_last_shared_fwd_stats(s: &SharedForwardStats) {
    unsafe {
        LAST_SHARED_FWD_STATS_WORDS = [
            if s.found { 1 } else { 0 },
            s.solution_length,
            s.phase1_forward_rounds,
            s.phase1_backward_rounds,
            s.phase1_termination,
            s.phase2_forward_rounds_total,
            s.phase2_backward_rounds,
            s.phase2_termination,
            s.total_rounds,
            s.peak_forward_frontier,
            s.peak_backward_frontier_phase1_raw,
            s.peak_backward_frontier_phase2_canonical,
        ];
    }
}

/// `pieces_len` piece ids live in PIECES_SCRATCH, current state in
/// STATE_SCRATCH -- same contract as solve_cross/solve_cross_symmetry_candidate.
/// Runs phase 1 (raw depth12, forward tracks canon_key inline) then, only
/// if phase 1 failed via ROUNDS_EXHAUSTED, phase 2 (fresh canonical
/// backward, inherited forward, continuing to total_max_half_depth).
/// Returns the solution's move count (>=0, readable via
/// shared_fwd_result_ptr()) or -1 if no solution was found. Per-call stats
/// readable via shared_fwd_stats_ptr() immediately after.
#[no_mangle]
pub unsafe extern "C" fn solve_cross_shared_forward_fallback(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> i32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let (result, stats) = shared_forward_fallback_impl(state, &pieces[..pieces_len as usize], depth12_max_half_depth, depth12_max_frontier, total_max_half_depth, candidate_max_frontier);
    write_last_shared_fwd_stats(&stats);
    let Some(moves) = result else {
        return -1;
    };
    let buf = &mut *&raw mut SHARED_FWD_RESULT_BUF;
    buf.clear();
    for (face, sign_negative) in &moves {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn shared_fwd_result_ptr() -> *const u8 {
    (&*&raw const SHARED_FWD_RESULT_BUF).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn shared_fwd_stats_ptr() -> *const u32 {
    (&raw const LAST_SHARED_FWD_STATS_WORDS) as *const u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1 -- isolated experiment,
// building on the validated shared-forward Sprint (preserved unchanged
// above): does depth12's own (raw, failed) BACKWARD tree -- discarded by
// both the sequential fallback AND shared-forward, since canonical dedup
// can't reuse a raw HashMap directly -- reduce to the SAME canonical B6
// a standalone canonical BFS would reach, so it can seed phase 2's
// backward side too (continuing from round 7) instead of rebuilding
// rounds 1-6 of canonical backward from scratch?
//
// Mathematical basis (re-verified empirically below, not just assumed):
// conjugate_state is a graph automorphism of the raw move Cayley graph --
// already proven (this project's own sequence-conjugation tests, 200/200
// exact matches) that relabeling a move sequence by pi_F^{-1} makes
// conjugation commute with move application. A graph automorphism
// preserves shortest-path length, so any two symmetry images of the same
// state sit at the EXACT SAME raw-BFS distance from SOLVED -- meaning
// canonicalizing raw round r's own new states gives EXACTLY canonical
// BFS's own round r new orbits, for every r. That equivalence is what
// build_canonical_backward_reference/build_raw_backward_reference exist
// to check directly (Stop Rule A), before the full pipeline below is
// trusted to reuse it.
// =======================================================================

/// Pure raw (non-canonical) backward BFS from SOLVED -- scramble-independent
/// (backward always starts at SOLVED), so this is a fixed reference
/// computation, not tied to any particular solve. No frontier cap, no
/// meeting-check: a standalone golden/reference build, used only by the
/// verification function below (production's own real depth12 attempts
/// build an equivalent tree as a side effect, but via the memory-efficient
/// Tree/frontier discipline, not this simpler State-storing version).
fn build_raw_backward_reference(pieces: &[i8], rounds: u32) -> FastMap<u64, State> {
    let target = solved_state();
    let mut visited: FastMap<u64, State> = FastMap::default();
    let root_key = compute_edge_state_key(&target, pieces);
    visited.insert(root_key, target);
    let mut frontier: Vec<State> = vec![target];
    for _ in 0..rounds {
        let mut next = Vec::new();
        for &base in &frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    let child = apply_move(&base, face, sign_negative);
                    let key = compute_edge_state_key(&child, pieces);
                    if visited.contains_key(&key) {
                        continue;
                    }
                    visited.insert(key, child);
                    next.push(child);
                }
            }
        }
        frontier = next;
    }
    visited
}

/// Pure canonical backward BFS from SOLVED -- the GOLDEN reference this
/// Sprint's whole hypothesis is checked against: expands only orbit
/// representatives, dedups by canonical_key. Also scramble-independent.
fn build_canonical_backward_reference(pieces: &[i8], rounds: u32) -> FastMap<u64, State> {
    let target = solved_state();
    let mut visited: FastMap<u64, State> = FastMap::default();
    let root_canon = canonical_key(&target, pieces);
    visited.insert(root_canon, target);
    let mut frontier: Vec<State> = vec![target];
    for _ in 0..rounds {
        let mut next = Vec::new();
        for &base in &frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    let child = apply_move(&base, face, sign_negative);
                    let canon = canonical_key(&child, pieces);
                    if visited.contains_key(&canon) {
                        continue;
                    }
                    visited.insert(canon, child);
                    next.push(child);
                }
            }
        }
        frontier = next;
    }
    visited
}

/// [round, raw_size, canon_reconstructed_size, canon_golden_size, exact_match(0/1), extra_in_reconstructed, missing_from_reconstructed] x max_rounds words.
static mut B6_VERIFY_LOG: Vec<u32> = Vec::new();

/// Stop Rule A check: for round = 1..=max_rounds, builds the raw backward
/// tree up to that round, canonicalizes ALL of its states (the
/// "reconstructed" canonical set), and compares against the independently
/// built golden canonical BFS at the same round -- an EXACT set
/// comparison (not just a size check), done natively in Rust since both
/// sides already live in Rust memory. Writes one 7-word record per round
/// to B6_VERIFY_LOG, readable via b6_verify_log_ptr/count.
#[no_mangle]
pub unsafe extern "C" fn shared_backward_verify(pieces_len: u32, max_rounds: u32) {
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces = &pieces[..pieces_len as usize];

    let log = &mut *&raw mut B6_VERIFY_LOG;
    log.clear();

    for round in 1..=max_rounds {
        let raw = build_raw_backward_reference(pieces, round);
        let golden = build_canonical_backward_reference(pieces, round);

        let reconstructed: std::collections::HashSet<u64> = raw.values().map(|s| canonical_key(s, pieces)).collect();
        let golden_keys: std::collections::HashSet<u64> = golden.keys().copied().collect();

        let extra = reconstructed.difference(&golden_keys).count() as u32;
        let missing = golden_keys.difference(&reconstructed).count() as u32;
        let exact_match = extra == 0 && missing == 0;

        log.push(round);
        log.push(raw.len() as u32);
        log.push(reconstructed.len() as u32);
        log.push(golden_keys.len() as u32);
        log.push(if exact_match { 1 } else { 0 });
        log.push(extra);
        log.push(missing);
    }
}

#[no_mangle]
pub unsafe extern "C" fn b6_verify_log_count() -> u32 {
    ((&*&raw const B6_VERIFY_LOG).len() / 7) as u32
}

#[no_mangle]
pub unsafe extern "C" fn b6_verify_log_ptr() -> *const u32 {
    (&*&raw const B6_VERIFY_LOG).as_ptr()
}

// -----------------------------------------------------------------------
// Full pipeline: phase 1 captures BOTH forward (as before, unchanged
// logic) and backward's own raw tree (NEW -- with canon_key tracked
// inline per node, the same "insurance premium" pattern forward already
// uses, so no expensive state-replay retrofit is ever needed). Phase 2
// then canonicalizes backward's raw capture into a real SymBackwardTree
// (a single O(n) pass over already-computed canon_keys -- no new
// move-generation or canonicalization work) and continues expansion from
// round 7, exactly like the shared-forward Sprint's own phase 2 does for
// forward.
// -----------------------------------------------------------------------

struct RawBackwardCapture {
    id_to_key: Vec<u64>,
    canon_key: Vec<u64>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
    /// (state, id) pairs created in the FINAL round only -- by the
    /// automorphism argument above, canonicalizing just this round's own
    /// new states (deduped by canonical_key) gives exactly the canonical
    /// BFS's own round-N frontier, ready to continue expanding at round
    /// N+1 without rebuilding rounds 1..N.
    last_round_frontier: Vec<(State, u32)>,
}

struct Phase1CaptureBoth {
    forward: SymForwardTree,
    forward_frontier: Vec<(State, u32)>,
    forward_rounds: u32,
    backward: RawBackwardCapture,
    backward_rounds: u32,
}

struct Phase1BothResult {
    found: Option<Vec<(u8, bool)>>,
    captured: Option<Phase1CaptureBoth>,
    forward_rounds: u32,
    backward_rounds: u32,
    peak_forward_frontier: u32,
    peak_backward_frontier: u32,
}

/// Structural copy of phase1_raw_capture_forward_impl (itself preserved
/// unchanged above, per this Sprint's own explicit instruction), with one
/// further addition: backward's own raw tree ALSO tracks id_to_key and
/// canon_key per node as it's built (forward already did; backward is new
/// here), so it can be handed directly to canonicalize_raw_backward below
/// with zero retrofit cost on a ROUNDS_EXHAUSTED failure.
fn phase1_raw_capture_both_impl(state: State, target: State, pieces: &[i8], max_half_depth: u32, max_frontier_size: u32) -> Phase1BothResult {
    let root_key = compute_edge_state_key(&state, pieces);
    let root_canon = canonical_key(&state, pieces);
    let mut forward = SymForwardTree { key_to_id: FastMap::default(), canon_key: vec![root_canon], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    forward.key_to_id.insert(root_key, 0);

    let target_key = compute_edge_state_key(&target, pieces);
    let target_canon = canonical_key(&target, pieces);
    let mut backward = RawBackwardCapture { id_to_key: vec![target_key], canon_key: vec![target_canon], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false], last_round_frontier: Vec::new() };
    let mut backward_key_to_id: FastMap<u64, u32> = FastMap::default();
    backward_key_to_id.insert(target_key, 0);

    let mut forward_frontier: Vec<(State, u32)> = vec![(state, 0)];
    let mut backward_frontier: Vec<(State, u32)> = vec![(target, 0)];
    let mut forward_rounds: u32 = 0;
    let mut backward_rounds: u32 = 0;
    let mut peak_forward_frontier: u32 = 1;
    let mut peak_backward_frontier: u32 = 1;

    fn try_meet_both(forward: &SymForwardTree, backward: &RawBackwardCapture, backward_key_to_id: &FastMap<u64, u32>) -> Option<Vec<(u8, bool)>> {
        for (&key, &fid) in &forward.key_to_id {
            if let Some(&bid) = backward_key_to_id.get(&key) {
                let mut joined = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
                joined.extend(invert_pairs(&reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid)));
                return Some(joined);
            }
        }
        None
    }

    if let Some(m) = try_meet_both(&forward, &backward, &backward_key_to_id) {
        return Phase1BothResult { found: Some(m), captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
    }

    let mut next: Vec<(State, u32)> = Vec::new();
    for _round in 0..max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward_key_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return Phase1BothResult { found: None, captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if backward_key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return Phase1BothResult { found: None, captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
                        }
                        let child_id = backward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        backward_key_to_id.insert(key, child_id);
                        backward.id_to_key.push(key);
                        backward.canon_key.push(child_canon);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        if let Some(m) = try_meet_both(&forward, &backward, &backward_key_to_id) {
            return Phase1BothResult { found: Some(m), captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
        }
    }

    backward.last_round_frontier = backward_frontier;
    Phase1BothResult {
        found: None,
        captured: Some(Phase1CaptureBoth { forward, forward_frontier, forward_rounds, backward, backward_rounds }),
        forward_rounds,
        backward_rounds,
        peak_forward_frontier,
        peak_backward_frontier,
    }
}

/// Canonicalizes an already-built raw backward capture into a real
/// SymBackwardTree: a single O(n) pass over already-computed canon_keys
/// (no new move-generation, no new canonicalization work -- both were
/// already paid for, inline, while phase 1 built the raw tree). Reuses
/// the raw capture's own parent/move_face/move_sign_negative arrays
/// UNCHANGED (same id space) -- canon_to_id just indexes into them by
/// canonical key instead of by raw key, first-writer-wins per orbit
/// (matching canonical BFS's own "first discovered representative wins"
/// semantics exactly).
fn canonicalize_raw_backward(raw: RawBackwardCapture) -> (SymBackwardTree, Vec<(State, u32)>) {
    let n = raw.parent.len();
    let mut canon_to_id: FastMap<u64, u32> = FastMap::default();
    for id in 0..n {
        canon_to_id.entry(raw.canon_key[id]).or_insert(id as u32);
    }

    // The round-7-ready frontier: only the last round's own new states
    // that are ALSO their orbit's chosen representative (some of the last
    // round's raw states may belong to an orbit whose representative was
    // actually a DIFFERENT raw state from the same round, or -- though
    // ruled out by the automorphism argument for same-round duplicates
    // specifically -- defensively filtered here regardless).
    let frontier: Vec<(State, u32)> = raw
        .last_round_frontier
        .iter()
        .filter(|&&(_, id)| canon_to_id.get(&raw.canon_key[id as usize]) == Some(&id))
        .copied()
        .collect();

    let tree = SymBackwardTree { canon_to_id, real_key: raw.id_to_key, parent: raw.parent, move_face: raw.move_face, move_sign_negative: raw.move_sign_negative };
    (tree, frontier)
}

/// Phase 2 continuation, now seeded with a RECONSTRUCTED canonical
/// backward (from raw-B(forward_rounds... no, backward_rounds) instead of
/// starting backward from round 0. Otherwise structurally identical to
/// phase2_continue_with_canonical_backward_impl (which is preserved
/// unchanged above for the shared-forward Sprint's own use).
#[allow(clippy::too_many_arguments)]
fn phase2_continue_shared_backward_impl(
    mut forward: SymForwardTree,
    mut forward_frontier: Vec<(State, u32)>,
    forward_rounds_so_far: u32,
    mut backward: SymBackwardTree,
    mut backward_frontier: Vec<(State, u32)>,
    backward_rounds_so_far: u32,
    root: State,
    total_max_half_depth: u32,
    pieces: &[i8],
    max_frontier_size: u32,
) -> (Option<Vec<(u8, bool)>>, SymCandidateStats) {
    let mut forward_rounds = forward_rounds_so_far;
    let mut backward_rounds = backward_rounds_so_far;
    let mut meeting_attempts: u32 = 0;
    let mut peak_forward_frontier: u32 = forward_frontier.len() as u32;
    let mut peak_backward_frontier: u32 = backward_frontier.len() as u32;

    let try_meet = |forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]| -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    };

    macro_rules! stats_at {
        ($found:expr, $len:expr, $term:expr, $rounds_completed:expr) => {
            SymCandidateStats {
                found: $found,
                solution_length: $len,
                forward_rounds,
                backward_rounds,
                forward_final_size: forward.key_to_id.len() as u32,
                backward_canonical_final_size: backward.canon_to_id.len() as u32,
                meeting_attempts,
                termination_reason: $term,
                rounds_completed: $rounds_completed,
                peak_forward_frontier,
                peak_backward_frontier,
            }
        };
    }

    let rounds_so_far = forward_rounds_so_far + backward_rounds_so_far;
    meeting_attempts += 1;
    if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
        let len = m.len() as u32;
        return (Some(m), stats_at!(true, len, 0, rounds_so_far));
    }

    let mut rounds_used = rounds_so_far;
    let mut next: Vec<(State, u32)> = Vec::new();
    while rounds_used < total_max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.canon_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, rounds_used));
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let canon = canonical_key(&child, pieces);
                        if backward.canon_to_id.contains_key(&canon) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, rounds_used));
                        }
                        let child_id = backward.parent.len() as u32;
                        let child_key = compute_edge_state_key(&child, pieces);
                        backward.canon_to_id.insert(canon, child_id);
                        backward.real_key.push(child_key);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        rounds_used += 1;
        meeting_attempts += 1;
        if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
            let len = m.len() as u32;
            return (Some(m), stats_at!(true, len, 0, rounds_used));
        }
    }

    (None, stats_at!(false, u32::MAX, 2, rounds_used))
}

#[derive(Clone, Copy, Default)]
struct SharedBackwardStats {
    found: bool,
    solution_length: u32,
    phase1_forward_rounds: u32,
    phase1_backward_rounds: u32,
    phase1_termination: u32, // 0=meet_found_phase1, 1=frontier_exceeded_not_reusable, 2=rounds_exhausted_captured
    phase2_forward_rounds_total: u32,
    phase2_backward_rounds_total: u32,
    phase2_termination: u32,
    total_rounds: u32,
    peak_forward_frontier: u32,
    peak_backward_frontier: u32,
}

#[allow(clippy::too_many_arguments)]
fn shared_backward_fallback_impl(state: State, pieces: &[i8], depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> (Option<Vec<(u8, bool)>>, SharedBackwardStats) {
    let target = solved_state();
    let phase1 = phase1_raw_capture_both_impl(state, target, pieces, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        let len = path.len() as u32;
        return (
            Some(path),
            SharedBackwardStats {
                found: true,
                solution_length: len,
                phase1_forward_rounds: phase1.forward_rounds,
                phase1_backward_rounds: phase1.backward_rounds,
                phase1_termination: 0,
                phase2_forward_rounds_total: 0,
                phase2_backward_rounds_total: 0,
                phase2_termination: u32::MAX,
                total_rounds: phase1.forward_rounds + phase1.backward_rounds,
                peak_forward_frontier: phase1.peak_forward_frontier,
                peak_backward_frontier: phase1.peak_backward_frontier,
            },
        );
    }

    let Some(cap) = phase1.captured else {
        return (
            None,
            SharedBackwardStats {
                found: false,
                solution_length: u32::MAX,
                phase1_forward_rounds: phase1.forward_rounds,
                phase1_backward_rounds: phase1.backward_rounds,
                phase1_termination: 1,
                phase2_forward_rounds_total: 0,
                phase2_backward_rounds_total: 0,
                phase2_termination: u32::MAX,
                total_rounds: phase1.forward_rounds + phase1.backward_rounds,
                peak_forward_frontier: phase1.peak_forward_frontier,
                peak_backward_frontier: phase1.peak_backward_frontier,
            },
        );
    };

    let (canon_backward, canon_backward_frontier) = canonicalize_raw_backward(cap.backward);
    let (result, phase2_stats) = phase2_continue_shared_backward_impl(
        cap.forward,
        cap.forward_frontier,
        cap.forward_rounds,
        canon_backward,
        canon_backward_frontier,
        cap.backward_rounds,
        state,
        total_max_half_depth,
        pieces,
        candidate_max_frontier,
    );

    let stats = SharedBackwardStats {
        found: phase2_stats.found,
        solution_length: phase2_stats.solution_length,
        phase1_forward_rounds: phase1.forward_rounds,
        phase1_backward_rounds: phase1.backward_rounds,
        phase1_termination: 2,
        phase2_forward_rounds_total: phase2_stats.forward_rounds,
        phase2_backward_rounds_total: phase2_stats.backward_rounds,
        phase2_termination: phase2_stats.termination_reason,
        total_rounds: phase2_stats.rounds_completed,
        peak_forward_frontier: phase1.peak_forward_frontier.max(phase2_stats.peak_forward_frontier),
        peak_backward_frontier: phase1.peak_backward_frontier.max(phase2_stats.peak_backward_frontier),
    };
    (result, stats)
}

static mut SHARED_BWD_RESULT_BUF: Vec<u8> = Vec::new();
static mut LAST_SHARED_BWD_STATS_WORDS: [u32; 11] = [0; 11];

fn write_last_shared_bwd_stats(s: &SharedBackwardStats) {
    unsafe {
        LAST_SHARED_BWD_STATS_WORDS = [
            if s.found { 1 } else { 0 },
            s.solution_length,
            s.phase1_forward_rounds,
            s.phase1_backward_rounds,
            s.phase1_termination,
            s.phase2_forward_rounds_total,
            s.phase2_backward_rounds_total,
            s.phase2_termination,
            s.total_rounds,
            s.peak_forward_frontier,
            s.peak_backward_frontier,
        ];
    }
}

/// `pieces_len` piece ids live in PIECES_SCRATCH, current state in
/// STATE_SCRATCH -- same contract as solve_cross_shared_forward_fallback.
/// Returns the solution's move count (>=0, readable via
/// shared_bwd_result_ptr()) or -1 if none found. Stats readable via
/// shared_bwd_stats_ptr() immediately after.
#[no_mangle]
pub unsafe extern "C" fn solve_cross_shared_backward_fallback(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> i32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let (result, stats) = shared_backward_fallback_impl(state, &pieces[..pieces_len as usize], depth12_max_half_depth, depth12_max_frontier, total_max_half_depth, candidate_max_frontier);
    write_last_shared_bwd_stats(&stats);
    let Some(moves) = result else {
        return -1;
    };
    let buf = &mut *&raw mut SHARED_BWD_RESULT_BUF;
    buf.clear();
    for (face, sign_negative) in &moves {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn shared_bwd_result_ptr() -> *const u8 {
    (&*&raw const SHARED_BWD_RESULT_BUF).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn shared_bwd_stats_ptr() -> *const u32 {
    (&raw const LAST_SHARED_BWD_STATS_WORDS) as *const u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1 -- pure profiling
// Sprint: NO algorithm change (shared-forward's own validated logic is
// reproduced exactly, just split into separately-callable, separately
// TIMEABLE chunks). This module has no clock of its own (wasm32-unknown-unknown
// has no working std::time::Instant without a JS-provided import this
// crate doesn't wire up), so every phase is exposed as its own `extern
// "C"` call, timed from the JS side via performance.now() around each
// call individually -- exactly this project's own established convention
// (every other timing measurement in every prior Sprint was done this
// way too, never inside Rust). Between calls, in-flight search state is
// kept in one static RESUMABLE_STATE (single-threaded, no reentrancy
// concerns, same discipline as CURRENT_INDEX elsewhere in this module).
//
// Decomposition requested by MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1:
//   T1 = phase 1 (raw depth12 attempt, forward tracks canon_key inline) --
//        tail_profile_phase1.
//   T2 = the canon_key "insurance premium" phase 1 pays on forward's own
//        nodes -- NOT re-measured here: it's exactly the delta between
//        tail_profile_phase1's own timing and solve_cross's (plain
//        production depth12, no canon_key at all) own timing, both
//        already independently measurable via existing exports.
//   T3 = canonical backward rounds 1..6 -- tail_profile_run_to_round(12, ...).
//   T4 = canonical backward round 7 ALONE -- tail_profile_run_to_round(13, ...)
//        called a second time, isolating just the one additional round.
//   T5 = meeting-lookup cost alone -- tail_profile_meeting_scan(repeats),
//        repeated for stable averaging (a single scan is too fast to time
//        precisely on its own).
//   T6 = path reconstruction cost alone (only meaningful when a solution
//        was actually found) -- tail_profile_reconstruct(repeats).
//   T7 = whatever's left over once T1+T3+T4+T5+T6 are subtracted from the
//        full shared-forward pipeline's own end-to-end time (JS-side
//        arithmetic, not a separate Rust call) -- allocation, the Wasm/JS
//        boundary crossing itself, etc.
// =======================================================================

struct ResumableSharedForwardState {
    forward: SymForwardTree,
    forward_frontier: Vec<(State, u32)>,
    backward: SymBackwardTree,
    backward_frontier: Vec<(State, u32)>,
    forward_rounds: u32,
    backward_rounds: u32,
    rounds_used: u32,
    root: State,
    found_path: Option<Vec<(u8, bool)>>,
}
static mut TAIL_PROFILE_STATE: Option<ResumableSharedForwardState> = None;

/// T1: runs phase 1 exactly as shared_forward_fallback_impl's own phase 1
/// does (structurally the SAME phase1_raw_capture_forward_impl call, no
/// algorithm difference) and, on ROUNDS_EXHAUSTED, seeds
/// TAIL_PROFILE_STATE with the captured forward tree + a fresh canonical
/// backward (round 0), ready for tail_profile_run_to_round. Returns: 1 if
/// phase 1 itself already found a raw meeting (unexpected for this
/// Sprint's own target fixtures, but handled), 0 if captured and ready
/// for phase 2 profiling, -1 if not reusable (frontier exceeded).
#[no_mangle]
pub unsafe extern "C" fn tail_profile_phase1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32) -> i32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        TAIL_PROFILE_STATE = None;
        let buf = &mut *&raw mut SHARED_FWD_RESULT_BUF;
        buf.clear();
        for (face, sign_negative) in &path {
            buf.push(*face);
            buf.push(if *sign_negative { 1 } else { 0 });
        }
        return 1;
    }
    let Some(cap) = phase1.captured else {
        TAIL_PROFILE_STATE = None;
        return -1;
    };

    let target_key = compute_edge_state_key(&target, pieces_slice);
    let target_canon = canonical_key(&target, pieces_slice);
    let mut backward = SymBackwardTree { canon_to_id: FastMap::default(), real_key: vec![target_key], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    backward.canon_to_id.insert(target_canon, 0);

    TAIL_PROFILE_STATE = Some(ResumableSharedForwardState {
        forward: cap.forward,
        forward_frontier: cap.forward_frontier,
        backward,
        backward_frontier: vec![(target, 0)],
        forward_rounds: cap.forward_rounds,
        backward_rounds: 0,
        rounds_used: cap.forward_rounds,
        root: state,
        found_path: None,
    });
    0
}

/// T3/T4: resumes TAIL_PROFILE_STATE and runs the SAME interleaved
/// "smaller side expands" round loop shared-forward's own phase 2 uses,
/// until rounds_used reaches `target_total_rounds` OR a meeting is found
/// OR the frontier cap is hit -- then STOPS and leaves the state ready
/// for a LATER call with a higher target_total_rounds to continue.
/// Calling this once with target=12 (T3: rounds 7..12, i.e. B1..B6 of
/// this fixture's own backward-only continuation) then again with
/// target=13 (T4: round 13 alone, i.e. B7) isolates the two costs by
/// simply timing each call separately from JS. Returns 1 if found
/// (result readable via tail_profile_result_ptr), 0 if target reached
/// without finding (more calls can continue), -1 if frontier exceeded.
#[no_mangle]
pub unsafe extern "C" fn tail_profile_run_to_round(pieces_len: u32, target_total_rounds: u32, max_frontier_size: u32) -> i32 {
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces = &pieces[..pieces_len as usize];

    let st = &mut *&raw mut TAIL_PROFILE_STATE;
    let Some(s) = st.as_mut() else { return -1 };
    if s.found_path.is_some() {
        return 1;
    }

    fn try_meet(forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]) -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    }

    let mut next: Vec<(State, u32)> = Vec::new();
    while s.rounds_used < target_total_rounds {
        let expand_forward = s.forward.key_to_id.len() <= s.backward.canon_to_id.len();
        if expand_forward { s.forward_rounds += 1 } else { s.backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &s.forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces);
                        if s.forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return -1;
                        }
                        let child_id = s.forward.parent.len() as u32;
                        let child_canon = canonical_key(&child, pieces);
                        s.forward.key_to_id.insert(key, child_id);
                        s.forward.canon_key.push(child_canon);
                        s.forward.parent.push(id as i32);
                        s.forward.move_face.push(face);
                        s.forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            std::mem::swap(&mut s.forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &s.backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let canon = canonical_key(&child, pieces);
                        if s.backward.canon_to_id.contains_key(&canon) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return -1;
                        }
                        let child_id = s.backward.parent.len() as u32;
                        let child_key = compute_edge_state_key(&child, pieces);
                        s.backward.canon_to_id.insert(canon, child_id);
                        s.backward.real_key.push(child_key);
                        s.backward.parent.push(id as i32);
                        s.backward.move_face.push(face);
                        s.backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            std::mem::swap(&mut s.backward_frontier, &mut next);
        }

        s.rounds_used += 1;
        if let Some(m) = try_meet(&s.forward, &s.backward, &s.root, pieces) {
            let buf = &mut *&raw mut SHARED_FWD_RESULT_BUF;
            buf.clear();
            for (face, sign_negative) in &m {
                buf.push(*face);
                buf.push(if *sign_negative { 1 } else { 0 });
            }
            s.found_path = Some(m);
            return 1;
        }
    }
    0
}

#[no_mangle]
pub unsafe extern "C" fn tail_profile_result_ptr() -> *const u8 {
    (&*&raw const SHARED_FWD_RESULT_BUF).as_ptr()
}

/// T5: repeats the SAME meeting scan try_meet already runs after every
/// round (production behavior, unchanged) `repeats` times against
/// TAIL_PROFILE_STATE's CURRENT forward/backward -- a single scan is too
/// fast to time precisely on its own, so JS times one call with a large
/// `repeats` and divides. Purely a read-derived operation (rebuilds a
/// path/state each time exactly like the real scan does, so the cost
/// measured is the SAME cost the real round loop pays, not a cheaper
/// approximation) -- does not mutate TAIL_PROFILE_STATE.
#[no_mangle]
pub unsafe extern "C" fn tail_profile_meeting_scan(pieces_len: u32, repeats: u32) -> i32 {
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces = &pieces[..pieces_len as usize];

    let st = &*&raw const TAIL_PROFILE_STATE;
    let Some(s) = st.as_ref() else { return -1 };

    fn try_meet(forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]) -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    }

    let mut found_count: i32 = 0;
    for _ in 0..repeats {
        if try_meet(&s.forward, &s.backward, &s.root, pieces).is_some() {
            found_count += 1;
        }
    }
    found_count
}

/// T6: repeats path reconstruction ALONE (reconstruct forward path,
/// replay to get F's real state, find_symmetry_index, reconstruct
/// backward path, conjugate, invert, concatenate) `repeats` times --
/// deliberately excludes the scan itself: the matching (fid, bid) pair is
/// found ONCE, outside the timed repeat loop (a HashMap iteration order
/// is not meaningfully "free" to redo every repeat, and tail_profile_meeting_scan
/// already measures the scan cost on its own -- mixing the two here would
/// double-count the scan into T6). ONLY meaningful if TAIL_PROFILE_STATE
/// already has a found_path (i.e. this fixture actually solves). Returns
/// the solution length, or -1 if nothing was found (nothing to
/// reconstruct).
#[no_mangle]
pub unsafe extern "C" fn tail_profile_reconstruct(pieces_len: u32, repeats: u32) -> i32 {
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces = &pieces[..pieces_len as usize];

    let st = &*&raw const TAIL_PROFILE_STATE;
    let Some(s) = st.as_ref() else { return -1 };
    if s.found_path.is_none() {
        return -1;
    }

    // Find the matching (fid, bid) pair ONCE -- this is the "scan" part,
    // deliberately left outside the timed loop below (see this fn's own
    // dev notes).
    let mut found_pair: Option<(u32, u32)> = None;
    for &fid in s.forward.key_to_id.values() {
        let canon = s.forward.canon_key[fid as usize];
        if let Some(&bid) = s.backward.canon_to_id.get(&canon) {
            found_pair = Some((fid, bid));
            break;
        }
    }
    let Some((fid, bid)) = found_pair else { return -1 };

    let mut len: i32 = -1;
    for _ in 0..repeats {
        let fpath = reconstruct_generic(&s.forward.parent, &s.forward.move_face, &s.forward.move_sign_negative, fid);
        let f_state = apply_seq(s.root, &fpath);
        let rep_key = s.backward.real_key[bid as usize];
        let j = find_symmetry_index(&f_state, rep_key, pieces);
        let rep_path = reconstruct_generic(&s.backward.parent, &s.backward.move_face, &s.backward.move_sign_negative, bid);
        let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
        let mut combined = fpath;
        combined.extend(invert_pairs(&conjugated_backward_path));
        len = combined.len() as i32;
    }
    len
}

// =======================================================================
// MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1 -- pure low-level
// implementation experiment: does removing wasted work inside
// canonical_key's own hot path (conjugate_state's own two full
// compose_transforms passes, compute_edge_state_key's own repeated
// slot_for_piece array init) reduce the T2/T4 costs the prior
// MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1 Sprint measured
// as the dominant tail cost -- WITHOUT changing search semantics, the
// symmetry definition, frontier caps, depth, or meeting policy at all?
//
// V0 = the existing, already-validated canonical_key/conjugate_state
//      (untouched, called directly as the golden baseline for every
//      comparison below).
// V1 = compute_edge_state_key_fast5: this candidate's own tracked pieces
//      are ALWAYS the 5 contiguous ids [0,1,2,3,4] (FIRST_LAYER_EDGE_POSITIONS,
//      sorted) -- so the general compute_edge_state_key's own
//      slot_for_piece 30-element init + fill (needed for an ARBITRARY
//      piece set) is provably redundant here: piece id IS the slot.
//      compute_edge_state_key itself stays completely untouched (still
//      used everywhere else); this is a NEW, additional fast path.
// V2 = V1 + conjugate_state_v2: conjugate_state's own two full
//      compose_transforms passes (each its own 50-iteration loop over a
//      freshly zero-initialized 100-byte State) are algebraically fused
//      into ONE 50-iteration pass computing the equivalent 3-level
//      chained lookup directly per position (re-derived by hand from
//      compose_transforms's own formula, see this fn's own dev notes for
//      the derivation) -- eliminating the intermediate State entirely.
//      Corner orientation's mod-3 reduction needs care once 3 terms are
//      summed instead of 2 sequential 2-term reductions (see mod3_sum3's
//      own dev notes); edge orientation's mod-2 reduction has no such
//      subtlety (parity of a sum is insensitive to when you reduce).
//
// Every variant is checked for EXACT bit-for-bit equivalence against V0
// before any timing claim is trusted (Gate A) -- this Sprint's whole
// point is implementation speed, not new math, so a mismatch anywhere
// invalidates the candidate regardless of how fast it measures.
// =======================================================================

/// V1: fast-path compute_edge_state_key for this candidate's own fixed 5
/// contiguous piece ids [0,1,2,3,4] -- skips the general function's own
/// 30-element slot_for_piece init + fill (piece id IS the slot here).
/// compute_edge_state_key itself is untouched; this is purely additive.
fn compute_edge_state_key_fast5(state: &State) -> u64 {
    let mut positions = [0i8; 5];
    let mut remaining = 5;
    for pos in 0..30 {
        if remaining == 0 {
            break;
        }
        let piece = state.edge_perm[pos];
        if piece < 5 {
            positions[piece as usize] = pos as i8;
            remaining -= 1;
        }
    }
    let mut key: u64 = 0;
    for i in 0..5 {
        key = key * 60 + positions[i] as u64 * 2 + state.edge_orient[positions[i] as usize] as u64;
    }
    key
}

/// (a+b) mod 3, then (that+c) mod 3 -- two SEQUENTIAL 2-term reductions
/// (what the original two-compose conjugate_state effectively does) --
/// is always equal to (a+b+c) mod 3 computed in one shot (basic modular
/// arithmetic: reducing an intermediate sum never changes the final
/// residue class). What DOES need care is the single-shot reduction's own
/// range: three terms each in {0,1,2} sum to at most 6, so a single
/// "if >=3 subtract 3" (correct for a 2-term sum, max 4) is NOT enough --
/// this needs up to two conditional subtractions, handled explicitly here
/// rather than assumed.
fn mod3_sum3(a: i8, b: i8, c: i8) -> i8 {
    let s = a + b + c;
    if s >= 6 {
        s - 6
    } else if s >= 3 {
        s - 3
    } else {
        s
    }
}

/// V2: conjugate_state(state) = compose_transforms(compose_transforms(SIGMA, state), SIGMA_INV),
/// re-derived algebraically into ONE direct pass instead of two:
/// out.perm[pos] = SIGMA.perm[state.perm[SIGMA_INV.perm[pos]]]
/// out.orient[pos] = SIGMA.orient[p2] + state.orient[p1] + SIGMA_INV.orient[pos]  (mod)
/// where p1 = SIGMA_INV.perm[pos], p2 = state.perm[p1] -- hand-derived
/// directly from compose_transforms's own formula (out[pos].orient =
/// a.orient[b.perm[pos]] + b.orient[pos]) applied twice in sequence, then
/// algebraically composed. Eliminates the intermediate State entirely (no
/// second zero-init, no second 50-iteration pass) -- same math, fewer
/// operations. Verified bit-for-bit against the original two-compose
/// version by this Sprint's own Gate A before being trusted for anything.
fn conjugate_state_v2(state: &State) -> State {
    let mut out = SOLVED;
    for pos in 0..20 {
        let p1 = SIGMA_INV.corner_perm[pos] as usize;
        let p2 = state.corner_perm[p1] as usize;
        out.corner_perm[pos] = SIGMA.corner_perm[p2];
        out.corner_orient[pos] = mod3_sum3(SIGMA_INV.corner_orient[pos], state.corner_orient[p1], SIGMA.corner_orient[p2]);
    }
    for pos in 0..30 {
        let p1 = SIGMA_INV.edge_perm[pos] as usize;
        let p2 = state.edge_perm[p1] as usize;
        out.edge_perm[pos] = SIGMA.edge_perm[p2];
        out.edge_orient[pos] = (SIGMA_INV.edge_orient[pos] + state.edge_orient[p1] + SIGMA.edge_orient[p2]) & 1;
    }
    out
}

fn canonical_key_v1(state: &State) -> u64 {
    let mut best = compute_edge_state_key_fast5(state);
    let mut cur = *state;
    for _ in 0..4 {
        cur = conjugate_state(&cur); // V0's own conjugate -- V1 isolates ONLY the key-packing change
        let k = compute_edge_state_key_fast5(&cur);
        if k < best {
            best = k;
        }
    }
    best
}

fn canonical_key_v2(state: &State) -> u64 {
    let mut best = compute_edge_state_key_fast5(state);
    let mut cur = *state;
    for _ in 0..4 {
        cur = conjugate_state_v2(&cur);
        let k = compute_edge_state_key_fast5(&cur);
        if k < best {
            best = k;
        }
    }
    best
}

/// Gate A: checks canonical_key(V0) == canonical_key_v1 == canonical_key_v2
/// for the CURRENT state in STATE_SCRATCH. Returns a bitmask: bit0 =
/// v0!=v1, bit1 = v0!=v2, bit2 = v1!=v2 -- 0 means all three agree
/// exactly. `pieces_len`/PIECES_SCRATCH follow the same contract as every
/// other export in this module (always [0,1,2,3,4] in practice for this
/// candidate, but read from scratch like everywhere else rather than
/// hardcoded, so V0's own general call is a fair, honest comparison).
#[no_mangle]
pub unsafe extern "C" fn microopt_verify_one(pieces_len: u32) -> u32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];

    let v0 = canonical_key(&state, pieces_slice);
    let v1 = canonical_key_v1(&state);
    let v2 = canonical_key_v2(&state);

    let mut mask = 0u32;
    if v0 != v1 {
        mask |= 1;
    }
    if v0 != v2 {
        mask |= 2;
    }
    if v1 != v2 {
        mask |= 4;
    }
    mask
}

/// Gate A, comprehensive: checks all three variants against SOLVED, every
/// state reachable within 7 raw backward rounds (covers B1..B7 -- the
/// exact round range this Sprint's own predecessor identified as the
/// cost hot path), and -- if `forward_root_provided` is nonzero -- every
/// state reachable within 6 raw rounds from STATE_SCRATCH's own current
/// root (covers real forward states, including whatever scramble the
/// caller loaded, e.g. the 3 residual fixtures or a rescued one). Returns
/// the TOTAL mismatch count across every state checked (0 = perfect
/// agreement).
#[no_mangle]
pub unsafe extern "C" fn microopt_verify_comprehensive(pieces_len: u32, forward_root_provided: u32) -> u32 {
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];

    let mut mismatches: u32 = 0;
    let mut check = |s: &State| {
        let v0 = canonical_key(s, pieces_slice);
        let v1 = canonical_key_v1(s);
        let v2 = canonical_key_v2(s);
        if v0 != v1 || v0 != v2 {
            mismatches += 1;
        }
    };

    check(&solved_state());

    let backward_all = build_raw_backward_reference(pieces_slice, 7);
    for s in backward_all.values() {
        check(s);
    }

    if forward_root_provided != 0 {
        let root = read_state_scratch();
        check(&root);
        let mut visited: FastMap<u64, ()> = FastMap::default();
        visited.insert(compute_edge_state_key(&root, pieces_slice), ());
        let mut frontier = vec![root];
        for _ in 0..6 {
            let mut next = Vec::new();
            for &base in &frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base, face, sign_negative);
                        let key = compute_edge_state_key(&child, pieces_slice);
                        if visited.contains_key(&key) {
                            continue;
                        }
                        visited.insert(key, ());
                        check(&child);
                        next.push(child);
                    }
                }
            }
            frontier = next;
        }
    }

    mismatches
}

/// Timing-only micro-benchmarks (Gate C): each repeats ONE isolated
/// operation `repeats` times using STATE_SCRATCH's current state as
/// input, returning an XOR checksum (so the optimizer can't eliminate the
/// loop as dead code) -- JS times the WHOLE call with performance.now()
/// and divides by `repeats` for a stable per-call average, exactly the
/// same methodology the prior Sprint's own tail_profile_* exports used
/// (this crate has no working clock of its own in wasm32-unknown-unknown).
#[no_mangle]
pub unsafe extern "C" fn bench_conjugate_state(variant: u32, repeats: u32) -> u64 {
    let state = read_state_scratch();
    let mut acc: u64 = 0;
    let mut cur = state;
    match variant {
        0 => {
            for _ in 0..repeats {
                cur = conjugate_state(&cur);
                acc ^= cur.corner_perm[0] as u64;
            }
        }
        2 => {
            for _ in 0..repeats {
                cur = conjugate_state_v2(&cur);
                acc ^= cur.corner_perm[0] as u64;
            }
        }
        _ => {}
    }
    acc
}

#[no_mangle]
pub unsafe extern "C" fn bench_compute_edge_state_key(pieces_len: u32, variant: u32, repeats: u32) -> u64 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let mut acc: u64 = 0;
    match variant {
        0 => {
            for _ in 0..repeats {
                acc ^= compute_edge_state_key(&state, pieces_slice);
            }
        }
        1 => {
            for _ in 0..repeats {
                acc ^= compute_edge_state_key_fast5(&state);
            }
        }
        _ => {}
    }
    acc
}

#[no_mangle]
pub unsafe extern "C" fn bench_state_zero_init(repeats: u32) -> i8 {
    let mut acc: i8 = 0;
    for _ in 0..repeats {
        let s = SOLVED;
        acc ^= s.corner_perm[0];
    }
    acc
}

#[no_mangle]
pub unsafe extern "C" fn bench_canonical_key(pieces_len: u32, variant: u32, repeats: u32) -> u64 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];

    let mut acc: u64 = 0;
    match variant {
        0 => {
            for _ in 0..repeats {
                acc ^= canonical_key(&state, pieces_slice);
            }
        }
        1 => {
            for _ in 0..repeats {
                acc ^= canonical_key_v1(&state);
            }
        }
        2 => {
            for _ in 0..repeats {
                acc ^= canonical_key_v2(&state);
            }
        }
        _ => {}
    }
    acc
}

// -----------------------------------------------------------------------
// Full end-to-end V2 pipeline: a structural copy of
// phase1_raw_capture_forward_impl / phase2_continue_with_canonical_backward_impl
// / shared_forward_fallback_impl (all three preserved completely
// unchanged above, per this Sprint's own explicit instruction), with
// exactly ONE substitution throughout: every canonical_key/
// compute_edge_state_key call is replaced by canonical_key_v2/
// compute_edge_state_key_fast5. No search policy, frontier cap, depth, or
// meeting logic differs in any way -- this exists purely to measure the
// REAL end-to-end effect of the Gate-A-verified V2 implementation, not
// just its isolated micro-benchmark cost (Gate C requires both).
// -----------------------------------------------------------------------

fn phase1_raw_capture_forward_v2_impl(state: State, target: State, pieces: &[i8], max_half_depth: u32, max_frontier_size: u32) -> Phase1Result {
    let root_key = compute_edge_state_key_fast5(&state);
    let root_canon = canonical_key_v2(&state);
    let mut forward = SymForwardTree { key_to_id: FastMap::default(), canon_key: vec![root_canon], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    forward.key_to_id.insert(root_key, 0);
    let target_key = compute_edge_state_key_fast5(&target);
    let (mut backward, mut backward_frontier) = Tree::new(target, target_key);

    let mut forward_frontier: Vec<(State, u32)> = vec![(state, 0)];
    let mut forward_rounds: u32 = 0;
    let mut backward_rounds: u32 = 0;
    let mut peak_forward_frontier: u32 = 1;
    let mut peak_backward_frontier: u32 = 1;

    let try_meet = |forward: &SymForwardTree, backward: &Tree| -> Option<Vec<(u8, bool)>> {
        for (&key, &fid) in &forward.key_to_id {
            if let Some(&bid) = backward.key_to_id.get(&key) {
                let mut joined = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
                joined.extend(invert_pairs(&backward.reconstruct(bid)));
                return Some(joined);
            }
        }
        None
    };

    if let Some(m) = try_meet(&forward, &backward) {
        return Phase1Result { found: Some(m), captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
    }

    let mut next: Vec<(State, u32)> = Vec::new();
    for _round in 0..max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.key_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key_fast5(&child);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return Phase1Result { found: None, captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key_v2(&child);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key_fast5(&child);
                        if backward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return Phase1Result { found: None, captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
                        }
                        let child_id = backward.parent.len() as u32;
                        backward.key_to_id.insert(key, child_id);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        if let Some(m) = try_meet(&forward, &backward) {
            return Phase1Result { found: Some(m), captured: None, forward_rounds, backward_rounds, peak_forward_frontier, peak_backward_frontier };
        }
    }

    let _ = pieces; // signature kept consistent with the V0 function; V2 always uses the fixed 5-piece fast path
    Phase1Result {
        found: None,
        captured: Some(Phase1Capture { forward, forward_frontier, forward_rounds }),
        forward_rounds,
        backward_rounds,
        peak_forward_frontier,
        peak_backward_frontier,
    }
}

#[allow(clippy::too_many_arguments)]
fn phase2_continue_with_canonical_backward_v2_impl(
    mut forward: SymForwardTree,
    mut forward_frontier: Vec<(State, u32)>,
    forward_rounds_so_far: u32,
    root: State,
    target: State,
    pieces: &[i8],
    total_max_half_depth: u32,
    max_frontier_size: u32,
) -> (Option<Vec<(u8, bool)>>, SymCandidateStats) {
    let target_key = compute_edge_state_key_fast5(&target);
    let target_canon = canonical_key_v2(&target);
    let mut backward = SymBackwardTree { canon_to_id: FastMap::default(), real_key: vec![target_key], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    backward.canon_to_id.insert(target_canon, 0);
    let mut backward_frontier: Vec<(State, u32)> = vec![(target, 0)];

    let mut forward_rounds = forward_rounds_so_far;
    let mut backward_rounds: u32 = 0;
    let mut meeting_attempts: u32 = 0;
    let mut peak_forward_frontier: u32 = forward_frontier.len() as u32;
    let mut peak_backward_frontier: u32 = 1;

    let try_meet = |forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]| -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    };

    macro_rules! stats_at {
        ($found:expr, $len:expr, $term:expr, $rounds_completed:expr) => {
            SymCandidateStats {
                found: $found,
                solution_length: $len,
                forward_rounds,
                backward_rounds,
                forward_final_size: forward.key_to_id.len() as u32,
                backward_canonical_final_size: backward.canon_to_id.len() as u32,
                meeting_attempts,
                termination_reason: $term,
                rounds_completed: $rounds_completed,
                peak_forward_frontier,
                peak_backward_frontier,
            }
        };
    }

    meeting_attempts += 1;
    if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
        let len = m.len() as u32;
        return (Some(m), stats_at!(true, len, 0, forward_rounds_so_far));
    }

    let mut rounds_used = forward_rounds_so_far;
    let mut next: Vec<(State, u32)> = Vec::new();
    while rounds_used < total_max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.canon_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();

        if expand_forward {
            for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key_fast5(&child);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, rounds_used));
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key_v2(&child);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        let child = apply_move(&base_state, face, sign_negative);
                        let canon = canonical_key_v2(&child);
                        if backward.canon_to_id.contains_key(&canon) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            return (None, stats_at!(false, u32::MAX, 1, rounds_used));
                        }
                        let child_id = backward.parent.len() as u32;
                        let child_key = compute_edge_state_key_fast5(&child);
                        backward.canon_to_id.insert(canon, child_id);
                        backward.real_key.push(child_key);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        rounds_used += 1;
        meeting_attempts += 1;
        if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
            let len = m.len() as u32;
            return (Some(m), stats_at!(true, len, 0, rounds_used));
        }
    }

    (None, stats_at!(false, u32::MAX, 2, rounds_used))
}

fn shared_forward_fallback_v2_impl(state: State, pieces: &[i8], depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> (Option<Vec<(u8, bool)>>, SharedForwardStats) {
    let target = solved_state();
    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        let len = path.len() as u32;
        return (
            Some(path),
            SharedForwardStats {
                found: true,
                solution_length: len,
                phase1_forward_rounds: phase1.forward_rounds,
                phase1_backward_rounds: phase1.backward_rounds,
                phase1_termination: 0,
                phase2_forward_rounds_total: 0,
                phase2_backward_rounds: 0,
                phase2_termination: u32::MAX,
                total_rounds: phase1.forward_rounds + phase1.backward_rounds,
                peak_forward_frontier: phase1.peak_forward_frontier,
                peak_backward_frontier_phase1_raw: phase1.peak_backward_frontier,
                peak_backward_frontier_phase2_canonical: 0,
            },
        );
    }

    let Some(cap) = phase1.captured else {
        return (
            None,
            SharedForwardStats {
                found: false,
                solution_length: u32::MAX,
                phase1_forward_rounds: phase1.forward_rounds,
                phase1_backward_rounds: phase1.backward_rounds,
                phase1_termination: 1,
                phase2_forward_rounds_total: 0,
                phase2_backward_rounds: 0,
                phase2_termination: u32::MAX,
                total_rounds: phase1.forward_rounds + phase1.backward_rounds,
                peak_forward_frontier: phase1.peak_forward_frontier,
                peak_backward_frontier_phase1_raw: phase1.peak_backward_frontier,
                peak_backward_frontier_phase2_canonical: 0,
            },
        );
    };

    let (result, phase2_stats) = phase2_continue_with_canonical_backward_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces, total_max_half_depth, candidate_max_frontier);

    let stats = SharedForwardStats {
        found: phase2_stats.found,
        solution_length: phase2_stats.solution_length,
        phase1_forward_rounds: phase1.forward_rounds,
        phase1_backward_rounds: phase1.backward_rounds,
        phase1_termination: 2,
        phase2_forward_rounds_total: phase2_stats.forward_rounds,
        phase2_backward_rounds: phase2_stats.backward_rounds,
        phase2_termination: phase2_stats.termination_reason,
        total_rounds: phase2_stats.rounds_completed,
        peak_forward_frontier: phase1.peak_forward_frontier.max(phase2_stats.peak_forward_frontier),
        peak_backward_frontier_phase1_raw: phase1.peak_backward_frontier,
        peak_backward_frontier_phase2_canonical: phase2_stats.peak_backward_frontier,
    };
    (result, stats)
}

static mut SHARED_FWD_V2_RESULT_BUF: Vec<u8> = Vec::new();
static mut LAST_SHARED_FWD_V2_STATS_WORDS: [u32; 11] = [0; 11];

fn write_last_shared_fwd_v2_stats(s: &SharedForwardStats) {
    unsafe {
        LAST_SHARED_FWD_V2_STATS_WORDS = [
            if s.found { 1 } else { 0 },
            s.solution_length,
            s.phase1_forward_rounds,
            s.phase1_backward_rounds,
            s.phase1_termination,
            s.phase2_forward_rounds_total,
            s.phase2_backward_rounds,
            s.phase2_termination,
            s.total_rounds,
            s.peak_forward_frontier,
            s.peak_backward_frontier_phase1_raw,
        ];
    }
}

/// Same contract as solve_cross_shared_forward_fallback, but using the
/// Gate-A-verified V2 canonicalization implementation throughout (see
/// this section's own dev notes) -- the ONLY difference from the already-
/// validated shared-forward pipeline anywhere in this file.
#[no_mangle]
pub unsafe extern "C" fn solve_cross_shared_forward_fallback_v2(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> i32 {
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let (result, stats) = shared_forward_fallback_v2_impl(state, &pieces[..pieces_len as usize], depth12_max_half_depth, depth12_max_frontier, total_max_half_depth, candidate_max_frontier);
    write_last_shared_fwd_v2_stats(&stats);
    let Some(moves) = result else {
        return -1;
    };
    let buf = &mut *&raw mut SHARED_FWD_V2_RESULT_BUF;
    buf.clear();
    for (face, sign_negative) in &moves {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn shared_fwd_v2_result_ptr() -> *const u8 {
    (&*&raw const SHARED_FWD_V2_RESULT_BUF).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn shared_fwd_v2_stats_ptr() -> *const u32 {
    (&raw const LAST_SHARED_FWD_V2_STATS_WORDS) as *const u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1 --
// pure diagnostic instrumentation. NO algorithm/search-policy change:
// this is a structural copy of the already-validated V2 pipeline
// (phase1_raw_capture_forward_v2_impl, reused UNCHANGED; a new
// phase2_diagnostic_v2_impl that is byte-for-byte the same round loop as
// phase2_continue_with_canonical_backward_v2_impl, with logging calls
// added that never influence which keys/paths get recorded -- same
// non-interference discipline as REACH_LOG/CROSS_LOG earlier in this
// file), plus a read-only meeting-distance diagnostic run AFTER the
// search halts. Exists purely to answer why normal#28/hard#6/hard#24
// fail under the current 97/100 architecture, not to change it.
// =======================================================================

/// [round, side(0=fwd,1=bwd), generated_this_round, retained_this_round,
/// cumulative_forward_size, cumulative_backward_canon_size,
/// frontier_cap_hit(0/1), meeting_found_this_round(0/1)] x rounds.
static mut DIAG_ROUND_LOG: Vec<u64> = Vec::new();

/// Kept alive after a diagnostic run so the meeting-distance query
/// (diag_meeting_distance) can inspect the FINAL forward/backward trees
/// without re-running the search -- same "resumable state" discipline as
/// TAIL_PROFILE_STATE above, just read-only once populated.
struct DiagState {
    forward: SymForwardTree,
    backward: SymBackwardTree,
}
static mut DIAG_STATE: Option<DiagState> = None;

#[allow(clippy::too_many_arguments)]
fn phase2_diagnostic_v2_impl(
    mut forward: SymForwardTree,
    mut forward_frontier: Vec<(State, u32)>,
    forward_rounds_so_far: u32,
    root: State,
    target: State,
    pieces: &[i8],
    total_max_half_depth: u32,
    max_frontier_size: u32,
) -> (Option<Vec<(u8, bool)>>, SymCandidateStats) {
    let target_key = compute_edge_state_key_fast5(&target);
    let target_canon = canonical_key_v2(&target);
    let mut backward = SymBackwardTree { canon_to_id: FastMap::default(), real_key: vec![target_key], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    backward.canon_to_id.insert(target_canon, 0);
    let mut backward_frontier: Vec<(State, u32)> = vec![(target, 0)];

    let mut forward_rounds = forward_rounds_so_far;
    let mut backward_rounds: u32 = 0;
    let mut meeting_attempts: u32 = 0;
    let mut peak_forward_frontier: u32 = forward_frontier.len() as u32;
    let mut peak_backward_frontier: u32 = 1;

    fn try_meet(forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]) -> Option<Vec<(u8, bool)>> {
        for &fid in forward.key_to_id.values() {
            let canon = forward.canon_key[fid as usize];
            let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
            let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
            let f_state = apply_seq(*root, &fpath);
            let rep_key = backward.real_key[bid as usize];
            let j = find_symmetry_index(&f_state, rep_key, pieces);
            let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
            let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath;
            combined.extend(invert_pairs(&conjugated_backward_path));
            return Some(combined);
        }
        None
    }

    macro_rules! stats_at {
        ($found:expr, $len:expr, $term:expr, $rounds_completed:expr) => {
            SymCandidateStats {
                found: $found,
                solution_length: $len,
                forward_rounds,
                backward_rounds,
                forward_final_size: forward.key_to_id.len() as u32,
                backward_canonical_final_size: backward.canon_to_id.len() as u32,
                meeting_attempts,
                termination_reason: $term,
                rounds_completed: $rounds_completed,
                peak_forward_frontier,
                peak_backward_frontier,
            }
        };
    }

    meeting_attempts += 1;
    if let Some(m) = try_meet(&forward, &backward, &root, pieces) {
        let len = m.len() as u32;
        let stats = stats_at!(true, len, 0, forward_rounds_so_far);
        unsafe {
            DIAG_STATE = Some(DiagState { forward, backward });
        }
        return (Some(m), stats);
    }

    let mut rounds_used = forward_rounds_so_far;
    let mut next: Vec<(State, u32)> = Vec::new();
    while rounds_used < total_max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.canon_to_id.len();
        if expand_forward { forward_rounds += 1 } else { backward_rounds += 1 }
        next.clear();
        let mut generated_this_round: u64 = 0;
        let mut cap_hit_this_round = false;

        if expand_forward {
            'fwd: for &(base_state, id) in &forward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        generated_this_round += 1;
                        let child = apply_move(&base_state, face, sign_negative);
                        let key = compute_edge_state_key_fast5(&child);
                        if forward.key_to_id.contains_key(&key) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            cap_hit_this_round = true;
                            break 'fwd;
                        }
                        let child_id = forward.parent.len() as u32;
                        let child_canon = canonical_key_v2(&child);
                        forward.key_to_id.insert(key, child_id);
                        forward.canon_key.push(child_canon);
                        forward.parent.push(id as i32);
                        forward.move_face.push(face);
                        forward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
        } else {
            'bwd: for &(base_state, id) in &backward_frontier {
                for face in 0u8..12 {
                    for &sign_negative in &[false, true] {
                        generated_this_round += 1;
                        let child = apply_move(&base_state, face, sign_negative);
                        let canon = canonical_key_v2(&child);
                        if backward.canon_to_id.contains_key(&canon) {
                            continue;
                        }
                        if (next.len() as u32) >= max_frontier_size {
                            cap_hit_this_round = true;
                            break 'bwd;
                        }
                        let child_id = backward.parent.len() as u32;
                        let child_key = compute_edge_state_key_fast5(&child);
                        backward.canon_to_id.insert(canon, child_id);
                        backward.real_key.push(child_key);
                        backward.parent.push(id as i32);
                        backward.move_face.push(face);
                        backward.move_sign_negative.push(sign_negative);
                        next.push((child, child_id));
                    }
                }
            }
        }

        // Captured BEFORE the swap below moves `next`'s own contents into
        // forward_frontier/backward_frontier -- this is exactly the set
        // of new states this round actually retained.
        let retained_this_round = next.len() as u64;
        if expand_forward {
            peak_forward_frontier = peak_forward_frontier.max(next.len() as u32);
            std::mem::swap(&mut forward_frontier, &mut next);
        } else {
            peak_backward_frontier = peak_backward_frontier.max(next.len() as u32);
            std::mem::swap(&mut backward_frontier, &mut next);
        }

        rounds_used += 1;
        meeting_attempts += 1;
        let meeting_result = try_meet(&forward, &backward, &root, pieces);
        let meeting_found = meeting_result.is_some();

        unsafe {
            let log = &mut *&raw mut DIAG_ROUND_LOG;
            log.push(rounds_used as u64);
            log.push(if expand_forward { 0 } else { 1 });
            log.push(generated_this_round);
            log.push(retained_this_round);
            log.push(forward.key_to_id.len() as u64);
            log.push(backward.canon_to_id.len() as u64);
            log.push(if cap_hit_this_round { 1 } else { 0 });
            log.push(if meeting_found { 1 } else { 0 });
        }

        if let Some(m) = meeting_result {
            let len = m.len() as u32;
            let stats = stats_at!(true, len, 0, rounds_used);
            unsafe {
                DIAG_STATE = Some(DiagState { forward, backward });
            }
            return (Some(m), stats);
        }
        if cap_hit_this_round {
            let stats = stats_at!(false, u32::MAX, 1, rounds_used);
            unsafe {
                DIAG_STATE = Some(DiagState { forward, backward });
            }
            return (None, stats);
        }
    }

    let stats = stats_at!(false, u32::MAX, 2, rounds_used);
    unsafe {
        DIAG_STATE = Some(DiagState { forward, backward });
    }
    (None, stats)
}

static mut DIAG_RESULT_BUF: Vec<u8> = Vec::new();
static mut LAST_DIAG_STATS_WORDS: [u32; 9] = [0; 9];

fn write_last_diag_stats(s: &SymCandidateStats) {
    unsafe {
        LAST_DIAG_STATS_WORDS = [
            if s.found { 1 } else { 0 },
            s.solution_length,
            s.forward_rounds,
            s.backward_rounds,
            s.forward_final_size,
            s.backward_canonical_final_size,
            s.meeting_attempts,
            s.termination_reason,
            s.rounds_completed,
        ];
    }
}

/// Runs phase 1 (the SAME phase1_raw_capture_forward_v2_impl the accepted
/// V2 Production pipeline uses, byte-identical) then, on ROUNDS_EXHAUSTED,
/// phase2_diagnostic_v2_impl for `total_max_half_depth` rounds (13 for a
/// baseline reproduction, 14 for the depth-extension diagnostic --
/// max_frontier_size stays fixed at production's own 1,500,000 unless the
/// caller explicitly passes something else, purely for this isolated
/// harness's own use). Clears DIAG_ROUND_LOG first. Returns the solution's
/// move count (>=0, readable via diag_result_ptr()) or -1 if none found.
/// Stats readable via diag_stats_ptr(); round-by-round log via
/// diag_round_log_count/ptr; DIAG_STATE is left populated for
/// diag_meeting_distance to query afterward.
#[no_mangle]
pub unsafe extern "C" fn diagnostic_run_v2(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32) -> i32 {
    (&mut *&raw mut DIAG_ROUND_LOG).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        let stats = SymCandidateStats {
            found: true,
            solution_length: path.len() as u32,
            forward_rounds: phase1.forward_rounds,
            backward_rounds: phase1.backward_rounds,
            forward_final_size: 0,
            backward_canonical_final_size: 0,
            meeting_attempts: 0,
            termination_reason: 0,
            rounds_completed: phase1.forward_rounds + phase1.backward_rounds,
            peak_forward_frontier: phase1.peak_forward_frontier,
            peak_backward_frontier: phase1.peak_backward_frontier,
        };
        write_last_diag_stats(&stats);
        let buf = &mut *&raw mut DIAG_RESULT_BUF;
        buf.clear();
        for (face, sign_negative) in &path {
            buf.push(*face);
            buf.push(if *sign_negative { 1 } else { 0 });
        }
        return path.len() as i32;
    }

    let Some(cap) = phase1.captured else {
        let stats = SymCandidateStats { found: false, solution_length: u32::MAX, forward_rounds: phase1.forward_rounds, backward_rounds: phase1.backward_rounds, forward_final_size: 0, backward_canonical_final_size: 0, meeting_attempts: 0, termination_reason: 1, rounds_completed: phase1.forward_rounds + phase1.backward_rounds, peak_forward_frontier: phase1.peak_forward_frontier, peak_backward_frontier: phase1.peak_backward_frontier };
        write_last_diag_stats(&stats);
        return -1;
    };

    let (result, stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);
    write_last_diag_stats(&stats);
    let Some(moves) = result else {
        return -1;
    };
    let buf = &mut *&raw mut DIAG_RESULT_BUF;
    buf.clear();
    for (face, sign_negative) in &moves {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }
    moves.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn diag_result_ptr() -> *const u8 {
    (&*&raw const DIAG_RESULT_BUF).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn diag_stats_ptr() -> *const u32 {
    (&raw const LAST_DIAG_STATS_WORDS) as *const u32
}

#[no_mangle]
pub unsafe extern "C" fn diag_round_log_count() -> u32 {
    ((&*&raw const DIAG_ROUND_LOG).len() / 8) as u32
}

#[no_mangle]
pub unsafe extern "C" fn diag_round_log_ptr() -> *const u64 {
    (&*&raw const DIAG_ROUND_LOG).as_ptr()
}

// -----------------------------------------------------------------------
// Meeting-distance diagnostic: for the FINAL forward/backward trees left
// in DIAG_STATE by diagnostic_run_v2 (a search that did NOT find an exact
// meeting), how close did the two canonical key sets actually get? An
// exact meeting is canonical_key equality -- 0 of the 5 tracked-edge
// slots differ. This asks: is there a forward/backward pair differing in
// exactly 1 slot? 2 slots? Each canonical key is a base-60, 5-digit
// packed number (see compute_edge_state_key_fast5's own dev notes) --
// decoding it into 5 digits and searching by WILDCARDING r of the 5
// slots (fixing the other 5-r as a hash-map key) finds all
// exactly-r-different pairs in O(n) per wildcard pattern, instead of the
// O(n*m) a naive all-pairs comparison would cost (intractable at this
// scale: forward ~300K x backward ~400K). Purely read-only: never
// influences solver behavior, never runs during an actual search.
// -----------------------------------------------------------------------

fn decode_base60_5(key: u64) -> [u8; 5] {
    let mut k = key;
    let mut digits = [0u8; 5];
    for i in (0..5).rev() {
        digits[i] = (k % 60) as u8;
        k /= 60;
    }
    digits
}

/// All C(5, r) ways to choose which `r` of the 5 slots are wildcarded,
/// returned as boolean masks (true = wildcarded/free, false = fixed).
fn slot_masks(r: usize) -> Vec<[bool; 5]> {
    let mut out = Vec::new();
    for bits in 0u32..32 {
        if (bits.count_ones() as usize) == r {
            let mut mask = [false; 5];
            for i in 0..5 {
                mask[i] = (bits >> i) & 1 == 1;
            }
            out.push(mask);
        }
    }
    out
}

fn fixed_pattern_key(digits: &[u8; 5], mask: &[bool; 5]) -> u64 {
    let mut key = 0u64;
    for i in 0..5 {
        if !mask[i] {
            key = key * 60 + digits[i] as u64;
        }
    }
    key
}

/// Searches radius 1 then radius 2 (in that order, stopping at the first
/// radius with any hit). Returns (best_radius_found, count_at_that_radius,
/// an example forward key, an example backward key) -- best_radius = u32::MAX
/// if neither radius 1 nor 2 found anything (forward and backward's
/// respective canonical spaces differ in 3+ of the 5 tracked slots
/// everywhere sampled).
fn meeting_distance_diagnostic(forward_keys: &[u64], backward_keys: &[u64]) -> (u32, u32, u64, u64) {
    for radius in 1..=2u32 {
        let masks = slot_masks(radius as usize);
        let mut count: u32 = 0;
        let mut example_fwd: u64 = 0;
        let mut example_bwd: u64 = 0;
        for mask in &masks {
            let mut backward_by_pattern: FastMap<u64, u64> = FastMap::default();
            for &bk in backward_keys {
                let digits = decode_base60_5(bk);
                let pattern = fixed_pattern_key(&digits, mask);
                backward_by_pattern.entry(pattern).or_insert(bk);
            }
            for &fk in forward_keys {
                let digits = decode_base60_5(fk);
                let pattern = fixed_pattern_key(&digits, mask);
                if let Some(&bk) = backward_by_pattern.get(&pattern) {
                    count += 1;
                    if count == 1 {
                        example_fwd = fk;
                        example_bwd = bk;
                    }
                }
            }
        }
        if count > 0 {
            return (radius, count, example_fwd, example_bwd);
        }
    }
    (u32::MAX, 0, 0, 0)
}

static mut DIAG_DISTANCE_RESULT: [u64; 4] = [0; 4]; // [best_radius, count_at_best, example_fwd_key, example_bwd_key]

/// Runs the meeting-distance diagnostic against DIAG_STATE (left populated
/// by the most recent diagnostic_run_v2 call). Returns 1 if DIAG_STATE is
/// available, 0 otherwise; results readable via diag_distance_result_ptr.
#[no_mangle]
pub unsafe extern "C" fn diag_meeting_distance() -> u32 {
    let st = &*&raw const DIAG_STATE;
    let Some(s) = st.as_ref() else { return 0 };
    let forward_keys: Vec<u64> = s.forward.canon_key.clone();
    let backward_keys: Vec<u64> = s.backward.canon_to_id.keys().copied().collect();
    let (best_radius, count, example_fwd, example_bwd) = meeting_distance_diagnostic(&forward_keys, &backward_keys);
    DIAG_DISTANCE_RESULT = [best_radius as u64, count as u64, example_fwd, example_bwd];
    1
}

#[no_mangle]
pub unsafe extern "C" fn diag_distance_result_ptr() -> *const u64 {
    (&raw const DIAG_DISTANCE_RESULT) as *const u64
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1 -- pure
// diagnostic/prototype Sprint. NO new search algorithm: phase1/phase2
// below are the EXACT SAME phase1_raw_capture_forward_v2_impl /
// phase2_diagnostic_v2_impl calls diagnostic_run_v2 already makes,
// completely unchanged -- this Sprint only asks a NEW question of the
// resulting forward/backward trees. The previous Sprint's meeting-distance
// diagnostic showed canonical-key radius-1 pairs exist in abundance at
// round 13; this Sprint tests whether that canonical-space proximity
// corresponds to an ACTUAL close pair of real (raw, full) states, and
// whether that real-space gap is bridgeable by a small (<=3),
// exhaustively-enumerated fixed sequence of genuine moves. Never touches
// solve_cross or any production entry point.
// =======================================================================

fn hamming5(a: u64, b: u64) -> u32 {
    let da = decode_base60_5(a);
    let db = decode_base60_5(b);
    (0..5).filter(|&i| da[i] != db[i]).count() as u32
}

struct Radius1Candidate {
    fid: u32,
    bid: u32,
    bk: u64,
    slot: u8,
    fwd_digit: u8,
    bwd_digit: u8,
}

const RADIUS1_CANDIDATE_CAP: usize = 300_000;

/// All (forward id, backward id) pairs whose CANONICAL keys differ in
/// EXACTLY one of the 5 tracked-edge digits -- same wildcard-hash
/// technique as meeting_distance_diagnostic (slot_masks/fixed_pattern_key/
/// decode_base60_5, all reused UNCHANGED), but returning the FULL
/// candidate list (every matching pair, not just a first-hit existence
/// count) so each candidate can be bridge-tested individually. Exact
/// (radius-0) matches are excluded (bk == fk skipped) -- this Sprint only
/// runs when diagnostic_run_v2's own phase2 already reported no exact
/// meeting, so none are expected, but the check is kept for soundness.
fn extract_radius1_candidates(forward_canon_key: &[u64], backward_canon_to_id: &FastMap<u64, u32>) -> (Vec<Radius1Candidate>, bool) {
    let mut out = Vec::new();
    let mut truncated = false;
    let masks = slot_masks(1);
    'extract: for mask in &masks {
        let slot = (0..5usize).find(|&i| mask[i]).unwrap() as u8;
        let mut backward_by_pattern: FastMap<u64, Vec<(u64, u32)>> = FastMap::default();
        for (&bk, &bid) in backward_canon_to_id.iter() {
            let digits = decode_base60_5(bk);
            let pattern = fixed_pattern_key(&digits, mask);
            backward_by_pattern.entry(pattern).or_default().push((bk, bid));
        }
        for (fid, &fk) in forward_canon_key.iter().enumerate() {
            let fdigits = decode_base60_5(fk);
            let pattern = fixed_pattern_key(&fdigits, mask);
            if let Some(bucket) = backward_by_pattern.get(&pattern) {
                for &(bk, bid) in bucket {
                    if bk == fk {
                        continue;
                    }
                    let bdigits = decode_base60_5(bk);
                    out.push(Radius1Candidate { fid: fid as u32, bid, bk, slot, fwd_digit: fdigits[slot as usize], bwd_digit: bdigits[slot as usize] });
                    if out.len() >= RADIUS1_CANDIDATE_CAP {
                        truncated = true;
                        break 'extract;
                    }
                }
            }
        }
    }
    (out, truncated)
}

/// Exhaustive, FIXED-depth (<=3) local move enumeration from `start`
/// (a genuine, real State reached via real moves) to any state whose
/// compute_edge_state_key_fast5 exactly equals `target_key`. Not a new
/// search algorithm -- brute-force enumeration over the same 24
/// (face, sign) move set apply_move already exposes, exactly as this
/// Sprint's own work order specifies ("작은 고정 depth의 exhaustive local
/// enumeration까지만 허용"). Early-exits at the shallowest depth that
/// finds a match.
fn try_bridge(start: &State, target_key: u64, max_depth: u32) -> Option<Vec<(u8, bool)>> {
    if compute_edge_state_key_fast5(start) == target_key {
        return Some(Vec::new());
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            if compute_edge_state_key_fast5(&st1) == target_key {
                return Some(vec![(f1, s1)]);
            }
        }
    }
    if max_depth < 2 {
        return None;
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    if compute_edge_state_key_fast5(&st2) == target_key {
                        return Some(vec![(f1, s1), (f2, s2)]);
                    }
                }
            }
        }
    }
    if max_depth < 3 {
        return None;
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    for f3 in 0u8..12 {
                        for &s3 in &[false, true] {
                            let st3 = apply_move(&st2, f3, s3);
                            if compute_edge_state_key_fast5(&st3) == target_key {
                                return Some(vec![(f1, s1), (f2, s2), (f3, s3)]);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// [0]=totalRadius1Candidates(canonical-space) [1..5]=realHamming{1..4,5+}Count
/// [6..8]=bridgeDepth{1,2,3}Count [9]=bridgeNotFoundCount(among realHamming1)
/// [10]=candidatesTested(==realHamming1Count) [11..15]=slotHistogram[0..4]
/// [16]=totalInternallyVerifiedSolutions [17]=sampleCount [18]=solutionsCount
/// [19]=candidatesTruncated(0/1) [20]=forwardFinalSize [21]=backwardFinalSize
static mut RADIUS1_STATS_WORDS: [u32; 24] = [0; 24];
/// 3 u64 words/record: [forwardRawKeyAtFid, bestTargetKeyAtBestK,
/// packed(slot|fwdDigit<<8|bwdDigit<<16|realHamming<<24|bridgeDepthMarker<<32|internallyValid<<40)].
/// bridgeDepthMarker: 0xFF=not tested(realHamming!=1), 0xFE=tested not found, else actual depth(1-3).
static mut RADIUS1_SAMPLE: Vec<u64> = Vec::new();
/// Fixed-stride records: [len(u8), bridgeDepth(u8), moves(len*2 bytes: face,signByte)], padded to RADIUS1_SOLUTION_STRIDE.
static mut RADIUS1_SOLUTIONS: Vec<u8> = Vec::new();
const RADIUS1_SOLUTION_STRIDE: usize = 66;
const RADIUS1_SAMPLE_CAP: usize = 50;
const RADIUS1_SOLUTIONS_CAP: usize = 20;

/// Orchestrator: runs the SAME phase1_raw_capture_forward_v2_impl +
/// phase2_diagnostic_v2_impl diagnostic_run_v2 already uses (unchanged),
/// and only when phase2 itself reports NO exact meeting (the residual
/// case this Sprint targets), extracts radius-1 candidates from the
/// resulting DIAG_STATE and bridge-tests each one. Returns 1 if the
/// bridge-test pipeline actually ran (phase2 exhausted without a meeting),
/// 0 if phase1 or phase2 already found an exact solution (nothing to
/// bridge -- not a residual case) or phase1 itself was frontier-exceeded.
#[no_mangle]
pub unsafe extern "C" fn radius1_bridge_run_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32) -> i32 {
    RADIUS1_STATS_WORDS = [0; 24];
    (&mut *&raw mut RADIUS1_SAMPLE).clear();
    (&mut *&raw mut RADIUS1_SOLUTIONS).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };

    // Unlike the earlier residual-3 Sprint's diagnostic_run_v2, this does
    // NOT early-return when phase2 already found an exact meeting: DIAG_STATE
    // is populated by phase2_diagnostic_v2_impl at EVERY return point (see
    // its own dev notes), including the exact-meeting case, so radius-1
    // candidates can be extracted (and are expected/required by this
    // Sprint's own work order) even for the already-solved comparison
    // fixtures (hard#5/hard#31) -- the near-miss pairs that exist ALONGSIDE
    // an exact hit are exactly what the previous Sprint's Gate D already
    // sampled via diag_meeting_distance for those same 2 fixtures.
    let (result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);
    let exact_meeting_found = result.is_some();

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 24];
    stats[0] = candidates.len() as u32;
    stats[19] = if truncated { 1 } else { 0 };
    stats[22] = if exact_meeting_found { 1 } else { 0 };
    stats[20] = forward.key_to_id.len() as u32;
    stats[21] = backward.canon_to_id.len() as u32;

    let sample = &mut *&raw mut RADIUS1_SAMPLE;
    let solutions = &mut *&raw mut RADIUS1_SOLUTIONS;
    let solved_key = compute_edge_state_key_fast5(&target);

    for c in &candidates {
        stats[11 + c.slot as usize] += 1;

        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let backward_real = apply_seq(target, &bpath);
        let f_raw = compute_edge_state_key_fast5(&f_state);

        let mut cur_b = backward_real;
        let mut best_k = 0usize;
        let mut best_h = 5u32;
        let mut best_target_key = 0u64;
        for k in 0..5 {
            let tk = compute_edge_state_key_fast5(&cur_b);
            let h = hamming5(f_raw, tk);
            if h < best_h {
                best_h = h;
                best_k = k;
                best_target_key = tk;
            }
            cur_b = conjugate_state_v2(&cur_b);
        }

        match best_h {
            1 => stats[1] += 1,
            2 => stats[2] += 1,
            3 => stats[3] += 1,
            4 => stats[4] += 1,
            _ => stats[5] += 1,
        }

        let mut bridge_depth_marker: u8 = 0xFF;
        let mut internally_valid = false;

        if best_h == 1 {
            stats[10] += 1;
            match try_bridge(&f_state, best_target_key, max_bridge_depth) {
                None => {
                    stats[9] += 1;
                    bridge_depth_marker = 0xFE;
                }
                Some(bridge_moves) => {
                    let depth = bridge_moves.len() as u32;
                    bridge_depth_marker = depth as u8;
                    match depth {
                        1 => stats[6] += 1,
                        2 => stats[7] += 1,
                        3 => stats[8] += 1,
                        _ => {}
                    }

                    let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[best_k]]);
                    let mut combined = fpath.clone();
                    combined.extend(bridge_moves.iter().copied());
                    combined.extend(invert_pairs(&conjugated_backward_path));

                    let replayed = apply_seq(state, &combined);
                    internally_valid = compute_edge_state_key_fast5(&replayed) == solved_key;

                    if internally_valid {
                        stats[16] += 1;
                        if solutions.len() / RADIUS1_SOLUTION_STRIDE < RADIUS1_SOLUTIONS_CAP {
                            let mut rec = vec![0u8; RADIUS1_SOLUTION_STRIDE];
                            let len = combined.len().min(32);
                            rec[0] = len as u8;
                            rec[1] = depth as u8;
                            for (i, &(face, sign_negative)) in combined.iter().take(32).enumerate() {
                                rec[2 + i * 2] = face;
                                rec[2 + i * 2 + 1] = if sign_negative { 1 } else { 0 };
                            }
                            solutions.extend_from_slice(&rec);
                        }
                    }
                }
            }
        }

        if sample.len() / 3 < RADIUS1_SAMPLE_CAP {
            let packed: u64 = (c.slot as u64) | ((c.fwd_digit as u64) << 8) | ((c.bwd_digit as u64) << 16) | ((best_h as u64) << 24) | ((bridge_depth_marker as u64) << 32) | ((internally_valid as u64) << 40);
            sample.push(f_raw);
            sample.push(best_target_key);
            sample.push(packed);
        }
    }

    stats[17] = (sample.len() / 3) as u32;
    stats[18] = (solutions.len() / RADIUS1_SOLUTION_STRIDE) as u32;
    RADIUS1_STATS_WORDS = stats;
    1
}

#[no_mangle]
pub unsafe extern "C" fn radius1_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_sample_count() -> u32 {
    ((&*&raw const RADIUS1_SAMPLE).len() / 3) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_sample_ptr() -> *const u64 {
    (&*&raw const RADIUS1_SAMPLE).as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn radius1_solutions_count() -> u32 {
    ((&*&raw const RADIUS1_SOLUTIONS).len() / RADIUS1_SOLUTION_STRIDE) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_solutions_ptr() -> *const u8 {
    (&*&raw const RADIUS1_SOLUTIONS).as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn radius1_solution_stride() -> u32 {
    RADIUS1_SOLUTION_STRIDE as u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1
// -- fixes the previous Sprint's own symmetry-direction mismatch and
// switches from exhaustive-all-candidates to first-valid-solution
// early-exit. NO new symmetry: reuses the EXISTING, already-validated
// find_symmetry_index (conjugates the FORWARD state, compares against
// backward's own FIXED real_key -- the established convention every
// other meeting/try_meet call site in this file already uses), instead
// of last Sprint's ad-hoc "conjugate backward, compare to forward's fixed
// key" direction, which is why only 173/1075 of last Sprint's found local
// bridges (normal#28) survived the FULL combined-solution replay check.
// The bridge ACCEPTANCE criterion is simplified to a single, principled
// check -- does canonical_key_v2 of the (possibly bridged) forward state
// exactly equal backward's own canonical key? -- which is exactly the
// same "meeting" criterion the rest of this file's forward/backward
// dedup already relies on, and which guarantees find_symmetry_index
// succeeds (a missing hit there is already documented as a soundness bug
// this Sprint would have caught, per find_symmetry_index's own doc
// comment). Still no new search algorithm: depth 1/2/3 remain a plain,
// fixed, exhaustively-enumerated local move check.
// =======================================================================

/// Exhaustive, FIXED-depth (<=3) local move enumeration from `start`,
/// accepting a candidate the moment its CANONICAL key (canonical_key_v2,
/// unchanged, reused as-is) exactly equals `target_canon` -- backward's
/// own canonical key for this candidate pair. This is the single
/// "meeting" criterion the rest of this file already trusts (forward.
/// canon_key vs backward.canon_to_id), so a match here is guaranteed
/// (by the same soundness property find_symmetry_index's own doc comment
/// already documents) to yield a valid combination via find_symmetry_index.
fn try_bridge_canonical(start: &State, target_canon: u64, max_depth: u32) -> Option<Vec<(u8, bool)>> {
    if canonical_key_v2(start) == target_canon {
        return Some(Vec::new());
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            if canonical_key_v2(&st1) == target_canon {
                return Some(vec![(f1, s1)]);
            }
        }
    }
    if max_depth < 2 {
        return None;
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    if canonical_key_v2(&st2) == target_canon {
                        return Some(vec![(f1, s1), (f2, s2)]);
                    }
                }
            }
        }
    }
    if max_depth < 3 {
        return None;
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    for f3 in 0u8..12 {
                        for &s3 in &[false, true] {
                            let st3 = apply_move(&st2, f3, s3);
                            if canonical_key_v2(&st3) == target_canon {
                                return Some(vec![(f1, s1), (f2, s2), (f3, s3)]);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// [0]=candidatesScanned(before success or exhaustion) [1]=totalCandidates
/// (extraction count, for context) [2]=found(0/1) [3]=bridgeDepth(0-3, 0
/// if depth-0 i.e. the candidate's own state already matched -- should
/// not occur since extraction excludes exact matches) [4]=solutionLength
/// [5]=internallyValid(0/1) [6]=candidatesTruncated(0/1, from extraction)
/// [7]=forwardFinalSize [8]=backwardFinalSize
static mut RADIUS1_EE_STATS_WORDS: [u32; 9] = [0; 9];
static mut RADIUS1_EE_RESULT_BUF: Vec<u8> = Vec::new();

/// Orchestrator: SAME phase1/phase2 reuse as radius1_bridge_run_v1
/// (unchanged), SAME extract_radius1_candidates (unchanged), but stops at
/// the FIRST candidate whose bridge produces an internally-verified
/// (replayed from `state`, full 5-tracked-edge match against target)
/// complete solution -- not the first "local bridge found" the way the
/// previous Sprint measured, and not after exhausting every candidate.
/// Uses find_symmetry_index (existing, unchanged) for the final
/// combination, matching its own established convention exactly (conjugate
/// the FORWARD state, compare against backward's fixed real_key).
#[no_mangle]
pub unsafe extern "C" fn radius1_bridge_early_exit_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32) -> i32 {
    RADIUS1_EE_STATS_WORDS = [0; 9];
    (&mut *&raw mut RADIUS1_EE_RESULT_BUF).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };

    let (result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);
    let _exact_meeting_found = result.is_some();

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 9];
    stats[1] = candidates.len() as u32;
    stats[6] = if truncated { 1 } else { 0 };
    stats[7] = forward.key_to_id.len() as u32;
    stats[8] = backward.canon_to_id.len() as u32;

    let solved_key = compute_edge_state_key_fast5(&target);
    let mut scanned: u32 = 0;

    for c in &candidates {
        scanned += 1;

        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);

        let Some(bridge_moves) = try_bridge_canonical(&f_state, c.bk, max_bridge_depth) else {
            continue;
        };
        let bridged_state = apply_seq(f_state, &bridge_moves);

        let rep_key = backward.real_key[c.bid as usize];
        let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);

        let mut combined = fpath.clone();
        combined.extend(bridge_moves.iter().copied());
        combined.extend(invert_pairs(&conjugated_backward_path));

        let replayed = apply_seq(state, &combined);
        let internally_valid = compute_edge_state_key_fast5(&replayed) == solved_key;

        stats[0] = scanned;
        stats[2] = 1;
        stats[3] = bridge_moves.len() as u32;
        stats[4] = combined.len() as u32;
        stats[5] = if internally_valid { 1 } else { 0 };

        let buf = &mut *&raw mut RADIUS1_EE_RESULT_BUF;
        buf.clear();
        for &(face, sign_negative) in &combined {
            buf.push(face);
            buf.push(if sign_negative { 1 } else { 0 });
        }

        RADIUS1_EE_STATS_WORDS = stats;
        return if internally_valid { 1 } else { -1 };
    }

    stats[0] = scanned;
    stats[2] = 0;
    RADIUS1_EE_STATS_WORDS = stats;
    0
}

#[no_mangle]
pub unsafe extern "C" fn radius1_ee_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_EE_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_ee_result_len() -> u32 {
    ((&*&raw const RADIUS1_EE_RESULT_BUF).len() / 2) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_ee_result_ptr() -> *const u8 {
    (&*&raw const RADIUS1_EE_RESULT_BUF).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1 --
// pure diagnostic/validation Sprint. NO change to find_symmetry_index, the
// C5 symmetry definition, candidate ordering, or the depth 1->2->3 bridge
// structure -- try_bridge_canonical/radius1_bridge_early_exit_v1 (last
// Sprint) are reused completely UNCHANGED for the "before" baseline and
// for the filtered early-exit's own actual bridge-testing once a
// candidate passes the filter. This Sprint asks one question: can a CHEAP
// raw-key check, run BEFORE the expensive canonical_key_v2-based depth-3
// exhaustive enumeration, safely reject candidates without ever rejecting
// one that would have produced a valid bridge (false negative = 0)?
// =======================================================================

/// The 5 raw (compute_edge_state_key_fast5) keys of a state's own C5
/// orbit -- state, conjugate_state_v2(state), ..., conjugate_state_v2^4
/// (state) -- computed once per state so the raw-key prefilter can check
/// ALL 5x5 = 25 (candidate-power, backward-power) pairs cheaply, not just
/// one specific power. This is the SAME conjugate_state_v2/
/// compute_edge_state_key_fast5 this whole V2 pipeline already uses,
/// applied in a loop -- no new symmetry.
fn conjugate_orbit_raw_keys(state: &State) -> [u64; 5] {
    let mut out = [0u64; 5];
    let mut cur = *state;
    for slot in out.iter_mut() {
        *slot = compute_edge_state_key_fast5(&cur);
        cur = conjugate_state_v2(&cur);
    }
    out
}

/// Minimum Hamming distance (in the 5-tracked-edge digit sense) across
/// ALL 25 pairings of candidate's own C5 orbit against backward_real's
/// own C5 orbit -- the raw-key-space analogue of "same canonical orbit"
/// (canonical_key_v2 equality), computed WITHOUT any canonical_key_v2
/// call (no per-pair min-reduction, no packing beyond what
/// compute_edge_state_key_fast5 already did once per orbit member).
fn raw_hamming_min_over_orbits(a: &[u64; 5], b: &[u64; 5]) -> u32 {
    let mut best = 5u32;
    for &x in a {
        for &y in b {
            let h = hamming5(x, y);
            if h < best {
                best = h;
            }
            if best == 0 {
                return 0;
            }
        }
    }
    best
}

/// Byte-for-byte the SAME depth-1-then-2-then-3 exhaustive local move
/// enumeration as try_bridge_canonical (last Sprint, left completely
/// unmodified above) -- this copy ONLY adds a call counter, purely for
/// this Sprint's own cost-attribution measurement. Never used by
/// production or by the early-exit path itself; try_bridge_canonical
/// remains the one actually wired into radius1_bridge_early_exit_v1.
fn try_bridge_canonical_counted(start: &State, target_canon: u64, max_depth: u32) -> (Option<Vec<(u8, bool)>>, u32) {
    let mut calls: u32 = 0;
    macro_rules! check {
        ($st:expr) => {{
            calls += 1;
            canonical_key_v2($st) == target_canon
        }};
    }
    if check!(start) {
        return (Some(Vec::new()), calls);
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            if check!(&st1) {
                return (Some(vec![(f1, s1)]), calls);
            }
        }
    }
    if max_depth < 2 {
        return (None, calls);
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    if check!(&st2) {
                        return (Some(vec![(f1, s1), (f2, s2)]), calls);
                    }
                }
            }
        }
    }
    if max_depth < 3 {
        return (None, calls);
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    for f3 in 0u8..12 {
                        for &s3 in &[false, true] {
                            let st3 = apply_move(&st2, f3, s3);
                            if check!(&st3) {
                                return (Some(vec![(f1, s1), (f2, s2), (f3, s3)]), calls);
                            }
                        }
                    }
                }
            }
        }
    }
    (None, calls)
}

/// [0]=candidatesAnalyzed [1]=totalCandidates(extraction) [2]=truePositive
/// (rawHam<=1 AND bridgeFound) [3]=falsePositive(rawHam<=1 AND NOT found)
/// [4]=falseNegative(rawHam>1 AND bridgeFound -- DANGEROUS if >0)
/// [5]=trueNegative(rawHam>1 AND NOT found) [6]=canonicalKeyCallsTotal
/// [7]=canonicalKeyCallsIfFiltered(sum over rawHam<=1 candidates only --
/// i.e. calls that a rawHam>1-reject filter would NOT have skipped)
/// [8]=candidatesTruncated(0/1) [9]=forwardFinalSize [10]=backwardFinalSize
static mut RADIUS1_PF_STATS_WORDS: [u32; 11] = [0; 11];
/// Up to RADIUS1_PF_SAMPLE_CAP per-candidate rows, 4 u64 words each:
/// [candidateIndex, packed(rawHamming<<0 | canonicalHamming<<8 |
/// bridgeDepthAttempted<<16 | canonicalKeyCalls<<24 | bridgeFound<<56 |
/// completeSolutionValid<<57), fid, bid].
static mut RADIUS1_PF_SAMPLE: Vec<u64> = Vec::new();
const RADIUS1_PF_SAMPLE_CAP: usize = 200;

/// Orchestrator for Gate B/C: SAME phase1/phase2/extract_radius1_candidates
/// as previous Sprints (all unchanged), then for up to `candidate_cap`
/// candidates (first N in the SAME extraction order -- no reordering),
/// computes BOTH the cheap raw_hamming_min_over_orbits pre-check AND the
/// expensive ground truth (try_bridge_canonical_counted), so the F1
/// filter's false-negative rate can be measured directly rather than
/// assumed.
#[no_mangle]
pub unsafe extern "C" fn radius1_prefilter_analysis_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32, candidate_cap: u32) -> i32 {
    RADIUS1_PF_STATS_WORDS = [0; 11];
    (&mut *&raw mut RADIUS1_PF_SAMPLE).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 11];
    stats[1] = candidates.len() as u32;
    stats[8] = if truncated { 1 } else { 0 };
    stats[9] = forward.key_to_id.len() as u32;
    stats[10] = backward.canon_to_id.len() as u32;

    let solved_key = compute_edge_state_key_fast5(&target);
    let sample = &mut *&raw mut RADIUS1_PF_SAMPLE;
    let limit = (candidate_cap as usize).min(candidates.len());

    for (idx, c) in candidates.iter().take(limit).enumerate() {
        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let backward_real = apply_seq(target, &bpath);

        let raw_ham = raw_hamming_min_over_orbits(&conjugate_orbit_raw_keys(&f_state), &conjugate_orbit_raw_keys(&backward_real));

        let (bridge_result, calls) = try_bridge_canonical_counted(&f_state, c.bk, max_bridge_depth);
        stats[6] += calls;
        if raw_ham <= 1 {
            stats[7] += calls;
        }

        let bridge_found = bridge_result.is_some();
        let mut complete_valid = false;
        let mut bridge_depth = 0u32;
        if let Some(bridge_moves) = &bridge_result {
            bridge_depth = bridge_moves.len() as u32;
            let bridged_state = apply_seq(f_state, bridge_moves);
            let rep_key = backward.real_key[c.bid as usize];
            let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
            let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath.clone();
            combined.extend(bridge_moves.iter().copied());
            combined.extend(invert_pairs(&conjugated_backward_path));
            let replayed = apply_seq(state, &combined);
            complete_valid = compute_edge_state_key_fast5(&replayed) == solved_key;
        }

        match (raw_ham <= 1, bridge_found) {
            (true, true) => stats[2] += 1,
            (true, false) => stats[3] += 1,
            (false, true) => stats[4] += 1,
            (false, false) => stats[5] += 1,
        }

        if sample.len() / 4 < RADIUS1_PF_SAMPLE_CAP {
            let packed: u64 = (raw_ham.min(255) as u64) | ((1u64) << 8) | ((bridge_depth as u64) << 16) | ((calls as u64) << 24) | ((bridge_found as u64) << 56) | ((complete_valid as u64) << 57);
            sample.push(idx as u64);
            sample.push(packed);
            sample.push(c.fid as u64);
            sample.push(c.bid as u64);
        }
    }

    stats[0] = limit as u32;
    RADIUS1_PF_STATS_WORDS = stats;
    1
}

#[no_mangle]
pub unsafe extern "C" fn radius1_pf_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_PF_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_pf_sample_count() -> u32 {
    ((&*&raw const RADIUS1_PF_SAMPLE).len() / 4) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_pf_sample_ptr() -> *const u64 {
    (&*&raw const RADIUS1_PF_SAMPLE).as_ptr()
}

/// [0]=candidatesScanned [1]=candidatesSkippedByFilter [2]=found(0/1)
/// [3]=bridgeDepth [4]=solutionLength [5]=internallyValid(0/1)
/// [6]=candidatesTruncated(0/1) [7]=totalCandidates [8]=forwardFinalSize
/// [9]=backwardFinalSize
static mut RADIUS1_FEE_STATS_WORDS: [u32; 10] = [0; 10];
static mut RADIUS1_FEE_RESULT_BUF: Vec<u8> = Vec::new();

/// Gate D: the SAME early-exit loop as radius1_bridge_early_exit_v1 (last
/// Sprint, left completely unmodified above), with exactly ONE addition --
/// a cheap raw_hamming_min_over_orbits(<=1) pre-check before calling
/// try_bridge_canonical, skipping the expensive canonical_key_v2
/// exhaustion for any candidate the filter rejects. Candidate order,
/// bridge depth structure, find_symmetry_index, and the final combination
/// are all byte-for-byte identical to the unfiltered version.
#[no_mangle]
pub unsafe extern "C" fn radius1_bridge_early_exit_filtered_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32) -> i32 {
    RADIUS1_FEE_STATS_WORDS = [0; 10];
    (&mut *&raw mut RADIUS1_FEE_RESULT_BUF).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 10];
    stats[6] = if truncated { 1 } else { 0 };
    stats[7] = candidates.len() as u32;
    stats[8] = forward.key_to_id.len() as u32;
    stats[9] = backward.canon_to_id.len() as u32;

    let solved_key = compute_edge_state_key_fast5(&target);
    let mut scanned: u32 = 0;
    let mut skipped: u32 = 0;

    for c in &candidates {
        scanned += 1;

        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let backward_real = apply_seq(target, &bpath);

        let raw_ham = raw_hamming_min_over_orbits(&conjugate_orbit_raw_keys(&f_state), &conjugate_orbit_raw_keys(&backward_real));
        if raw_ham > 1 {
            skipped += 1;
            continue;
        }

        let Some(bridge_moves) = try_bridge_canonical(&f_state, c.bk, max_bridge_depth) else {
            continue;
        };
        let bridged_state = apply_seq(f_state, &bridge_moves);

        let rep_key = backward.real_key[c.bid as usize];
        let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
        let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);

        let mut combined = fpath.clone();
        combined.extend(bridge_moves.iter().copied());
        combined.extend(invert_pairs(&conjugated_backward_path));

        let replayed = apply_seq(state, &combined);
        let internally_valid = compute_edge_state_key_fast5(&replayed) == solved_key;

        stats[0] = scanned;
        stats[1] = skipped;
        stats[2] = 1;
        stats[3] = bridge_moves.len() as u32;
        stats[4] = combined.len() as u32;
        stats[5] = if internally_valid { 1 } else { 0 };

        let buf = &mut *&raw mut RADIUS1_FEE_RESULT_BUF;
        buf.clear();
        for &(face, sign_negative) in &combined {
            buf.push(face);
            buf.push(if sign_negative { 1 } else { 0 });
        }

        RADIUS1_FEE_STATS_WORDS = stats;
        return if internally_valid { 1 } else { -1 };
    }

    stats[0] = scanned;
    stats[1] = skipped;
    stats[2] = 0;
    RADIUS1_FEE_STATS_WORDS = stats;
    0
}

#[no_mangle]
pub unsafe extern "C" fn radius1_fee_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_FEE_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_fee_result_len() -> u32 {
    ((&*&raw const RADIUS1_FEE_RESULT_BUF).len() / 2) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_fee_result_ptr() -> *const u8 {
    (&*&raw const RADIUS1_FEE_RESULT_BUF).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1 --
// pure measurement Sprint. NO candidate sorting change, NO new heuristic
// search, NO bridge-depth change, NO canonicalization change, NO
// production/depth14 change. extract_radius1_candidates (extraction
// order), try_bridge_canonical, and find_symmetry_index are all reused
// completely UNCHANGED -- this Sprint only asks whether information
// ALREADY present per candidate (its position in the existing order,
// which C5 power is canonical for it, how far apart forward/backward
// discovered it, whether the single differing digit is a permutation or
// orientation mismatch, ...) correlates with whether that candidate's
// bridge actually succeeds -- i.e. whether a FUTURE reordering Sprint
// would have any real signal to exploit, or whether success is already
// close to uniformly distributed (in which case cheapening each
// candidate's own depth-3 test, not reordering, is the better next axis).
// =======================================================================

/// Same loop canonical_key_v2 itself runs, but also returns WHICH of the
/// 5 conjugate powers achieved the minimum -- purely for this Sprint's
/// own feature reporting; canonical_key_v2 itself is untouched and still
/// the one every bridge-acceptance check actually uses.
fn canonical_power_and_key(state: &State) -> (usize, u64) {
    let mut best_power = 0usize;
    let mut best_key = compute_edge_state_key_fast5(state);
    let mut cur = *state;
    for p in 1..5 {
        cur = conjugate_state_v2(&cur);
        let k = compute_edge_state_key_fast5(&cur);
        if k < best_key {
            best_key = k;
            best_power = p;
        }
    }
    (best_power, best_key)
}

/// [0]=analyzed [1]=totalCandidates(extraction) [2]=truePositiveCount
/// [3]=candidatesTruncated(extraction cap, 0/1) [4]=forwardFinalSize
/// [5]=backwardFinalSize
static mut RADIUS1_CO_STATS_WORDS: [u32; 6] = [0; 6];
/// 4 u64 words/row:
/// word0 = candidateIndex(u32) | changedSlot<<32(u8) | forwardDepth<<40(u8)
///         | backwardDepth<<48(u8) | rawKeyDistance<<56(u8)
/// word1 = forwardCanonicalPower(u8) | backwardCanonicalPower<<8(u8)
///         | canonicalKeyDistance<<16(u8, constant 1) | matchingSlots<<24(u8, constant 4)
///         | permutationDiffers<<32(bool) | orientationDiffers<<33(bool)
///         | bridgeFound<<34(bool) | bridgeDepth<<35(u8) | completeSolutionValid<<40(bool)
/// word2 = forwardDiscoveryIndex (fid)
/// word3 = backwardDiscoveryIndex (bid)
static mut RADIUS1_CO_ROWS: Vec<u64> = Vec::new();

/// Orchestrator: SAME phase1/phase2/extract_radius1_candidates as every
/// previous radius-1 Sprint (all unchanged), then for up to
/// `candidate_cap` candidates (first N in the EXTRACTION's own order --
/// never reordered), records the feature set above plus the SAME
/// try_bridge_canonical/find_symmetry_index ground truth already
/// validated in the early-exit Sprint. Pure read-only analysis.
#[no_mangle]
pub unsafe extern "C" fn radius1_candidate_order_analysis_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32, candidate_cap: u32) -> i32 {
    RADIUS1_CO_STATS_WORDS = [0; 6];
    (&mut *&raw mut RADIUS1_CO_ROWS).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 6];
    stats[1] = candidates.len() as u32;
    stats[3] = if truncated { 1 } else { 0 };
    stats[4] = forward.key_to_id.len() as u32;
    stats[5] = backward.canon_to_id.len() as u32;

    let solved_key = compute_edge_state_key_fast5(&target);
    let rows = &mut *&raw mut RADIUS1_CO_ROWS;
    let limit = (candidate_cap as usize).min(candidates.len());
    let mut true_positive: u32 = 0;

    for (idx, c) in candidates.iter().take(limit).enumerate() {
        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let backward_real = apply_seq(target, &bpath);

        let forward_depth = fpath.len().min(255) as u64;
        let backward_depth = bpath.len().min(255) as u64;

        let (fwd_power, _) = canonical_power_and_key(&f_state);
        let (bwd_power, _) = canonical_power_and_key(&backward_real);

        let raw_ham = raw_hamming_min_over_orbits(&conjugate_orbit_raw_keys(&f_state), &conjugate_orbit_raw_keys(&backward_real));

        let pos_fwd = c.fwd_digit / 2;
        let orient_fwd = c.fwd_digit % 2;
        let pos_bwd = c.bwd_digit / 2;
        let orient_bwd = c.bwd_digit % 2;
        let perm_differs = pos_fwd != pos_bwd;
        let orient_differs = orient_fwd != orient_bwd;

        let bridge_result = try_bridge_canonical(&f_state, c.bk, max_bridge_depth);
        let bridge_found = bridge_result.is_some();
        let mut bridge_depth: u64 = 0;
        let mut complete_valid = false;
        if let Some(bridge_moves) = &bridge_result {
            bridge_depth = bridge_moves.len() as u64;
            let bridged_state = apply_seq(f_state, bridge_moves);
            let rep_key = backward.real_key[c.bid as usize];
            let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
            let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath.clone();
            combined.extend(bridge_moves.iter().copied());
            combined.extend(invert_pairs(&conjugated_backward_path));
            let replayed = apply_seq(state, &combined);
            complete_valid = compute_edge_state_key_fast5(&replayed) == solved_key;
        }
        if bridge_found {
            true_positive += 1;
        }

        let word0 = (idx as u64) | ((c.slot as u64) << 32) | (forward_depth << 40) | (backward_depth << 48) | ((raw_ham as u64) << 56);
        let word1 = (fwd_power as u64) | ((bwd_power as u64) << 8) | (1u64 << 16) | (4u64 << 24) | ((perm_differs as u64) << 32) | ((orient_differs as u64) << 33) | ((bridge_found as u64) << 34) | (bridge_depth << 35) | ((complete_valid as u64) << 40);
        rows.push(word0);
        rows.push(word1);
        rows.push(c.fid as u64);
        rows.push(c.bid as u64);
    }

    stats[0] = limit as u32;
    stats[2] = true_positive;
    RADIUS1_CO_STATS_WORDS = stats;
    1
}

#[no_mangle]
pub unsafe extern "C" fn radius1_co_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_CO_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_co_row_count() -> u32 {
    ((&*&raw const RADIUS1_CO_ROWS).len() / 4) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_co_rows_ptr() -> *const u64 {
    (&*&raw const RADIUS1_CO_ROWS).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1 --
// tests whether STABLE-partitioning the radius-1 candidate list by
// orientationDiffers (bucket A = true, tried first; bucket B = false,
// tried second -- relative order WITHIN each bucket is the SAME as
// extract_radius1_candidates already produced) reduces the actual
// early-exit cost, WITHOUT dropping a single candidate (completeness is
// unaffected: every candidate is still tried, only the traversal order
// changes). extract_radius1_candidates, try_bridge_canonical, and
// find_symmetry_index are all reused completely UNCHANGED. No candidate
// is ever skipped -- this is ordering, not filtering (last Sprint's
// rejected axis).
// =======================================================================

fn orientation_differs(c: &Radius1Candidate) -> bool {
    (c.fwd_digit % 2) != (c.bwd_digit % 2)
}

/// Stable partition: bucket A (orientationDiffers=true) first, bucket B
/// (orientationDiffers=false) second, EACH preserving the original
/// extraction order internally. No candidate is dropped -- len(A)+len(B)
/// == candidates.len() always.
fn partition_by_orientation(candidates: Vec<Radius1Candidate>) -> (Vec<Radius1Candidate>, Vec<Radius1Candidate>) {
    let mut a = Vec::new();
    let mut b = Vec::new();
    for c in candidates {
        if orientation_differs(&c) {
            a.push(c);
        } else {
            b.push(c);
        }
    }
    (a, b)
}

/// [0]=candidatesScanned(in NEW/reordered sequence) [1]=found(0/1)
/// [2]=bridgeDepth [3]=solutionLength [4]=internallyValid(0/1)
/// [5]=candidatesTruncated(extraction, 0/1) [6]=totalCandidates
/// [7]=forwardFinalSize [8]=backwardFinalSize [9]=bucketASize(orientationDiffers=true)
/// [10]=bucketBSize(orientationDiffers=false) [11]=foundInBucketA(0/1)
static mut RADIUS1_OO_STATS_WORDS: [u32; 12] = [0; 12];
static mut RADIUS1_OO_RESULT_BUF: Vec<u8> = Vec::new();

/// Gate A/B: the SAME early-exit loop as radius1_bridge_early_exit_v1
/// (unmodified above), but iterating candidates in the reordered
/// (bucket A ++ bucket B) sequence instead of the raw extraction order.
/// Candidate SET, bridge depth structure, find_symmetry_index, and the
/// final combination are all byte-for-byte identical to the unreordered
/// version -- only traversal order differs.
#[no_mangle]
pub unsafe extern "C" fn radius1_bridge_early_exit_reordered_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32) -> i32 {
    RADIUS1_OO_STATS_WORDS = [0; 12];
    (&mut *&raw mut RADIUS1_OO_RESULT_BUF).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let total_candidates = candidates.len() as u32;
    let (bucket_a, bucket_b) = partition_by_orientation(candidates);
    let bucket_a_size = bucket_a.len() as u32;
    let bucket_b_size = bucket_b.len() as u32;

    let mut stats = [0u32; 12];
    stats[5] = if truncated { 1 } else { 0 };
    stats[6] = total_candidates;
    stats[7] = forward.key_to_id.len() as u32;
    stats[8] = backward.canon_to_id.len() as u32;
    stats[9] = bucket_a_size;
    stats[10] = bucket_b_size;

    let solved_key = compute_edge_state_key_fast5(&target);
    let mut scanned: u32 = 0;

    for (bucket_idx, c) in bucket_a.iter().chain(bucket_b.iter()).enumerate() {
        scanned += 1;
        let in_bucket_a = bucket_idx < bucket_a.len();

        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);

        let Some(bridge_moves) = try_bridge_canonical(&f_state, c.bk, max_bridge_depth) else {
            continue;
        };
        let bridged_state = apply_seq(f_state, &bridge_moves);

        let rep_key = backward.real_key[c.bid as usize];
        let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);

        let mut combined = fpath.clone();
        combined.extend(bridge_moves.iter().copied());
        combined.extend(invert_pairs(&conjugated_backward_path));

        let replayed = apply_seq(state, &combined);
        let internally_valid = compute_edge_state_key_fast5(&replayed) == solved_key;

        stats[0] = scanned;
        stats[1] = 1;
        stats[2] = bridge_moves.len() as u32;
        stats[3] = combined.len() as u32;
        stats[4] = if internally_valid { 1 } else { 0 };
        stats[11] = if in_bucket_a { 1 } else { 0 };

        let buf = &mut *&raw mut RADIUS1_OO_RESULT_BUF;
        buf.clear();
        for &(face, sign_negative) in &combined {
            buf.push(face);
            buf.push(if sign_negative { 1 } else { 0 });
        }

        RADIUS1_OO_STATS_WORDS = stats;
        return if internally_valid { 1 } else { -1 };
    }

    stats[0] = scanned;
    stats[1] = 0;
    RADIUS1_OO_STATS_WORDS = stats;
    0
}

#[no_mangle]
pub unsafe extern "C" fn radius1_oo_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_OO_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_oo_result_len() -> u32 {
    ((&*&raw const RADIUS1_OO_RESULT_BUF).len() / 2) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_oo_result_ptr() -> *const u8 {
    (&*&raw const RADIUS1_OO_RESULT_BUF).as_ptr()
}

/// [0]=analyzed [1]=totalCandidates(extraction) [2]=truePositiveCount
/// [3]=candidatesTruncated(0/1) [4]=forwardFinalSize [5]=backwardFinalSize
/// [6]=bucketASize [7]=bucketBSize
static mut RADIUS1_OA_STATS_WORDS: [u32; 8] = [0; 8];
/// 5 u64 words/row: word0/word1 same packing as RADIUS1_CO_ROWS (rank is
/// now the REORDERED position), word2=fid, word3=bid, word4=originalIndex
/// (this candidate's rank in the raw, unreordered extraction order).
/// word1 additionally sets bit 48 = inBucketA.
static mut RADIUS1_OA_ROWS: Vec<u64> = Vec::new();

/// Gate C: same per-candidate feature+ground-truth analysis as
/// radius1_candidate_order_analysis_v1 (last Sprint), but over the
/// REORDERED (bucket A ++ bucket B) sequence, so the cumulative
/// success-by-rank table can be recomputed for the new order and compared
/// directly against the old one. Every candidate present in the original
/// extraction is still present here -- only order changes.
#[no_mangle]
pub unsafe extern "C" fn radius1_orientation_order_analysis_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32, candidate_cap: u32) -> i32 {
    RADIUS1_OA_STATS_WORDS = [0; 8];
    (&mut *&raw mut RADIUS1_OA_ROWS).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let total_candidates = candidates.len() as u32;
    let indexed: Vec<(u32, Radius1Candidate)> = candidates.into_iter().enumerate().map(|(i, c)| (i as u32, c)).collect();
    let mut bucket_a: Vec<(u32, Radius1Candidate)> = Vec::new();
    let mut bucket_b: Vec<(u32, Radius1Candidate)> = Vec::new();
    for (i, c) in indexed {
        if orientation_differs(&c) {
            bucket_a.push((i, c));
        } else {
            bucket_b.push((i, c));
        }
    }
    let bucket_a_size = bucket_a.len() as u32;
    let bucket_b_size = bucket_b.len() as u32;

    let mut stats = [0u32; 8];
    stats[1] = total_candidates;
    stats[3] = if truncated { 1 } else { 0 };
    stats[4] = forward.key_to_id.len() as u32;
    stats[5] = backward.canon_to_id.len() as u32;
    stats[6] = bucket_a_size;
    stats[7] = bucket_b_size;

    let solved_key = compute_edge_state_key_fast5(&target);
    let rows = &mut *&raw mut RADIUS1_OA_ROWS;
    let reordered: Vec<(bool, u32, &Radius1Candidate)> = bucket_a.iter().map(|(i, c)| (true, *i, c)).chain(bucket_b.iter().map(|(i, c)| (false, *i, c))).collect();
    let limit = (candidate_cap as usize).min(reordered.len());
    let mut true_positive: u32 = 0;

    for (new_rank, &(in_bucket_a, orig_idx, c)) in reordered.iter().take(limit).enumerate() {
        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let backward_real = apply_seq(target, &bpath);

        let forward_depth = fpath.len().min(255) as u64;
        let backward_depth = bpath.len().min(255) as u64;
        let (fwd_power, _) = canonical_power_and_key(&f_state);
        let (bwd_power, _) = canonical_power_and_key(&backward_real);
        let raw_ham = raw_hamming_min_over_orbits(&conjugate_orbit_raw_keys(&f_state), &conjugate_orbit_raw_keys(&backward_real));

        let bridge_result = try_bridge_canonical(&f_state, c.bk, max_bridge_depth);
        let bridge_found = bridge_result.is_some();
        let mut bridge_depth: u64 = 0;
        let mut complete_valid = false;
        if let Some(bridge_moves) = &bridge_result {
            bridge_depth = bridge_moves.len() as u64;
            let bridged_state = apply_seq(f_state, bridge_moves);
            let rep_key = backward.real_key[c.bid as usize];
            let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
            let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
            let mut combined = fpath.clone();
            combined.extend(bridge_moves.iter().copied());
            combined.extend(invert_pairs(&conjugated_backward_path));
            let replayed = apply_seq(state, &combined);
            complete_valid = compute_edge_state_key_fast5(&replayed) == solved_key;
        }
        if bridge_found {
            true_positive += 1;
        }

        let word0 = (new_rank as u64) | ((c.slot as u64) << 32) | (forward_depth << 40) | (backward_depth << 48) | ((raw_ham as u64) << 56);
        let word1 = (fwd_power as u64) | ((bwd_power as u64) << 8) | (1u64 << 16) | (4u64 << 24) | ((bridge_found as u64) << 34) | (bridge_depth << 35) | ((complete_valid as u64) << 40) | ((in_bucket_a as u64) << 48);
        rows.push(word0);
        rows.push(word1);
        rows.push(c.fid as u64);
        rows.push(c.bid as u64);
        rows.push(orig_idx as u64);
    }

    stats[0] = limit as u32;
    stats[2] = true_positive;
    RADIUS1_OA_STATS_WORDS = stats;
    1
}

#[no_mangle]
pub unsafe extern "C" fn radius1_oa_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_OA_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_oa_row_count() -> u32 {
    ((&*&raw const RADIUS1_OA_ROWS).len() / 5) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_oa_rows_ptr() -> *const u64 {
    (&*&raw const RADIUS1_OA_ROWS).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1 -- pure profiling
// Sprint. canonical_key_v2/conjugate_state_v2/compute_edge_state_key_fast5
// are all reused completely UNCHANGED (no semantics change -- state
// identity / C5 orbit canonicalization is untouched). try_bridge_canonical_
// counted (previous Sprint, unmodified) already counts canonical_key_v2
// calls per bridge attempt; this Sprint's only addition is recording that
// count PER CANDIDATE, tagged by which depth (1/2/3/not-found) the
// candidate resolved at, over real residual/comparison fixtures, so the
// actual bridgeDepth=3 cost share can be measured directly instead of
// inferred from the isolated micro-benchmarks alone (bench_conjugate_state/
// bench_compute_edge_state_key/bench_canonical_key, from the earlier
// canonicalization micro-opt Sprint, are reused as-is for the low-level
// A1/A5 breakdown -- no new Rust needed for that part).
// =======================================================================

/// [0]=analyzed [1]=totalCandidates(extraction) [2]=candidatesTruncated(0/1)
/// [3]=forwardFinalSize [4]=backwardFinalSize
static mut RADIUS1_CKP_STATS_WORDS: [u32; 5] = [0; 5];
/// One u64/candidate: packed(category<<0 | calls<<8). category: 0=notFound
/// (exhausted full max_bridge_depth without a match), 1/2/3=bridgeDepth at
/// which try_bridge_canonical_counted found a match.
static mut RADIUS1_CKP_ROWS: Vec<u64> = Vec::new();

/// Orchestrator: SAME phase1/phase2/extract_radius1_candidates as every
/// previous radius-1 Sprint (all unchanged), then for up to
/// `candidate_cap` candidates (extraction's own order, not reordered --
/// this Sprint doesn't touch ordering), runs try_bridge_canonical_counted
/// (previous Sprint, unmodified) and records ONLY the (category, calls)
/// pair per candidate. No combination/replay step is needed here since
/// this Sprint profiles COST, not correctness (already established by
/// prior Sprints for the identical unmodified functions being reused).
#[no_mangle]
pub unsafe extern "C" fn canonical_key_v2_cost_profile_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32, candidate_cap: u32) -> i32 {
    RADIUS1_CKP_STATS_WORDS = [0; 5];
    (&mut *&raw mut RADIUS1_CKP_ROWS).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 5];
    stats[1] = candidates.len() as u32;
    stats[2] = if truncated { 1 } else { 0 };
    stats[3] = forward.key_to_id.len() as u32;
    stats[4] = backward.canon_to_id.len() as u32;

    let rows = &mut *&raw mut RADIUS1_CKP_ROWS;
    let limit = (candidate_cap as usize).min(candidates.len());

    for c in candidates.iter().take(limit) {
        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);

        let (bridge_result, calls) = try_bridge_canonical_counted(&f_state, c.bk, max_bridge_depth);
        let category: u64 = match &bridge_result {
            Some(moves) => moves.len() as u64,
            None => 0,
        };
        rows.push(category | ((calls as u64) << 8));
    }

    stats[0] = limit as u32;
    RADIUS1_CKP_STATS_WORDS = stats;
    1
}

#[no_mangle]
pub unsafe extern "C" fn canonical_key_v2_cost_profile_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_CKP_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn canonical_key_v2_cost_profile_row_count() -> u32 {
    (&*&raw const RADIUS1_CKP_ROWS).len() as u32
}
#[no_mangle]
pub unsafe extern "C" fn canonical_key_v2_cost_profile_rows_ptr() -> *const u64 {
    (&*&raw const RADIUS1_CKP_ROWS).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1 -- targeted
// optimization of conjugate_state_v2's own cost (measured last Sprint at
// ~73% of canonical_key_v2's total cost), WITHOUT changing what
// canonical_key_v2 computes: same C5 orbit definition, same SIGMA/
// SIGMA_INV, same compute_edge_state_key_fast5 semantics. canonical_key_v2
// itself, try_bridge_canonical, extract_radius1_candidates, and
// solve_cross are all left completely UNCHANGED -- these are new,
// isolated candidate implementations, verified bit-for-bit before any
// speed claim is trusted (Gate A).
//
// V3 ("edges-only"): conjugate_state_v2 conjugates BOTH corners (20
// positions, with a 3-term mod-3 orientation reduction) AND edges (30
// positions), but compute_edge_state_key_fast5 -- called immediately
// after -- reads ONLY the 5 tracked edge pieces' data and never touches
// corner_perm/corner_orient. The 20-position corner loop is therefore
// provably dead work for this specific use; V3 is byte-identical to V2
// on the edge loop and simply omits the corner loop entirely (corners are
// left at SOLVED's own default values, never read downstream).
//
// V4 ("direct", the structural candidate from this Sprint's own work
// order section 4): conjugate_state_v2's own formula is
//   out.edge_perm[pos]   = SIGMA.edge_perm[ state.edge_perm[ SIGMA_INV.edge_perm[pos] ] ]
//   out.edge_orient[pos] = SIGMA_INV.edge_orient[pos] + state.edge_orient[SIGMA_INV.edge_perm[pos]]
//                           + SIGMA.edge_orient[state.edge_perm[SIGMA_INV.edge_perm[pos]]]  (mod 2)
// Since canonical_key_v2 only ever needs this evaluated at the (up to 5)
// positions holding the tracked pieces, and this transform is FIXED
// (state-independent) for a given symmetry power k, the position/
// orientation of tracked piece p after k applications can be derived in
// closed form (full derivation in this Sprint's own report) as:
//   target(k, p)   = R_INV^k(p)                          where R = SIGMA.edge_perm
//   pos_0          = state.pos_of(target(k, p))           (a single O(30) scan, same style as compute_edge_state_key_fast5)
//   final_pos(k,p) = Q_INV^k(pos_0)                        where Q = SIGMA_INV.edge_perm
//   final_orient   = state.edge_orient[pos_0]
//                     XOR (XOR_{j=1..k} SIGMA_INV.edge_orient[Q_INV^j(pos_0)])
//                     XOR ORIENT_CONST[k][p]   (= XOR_{j=1..k} SIGMA.edge_orient[R_INV^j(p)], a pure constant)
// This eliminates conjugate_state_v2's own full-state materialization
// ENTIRELY (no corners, no untracked edges) -- only a single O(30) scan
// per symmetry power (identical complexity to compute_edge_state_key_fast5
// itself) plus O(k) fixed-table lookups. R_INV/Q_INV and their powers are
// precomputed ONCE (lazily, from the EXISTING SIGMA/SIGMA_INV constants --
// no new symmetry, just inverting/composing the same fixed arrays).
// =======================================================================

fn conjugate_state_edges_only(state: &State) -> State {
    let mut out = SOLVED;
    for pos in 0..30 {
        let p1 = SIGMA_INV.edge_perm[pos] as usize;
        let p2 = state.edge_perm[p1] as usize;
        out.edge_perm[pos] = SIGMA.edge_perm[p2];
        out.edge_orient[pos] = (SIGMA_INV.edge_orient[pos] + state.edge_orient[p1] + SIGMA.edge_orient[p2]) & 1;
    }
    out
}

fn canonical_key_edges_only(state: &State) -> u64 {
    let mut best = compute_edge_state_key_fast5(state);
    let mut cur = *state;
    for _ in 0..4 {
        cur = conjugate_state_edges_only(&cur);
        let k = compute_edge_state_key_fast5(&cur);
        if k < best {
            best = k;
        }
    }
    best
}

fn invert_perm30(p: &[i8; 30]) -> [i8; 30] {
    let mut inv = [0i8; 30];
    for i in 0..30 {
        inv[p[i] as usize] = i as i8;
    }
    inv
}

struct DirectConjTables {
    /// target_piece[k][p] = R_INV applied k times to tracked piece p (R = SIGMA.edge_perm).
    target_piece: [[i8; 5]; 5],
    /// piece_to_slot[k][piece_id] = which tracked-piece slot (0..5) this piece_id
    /// corresponds to at power k, or -1 if it isn't one of the 5 targets for this k.
    piece_to_slot: [[i8; 30]; 5],
    /// q_inv_pow[k] = Q_INV applied k times, as a full 30-element position map (Q = SIGMA_INV.edge_perm).
    q_inv_pow: [[i8; 30]; 5],
    /// orient_const[k][p] = XOR_{j=1..k} SIGMA.edge_orient[R_INV^j(p)] -- a pure constant given k, p.
    orient_const: [[i8; 5]; 5],
}

static mut DIRECT_CONJ_TABLES: Option<DirectConjTables> = None;

fn direct_conj_tables() -> &'static DirectConjTables {
    unsafe {
        let ptr = &raw mut DIRECT_CONJ_TABLES;
        if (*ptr).is_none() {
            let r_inv = invert_perm30(&SIGMA.edge_perm);
            let q_inv = invert_perm30(&SIGMA_INV.edge_perm);

            let mut target_piece = [[0i8; 5]; 5];
            let mut orient_const = [[0i8; 5]; 5];
            for p in 0..5usize {
                let mut t = p as i8;
                let mut oc = 0i8;
                for k in 0..5usize {
                    target_piece[k][p] = t;
                    orient_const[k][p] = oc;
                    let t_new = r_inv[t as usize];
                    oc ^= SIGMA.edge_orient[t_new as usize];
                    t = t_new;
                }
            }

            let mut piece_to_slot = [[-1i8; 30]; 5];
            for k in 0..5usize {
                for p in 0..5usize {
                    piece_to_slot[k][target_piece[k][p] as usize] = p as i8;
                }
            }

            let mut q_inv_pow = [[0i8; 30]; 5];
            for i in 0..30 {
                q_inv_pow[0][i] = i as i8;
            }
            for k in 1..5usize {
                for i in 0..30 {
                    q_inv_pow[k][i] = q_inv[q_inv_pow[k - 1][i] as usize];
                }
            }

            *ptr = Some(DirectConjTables { target_piece, piece_to_slot, q_inv_pow, orient_const });
        }
        (*ptr).as_ref().unwrap()
    }
}

/// Direct computation of canonical_key_v2's own value, WITHOUT ever
/// materializing a conjugated State (see this Sprint's own dev notes
/// above for the full derivation). `target_piece`/`piece_to_slot` here
/// are unused for k==0 (the identity power uses the same direct scan
/// compute_edge_state_key_fast5 already does).
fn canonical_key_direct(state: &State) -> u64 {
    let tables = direct_conj_tables();
    let mut best = u64::MAX;

    for k in 0..5usize {
        let mut positions = [0i8; 5];
        let mut orients = [0i8; 5];

        if k == 0 {
            let mut remaining = 5;
            for pos in 0..30 {
                if remaining == 0 {
                    break;
                }
                let piece = state.edge_perm[pos];
                if piece < 5 {
                    positions[piece as usize] = pos as i8;
                    orients[piece as usize] = state.edge_orient[pos];
                    remaining -= 1;
                }
            }
        } else {
            let slot_of = &tables.piece_to_slot[k];
            let mut pos0_for = [-1i8; 5];
            let mut remaining = 5;
            for pos in 0..30 {
                if remaining == 0 {
                    break;
                }
                let piece = state.edge_perm[pos] as usize;
                let slot = slot_of[piece];
                if slot >= 0 && pos0_for[slot as usize] == -1 {
                    pos0_for[slot as usize] = pos as i8;
                    remaining -= 1;
                }
            }
            for p in 0..5usize {
                let pos0 = pos0_for[p] as usize;
                let final_pos = tables.q_inv_pow[k][pos0];
                positions[p] = final_pos;

                let mut orient = state.edge_orient[pos0];
                for j in 1..=k {
                    let pos_j = tables.q_inv_pow[j][pos0] as usize;
                    orient ^= SIGMA_INV.edge_orient[pos_j];
                }
                orient ^= tables.orient_const[k][p];
                orients[p] = orient & 1;
            }
        }

        let mut key: u64 = 0;
        for p in 0..5 {
            key = key * 60 + positions[p] as u64 * 2 + orients[p] as u64;
        }
        if key < best {
            best = key;
        }
    }
    best
}

/// [0..5] = mismatches for {V0-vs-edgesOnly, V0-vs-direct} pairs isn't
/// enough info alone -- reports per-variant mismatch counts against V0
/// (the existing, trusted canonical_key_v2): [0]=edgesOnlyMismatches
/// [1]=directMismatches [2]=statesChecked.
static mut CKV2_VERIFY_RESULT: [u32; 3] = [0; 3];

/// Gate A: bit-for-bit equivalence check of canonical_key_edges_only and
/// canonical_key_direct against the EXISTING, trusted canonical_key_v2,
/// over: SOLVED, `random_count` random states (derived via a fixed-seed
/// xorshift descending from the state currently in STATE_SCRATCH, mixed
/// with `seed`), and -- if `include_orbit` is nonzero -- all 5 conjugate
/// images of the state in STATE_SCRATCH (orbit invariance check: K(S) ==
/// K(sigma^i(S)) for all i). Never touches canonical_key_v2 or any
/// production/search path.
#[no_mangle]
pub unsafe extern "C" fn canonical_key_v2_targeted_opt_verify(seed: u32, random_count: u32, include_orbit: u32) -> u32 {
    let mut edges_only_mismatches: u32 = 0;
    let mut direct_mismatches: u32 = 0;
    let mut checked: u32 = 0;

    let check_one = |s: &State, edges_only_mismatches: &mut u32, direct_mismatches: &mut u32| {
        let golden = canonical_key_v2(s);
        if canonical_key_edges_only(s) != golden {
            *edges_only_mismatches += 1;
        }
        if canonical_key_direct(s) != golden {
            *direct_mismatches += 1;
        }
    };

    check_one(&solved_state(), &mut edges_only_mismatches, &mut direct_mismatches);
    checked += 1;

    let base = read_state_scratch();
    if include_orbit != 0 {
        let mut cur = base;
        for _ in 0..5 {
            check_one(&cur, &mut edges_only_mismatches, &mut direct_mismatches);
            checked += 1;
            cur = conjugate_state_v2(&cur);
        }
    }

    let mut rng = seed.wrapping_mul(2654435761).wrapping_add(0x9e3779b9);
    let mut cur = base;
    for _ in 0..random_count {
        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        let face = (rng % 12) as u8;
        let sign_negative = (rng >> 8) & 1 == 1;
        cur = apply_move(&cur, face, sign_negative);
        check_one(&cur, &mut edges_only_mismatches, &mut direct_mismatches);
        checked += 1;
    }

    CKV2_VERIFY_RESULT = [edges_only_mismatches, direct_mismatches, checked];
    edges_only_mismatches + direct_mismatches
}

#[no_mangle]
pub unsafe extern "C" fn canonical_key_v2_targeted_opt_verify_result_ptr() -> *const u32 {
    (&raw const CKV2_VERIFY_RESULT) as *const u32
}

/// variant: 0 = V0 (canonical_key_v2, existing/trusted), 3 = V3 (edges-only), 4 = V4 (direct, no materialization).
#[no_mangle]
pub unsafe extern "C" fn bench_canonical_key_v2_targeted(variant: u32, repeats: u32) -> u64 {
    let state = read_state_scratch();
    let mut acc: u64 = 0;
    match variant {
        0 => {
            for _ in 0..repeats {
                acc ^= canonical_key_v2(&state);
            }
        }
        3 => {
            for _ in 0..repeats {
                acc ^= canonical_key_edges_only(&state);
            }
        }
        4 => {
            for _ in 0..repeats {
                acc ^= canonical_key_direct(&state);
            }
        }
        _ => {}
    }
    acc
}

/// variant: 0 = V0 (existing conjugate_state_v2), 3 = V3 (edges-only, this Sprint).
#[no_mangle]
pub unsafe extern "C" fn bench_conjugate_state_targeted(variant: u32, repeats: u32) -> u64 {
    let state = read_state_scratch();
    let mut acc: u64 = 0;
    let mut cur = state;
    match variant {
        0 => {
            for _ in 0..repeats {
                cur = conjugate_state_v2(&cur);
                acc ^= cur.edge_perm[0] as u64;
            }
        }
        3 => {
            for _ in 0..repeats {
                cur = conjugate_state_edges_only(&cur);
                acc ^= cur.edge_perm[0] as u64;
            }
        }
        _ => {}
    }
    acc
}

/// Byte-for-byte the SAME depth-1-then-2-then-3 exhaustive local move
/// enumeration as try_bridge_canonical (left completely unmodified
/// above), but accepting a candidate via canonical_key_direct instead of
/// canonical_key_v2 -- the ONLY difference. Used exclusively for Gate B's
/// direct search-outcome comparison; try_bridge_canonical itself remains
/// the one actually validated/used by every prior Sprint's early-exit.
fn try_bridge_direct(start: &State, target_canon: u64, max_depth: u32) -> Option<Vec<(u8, bool)>> {
    if canonical_key_direct(start) == target_canon {
        return Some(Vec::new());
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            if canonical_key_direct(&st1) == target_canon {
                return Some(vec![(f1, s1)]);
            }
        }
    }
    if max_depth < 2 {
        return None;
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    if canonical_key_direct(&st2) == target_canon {
                        return Some(vec![(f1, s1), (f2, s2)]);
                    }
                }
            }
        }
    }
    if max_depth < 3 {
        return None;
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = apply_move(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = apply_move(&st1, f2, s2);
                    for f3 in 0u8..12 {
                        for &s3 in &[false, true] {
                            let st3 = apply_move(&st2, f3, s3);
                            if canonical_key_direct(&st3) == target_canon {
                                return Some(vec![(f1, s1), (f2, s2), (f3, s3)]);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// [0]=candidatesScanned [1]=found(0/1) [2]=bridgeDepth [3]=solutionLength
/// [4]=internallyValid(0/1) [5]=candidatesTruncated(0/1) [6]=totalCandidates
/// [7]=forwardFinalSize [8]=backwardFinalSize
static mut RADIUS1_DIR_STATS_WORDS: [u32; 9] = [0; 9];
static mut RADIUS1_DIR_RESULT_BUF: Vec<u8> = Vec::new();

/// Gate B: the SAME early-exit loop as radius1_bridge_early_exit_v1
/// (unmodified above), with exactly one substitution -- try_bridge_direct
/// (canonical_key_direct) instead of try_bridge_canonical
/// (canonical_key_v2). Candidate order, bridge depth structure, and
/// find_symmetry_index are all byte-for-byte identical. Used to confirm
/// found/notFound, bridgeDepth, and the winning candidate are IDENTICAL
/// to the existing V0 early-exit, not just that canonical_key_direct
/// matches canonical_key_v2 in isolation (Gate A).
#[no_mangle]
pub unsafe extern "C" fn radius1_bridge_early_exit_direct_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32) -> i32 {
    RADIUS1_DIR_STATS_WORDS = [0; 9];
    (&mut *&raw mut RADIUS1_DIR_RESULT_BUF).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    let mut stats = [0u32; 9];
    stats[5] = if truncated { 1 } else { 0 };
    stats[6] = candidates.len() as u32;
    stats[7] = forward.key_to_id.len() as u32;
    stats[8] = backward.canon_to_id.len() as u32;

    let solved_key = compute_edge_state_key_fast5(&target);
    let mut scanned: u32 = 0;

    for c in &candidates {
        scanned += 1;

        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);

        let Some(bridge_moves) = try_bridge_direct(&f_state, c.bk, max_bridge_depth) else {
            continue;
        };
        let bridged_state = apply_seq(f_state, &bridge_moves);

        let rep_key = backward.real_key[c.bid as usize];
        let j = find_symmetry_index(&bridged_state, rep_key, pieces_slice);
        let bpath = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, c.bid);
        let conjugated_backward_path = conjugate_seq(&bpath, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);

        let mut combined = fpath.clone();
        combined.extend(bridge_moves.iter().copied());
        combined.extend(invert_pairs(&conjugated_backward_path));

        let replayed = apply_seq(state, &combined);
        let internally_valid = compute_edge_state_key_fast5(&replayed) == solved_key;

        stats[0] = scanned;
        stats[1] = 1;
        stats[2] = bridge_moves.len() as u32;
        stats[3] = combined.len() as u32;
        stats[4] = if internally_valid { 1 } else { 0 };

        let buf = &mut *&raw mut RADIUS1_DIR_RESULT_BUF;
        buf.clear();
        for &(face, sign_negative) in &combined {
            buf.push(face);
            buf.push(if sign_negative { 1 } else { 0 });
        }

        RADIUS1_DIR_STATS_WORDS = stats;
        return if internally_valid { 1 } else { -1 };
    }

    stats[0] = scanned;
    stats[1] = 0;
    RADIUS1_DIR_STATS_WORDS = stats;
    0
}

#[no_mangle]
pub unsafe extern "C" fn radius1_dir_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_DIR_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_dir_result_len() -> u32 {
    ((&*&raw const RADIUS1_DIR_RESULT_BUF).len() / 2) as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_dir_result_ptr() -> *const u8 {
    (&*&raw const RADIUS1_DIR_RESULT_BUF).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RADIUS1_BRIDGE_PIPELINE_COST_PROFILE_V1 -- pure
// measurement Sprint. No optimization, no production/search-structure
// change. Decomposes real per-candidate cost of try_bridge_direct (V4,
// canonical_key_direct) into: candidate state construction (forward path
// reconstruct + replay), move application inside the depth-1/2/3 sweep,
// canonical_key_direct itself, the one-time FastMap-based candidate
// extraction ("hash lookup"), per-candidate bookkeeping, and the
// WASM/JS FFI boundary. phase1_raw_capture_forward_v2_impl,
// phase2_diagnostic_v2_impl, extract_radius1_candidates, apply_move,
// apply_seq, reconstruct_generic, canonical_key_direct, and
// try_bridge_direct are all reused completely UNCHANGED from prior
// Sprints; only new, isolated instrumentation/benchmark functions are
// added below.
// =======================================================================

/// Byte-for-byte the same depth-1/2/3 sweep as try_bridge_direct
/// (unmodified above), instrumented with TWO independent counters:
/// canonical_key_direct calls (as try_bridge_canonical_counted already
/// did for V0/canonical_key_v2) AND apply_move calls (new -- needed to
/// attribute move-application cost, since st1/st2 get recomputed once
/// per depth block in the existing, unmodified sweep structure).
fn try_bridge_direct_counted(start: &State, target_canon: u64, max_depth: u32) -> (Option<Vec<(u8, bool)>>, u32, u32) {
    let mut ckd_calls: u32 = 0;
    let mut move_calls: u32 = 0;
    macro_rules! check {
        ($st:expr) => {{
            ckd_calls += 1;
            canonical_key_direct($st) == target_canon
        }};
    }
    macro_rules! mv {
        ($s:expr, $f:expr, $sg:expr) => {{
            move_calls += 1;
            apply_move($s, $f, $sg)
        }};
    }
    if check!(start) {
        return (Some(Vec::new()), ckd_calls, move_calls);
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = mv!(start, f1, s1);
            if check!(&st1) {
                return (Some(vec![(f1, s1)]), ckd_calls, move_calls);
            }
        }
    }
    if max_depth < 2 {
        return (None, ckd_calls, move_calls);
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = mv!(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = mv!(&st1, f2, s2);
                    if check!(&st2) {
                        return (Some(vec![(f1, s1), (f2, s2)]), ckd_calls, move_calls);
                    }
                }
            }
        }
    }
    if max_depth < 3 {
        return (None, ckd_calls, move_calls);
    }
    for f1 in 0u8..12 {
        for &s1 in &[false, true] {
            let st1 = mv!(start, f1, s1);
            for f2 in 0u8..12 {
                for &s2 in &[false, true] {
                    let st2 = mv!(&st1, f2, s2);
                    for f3 in 0u8..12 {
                        for &s3 in &[false, true] {
                            let st3 = mv!(&st2, f3, s3);
                            if check!(&st3) {
                                return (Some(vec![(f1, s1), (f2, s2), (f3, s3)]), ckd_calls, move_calls);
                            }
                        }
                    }
                }
            }
        }
    }
    (None, ckd_calls, move_calls)
}

/// [0]=stage(echoed) [1]=analyzed(candidates looped, stage 2 only)
/// [2]=totalCandidates(extraction, stage>=1) [3]=candidatesTruncated(0/1)
/// [4]=forwardFinalSize [5]=backwardFinalSize [6]=totalCkdCalls(stage 2)
/// [7]=totalMoveCalls(stage 2) [8]=totalFpathLen(stage 2, sum over analyzed)
static mut RADIUS1_PIPE_STATS_WORDS: [u32; 9] = [0; 9];
/// stage 2 only: one u64/candidate, packed
/// category(bits0-7) | ckdCalls(bits8-31) | moveCalls(bits32-55) |
/// min(fpathLen,255)(bits56-63).
static mut RADIUS1_PIPE_ROWS: Vec<u64> = Vec::new();

/// stage 0 = stop right after phase1+phase2 (no extraction, no
/// per-candidate loop) -- isolates BFS-tree-construction cost alone,
/// timed by JS around a single call (established convention: no wasm32
/// clock, so JS times whole calls via performance.now()).
/// stage 1 = stop right after extract_radius1_candidates (no loop) --
/// stage1_time - stage0_time isolates the FastMap-based candidate
/// extraction ("hash lookup") cost alone, since it runs exactly ONCE per
/// solve (not per candidate).
/// stage 2 = full run: phase1+phase2+extract, then for up to
/// `candidate_cap` candidates (extraction's own order, unchanged),
/// try_bridge_direct_counted records (category, ckdCalls, moveCalls,
/// fpathLen) per candidate. No combination/replay/production path is
/// touched -- this Sprint profiles COST only, reusing already-validated
/// (Sprint 8 Gate A/B) functions unchanged.
#[no_mangle]
pub unsafe extern "C" fn radius1_bridge_pipeline_cost_profile_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32, candidate_max_frontier: u32, max_bridge_depth: u32, candidate_cap: u32, stage: u32) -> i32 {
    RADIUS1_PIPE_STATS_WORDS = [0; 9];
    (&mut *&raw mut RADIUS1_PIPE_ROWS).clear();
    DIAG_STATE = None;

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 0;
    }
    let Some(cap) = phase1.captured else {
        return 0;
    };
    let (_result, _stats) = phase2_diagnostic_v2_impl(cap.forward, cap.forward_frontier, cap.forward_rounds, state, target, pieces_slice, total_max_half_depth, candidate_max_frontier);

    let mut stats = [0u32; 9];
    stats[0] = stage;

    if stage == 0 {
        RADIUS1_PIPE_STATS_WORDS = stats;
        return 1;
    }

    let Some(diag) = (&*&raw const DIAG_STATE).as_ref() else { return 0 };
    let forward = &diag.forward;
    let backward = &diag.backward;

    let (candidates, truncated) = extract_radius1_candidates(&forward.canon_key, &backward.canon_to_id);
    stats[2] = candidates.len() as u32;
    stats[3] = if truncated { 1 } else { 0 };
    stats[4] = forward.key_to_id.len() as u32;
    stats[5] = backward.canon_to_id.len() as u32;

    if stage == 1 {
        RADIUS1_PIPE_STATS_WORDS = stats;
        return 1;
    }

    let rows = &mut *&raw mut RADIUS1_PIPE_ROWS;
    let limit = (candidate_cap as usize).min(candidates.len());
    let mut total_ckd: u64 = 0;
    let mut total_mv: u64 = 0;
    let mut total_fpath: u64 = 0;

    for c in candidates.iter().take(limit) {
        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, c.fid);
        let f_state = apply_seq(state, &fpath);

        let (bridge_result, ckd_calls, move_calls) = try_bridge_direct_counted(&f_state, c.bk, max_bridge_depth);
        let category: u64 = match &bridge_result {
            Some(moves) => moves.len() as u64,
            None => 0,
        };
        let fpath_len = fpath.len() as u64;
        total_ckd += ckd_calls as u64;
        total_mv += move_calls as u64;
        total_fpath += fpath_len;

        rows.push(category | ((ckd_calls as u64) << 8) | ((move_calls as u64) << 32) | (fpath_len.min(255) << 56));
    }

    stats[1] = limit as u32;
    stats[6] = total_ckd as u32;
    stats[7] = total_mv as u32;
    stats[8] = total_fpath as u32;

    RADIUS1_PIPE_STATS_WORDS = stats;
    1
}

#[no_mangle]
pub unsafe extern "C" fn radius1_pipe_stats_ptr() -> *const u32 {
    (&raw const RADIUS1_PIPE_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_pipe_row_count() -> u32 {
    (&*&raw const RADIUS1_PIPE_ROWS).len() as u32
}
#[no_mangle]
pub unsafe extern "C" fn radius1_pipe_rows_ptr() -> *const u64 {
    (&*&raw const RADIUS1_PIPE_ROWS).as_ptr()
}

/// Isolated per-call cost of apply_move alone (same repeats + XOR-checksum
/// methodology as bench_conjugate_state/bench_canonical_key from earlier
/// Sprints -- JS times the whole batch via performance.now(), divides by
/// repeats). Cycles through all 12 faces so the branch pattern resembles
/// real usage rather than a single hot path.
#[no_mangle]
pub unsafe extern "C" fn bench_apply_move_targeted(repeats: u32) -> u64 {
    let state = read_state_scratch();
    let mut cur = state;
    let mut acc: u64 = 0;
    let mut face: u8 = 0;
    for i in 0..repeats {
        let sign_negative = (i & 1) == 1;
        cur = apply_move(&cur, face, sign_negative);
        acc ^= cur.edge_perm[0] as u64;
        face = (face + 1) % 12;
    }
    acc
}

/// Isolated per-call cost of reconstruct_generic for a fixed path length
/// (a synthetic linear parent chain built once, then walked `repeats`
/// times from its tail id). path_len is clamped to [1, 4096].
#[no_mangle]
pub unsafe extern "C" fn bench_reconstruct_generic_targeted(path_len: u32, repeats: u32) -> u64 {
    let len = (path_len as usize).clamp(1, 4096);
    let mut parent = vec![-1i32; len + 1];
    let mut move_face = vec![0u8; len + 1];
    let mut move_sign_negative = vec![false; len + 1];
    for i in 1..=len {
        parent[i] = (i as i32) - 1;
        move_face[i] = (i % 12) as u8;
        move_sign_negative[i] = i % 2 == 0;
    }
    let mut acc: u64 = 0;
    for _ in 0..repeats {
        let moves = reconstruct_generic(&parent, &move_face, &move_sign_negative, len as u32);
        acc ^= moves.len() as u64;
    }
    acc
}

/// Isolated per-call cost of apply_seq for a fixed path length.
#[no_mangle]
pub unsafe extern "C" fn bench_apply_seq_targeted(path_len: u32, repeats: u32) -> u64 {
    let len = (path_len as usize).clamp(1, 4096);
    let mut seq: Vec<(u8, bool)> = Vec::with_capacity(len);
    for i in 0..len {
        seq.push(((i % 12) as u8, i % 2 == 0));
    }
    let state = read_state_scratch();
    let mut acc: u64 = 0;
    for _ in 0..repeats {
        let out = apply_seq(state, &seq);
        acc ^= out.edge_perm[0] as u64;
    }
    acc
}

/// Pure WASM/JS FFI-boundary overhead probe -- does nothing. JS times
/// calling this `repeats` times in a loop to isolate the per-call
/// boundary cost alone, separate from any real work.
#[no_mangle]
pub unsafe extern "C" fn noop_ffi_bench() -> u32 {
    0
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RESIDUAL_BFS_PIPELINE_COST_PROFILE_V1 -- pure
// measurement Sprint. No optimization, no production change. Decomposes
// phase1_raw_capture_forward_v2_impl + phase2_diagnostic_v2_impl's own
// BFS tree construction (established by the prior Sprint to be ~90-98%
// of real wall-clock) into forward-vs-backward, round-by-round
// (side/inputFrontier/generated/accepted/duplicate/callCounts), and
// isolates the backward-side canonicalization cost that phase2's own
// dedup check structurally requires on EVERY candidate move (not just
// accepted ones, unlike forward's raw-key dedup). phase1_raw_capture_
// forward_v2_impl, canonical_key_v2, compute_edge_state_key_fast5,
// apply_move, reconstruct_generic, find_symmetry_index, conjugate_seq,
// invert_pairs are all reused completely UNCHANGED. The round-advance
// function below is a byte-for-byte copy of phase2_continue_with_
// canonical_backward_v2_impl's own round body (same non-interference
// discipline as every earlier diagnostic Sprint: counters never change
// which candidates get accepted/rejected), split into single-round calls
// so JS can time each round individually via performance.now() (this
// crate has no working clock of its own in wasm32-unknown-unknown).
// =======================================================================

struct ResidualBfsProfileState {
    forward: SymForwardTree,
    forward_frontier: Vec<(State, u32)>,
    backward: SymBackwardTree,
    backward_frontier: Vec<(State, u32)>,
    forward_rounds: u32,
    backward_rounds: u32,
    rounds_used: u32,
    root: State,
}
static mut RBFS_STATE: Option<ResidualBfsProfileState> = None;
static mut RBFS_FOUND_RESULT: Vec<u8> = Vec::new();

/// Seeds RBFS_STATE via phase1_raw_capture_forward_v2_impl (UNCHANGED,
/// reused as-is), then builds a fresh canonical backward tree exactly as
/// phase2_diagnostic_v2_impl/phase2_continue_with_canonical_backward_v2_impl
/// do at their own start (phase1's own internal raw backward exploration
/// is discarded -- Phase1Capture never carries backward data out of
/// phase1, matching production's real behavior exactly). Returns 1 if
/// phase1 itself already found a raw meeting (result in
/// RBFS_FOUND_RESULT), 0 if captured and ready for rbfs_run_one_round,
/// -1 if the frontier cap was hit during phase1.
#[no_mangle]
pub unsafe extern "C" fn rbfs_phase1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32) -> i32 {
    RBFS_STATE = None;
    (&mut *&raw mut RBFS_FOUND_RESULT).clear();

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        let buf = &mut *&raw mut RBFS_FOUND_RESULT;
        for (face, sign_negative) in &path {
            buf.push(*face);
            buf.push(if *sign_negative { 1 } else { 0 });
        }
        return 1;
    }
    let Some(cap) = phase1.captured else {
        return -1;
    };

    let target_key = compute_edge_state_key_fast5(&target);
    let target_canon = canonical_key_v2(&target);
    let mut backward = SymBackwardTree { canon_to_id: FastMap::default(), real_key: vec![target_key], parent: vec![-1], move_face: vec![0], move_sign_negative: vec![false] };
    backward.canon_to_id.insert(target_canon, 0);

    RBFS_STATE = Some(ResidualBfsProfileState {
        forward: cap.forward,
        forward_frontier: cap.forward_frontier,
        backward,
        backward_frontier: vec![(target, 0)],
        forward_rounds: cap.forward_rounds,
        backward_rounds: 0,
        rounds_used: cap.forward_rounds,
        root: state,
    });
    0
}

/// Byte-for-byte the SAME meeting check as phase2_continue_with_canonical_
/// backward_v2_impl's own try_meet closure (unmodified functions it calls:
/// reconstruct_generic, apply_seq, find_symmetry_index, conjugate_seq,
/// invert_pairs, PI_F_INV_POWERS, CONJ_POWER_FOR_J).
fn rbfs_try_meet(forward: &SymForwardTree, backward: &SymBackwardTree, root: &State, pieces: &[i8]) -> Option<Vec<(u8, bool)>> {
    for &fid in forward.key_to_id.values() {
        let canon = forward.canon_key[fid as usize];
        let Some(&bid) = backward.canon_to_id.get(&canon) else { continue };
        let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
        let f_state = apply_seq(*root, &fpath);
        let rep_key = backward.real_key[bid as usize];
        let j = find_symmetry_index(&f_state, rep_key, pieces);
        let rep_path = reconstruct_generic(&backward.parent, &backward.move_face, &backward.move_sign_negative, bid);
        let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
        let mut combined = fpath;
        combined.extend(invert_pairs(&conjugated_backward_path));
        return Some(combined);
    }
    None
}

/// [0]=side(0=fwd,1=bwd) [1]=inputFrontierSize [2]=generated
/// [3]=accepted [4]=duplicate [5]=frontierCapHit(0/1) [6]=meetingFound(0/1)
/// [7]=roundsUsedAfter [8]=forwardFinalSize [9]=backwardFinalSize
/// [10]=stateKeyFast5CallsThisRound [11]=canonicalKeyV2CallsThisRound
static mut RBFS_ROUND_STATS: [u32; 12] = [0; 12];

/// Advances RBFS_STATE by exactly ONE round -- the SAME "smaller side
/// expands" round body as phase2_continue_with_canonical_backward_v2_impl
/// (unmodified above), with counters added that never influence which
/// candidates get accepted/rejected (same non-interference discipline as
/// every prior diagnostic Sprint in this file). Forward's dedup check
/// uses the raw key (compute_edge_state_key_fast5 on EVERY candidate,
/// canonical_key_v2 only on ACCEPTED ones); backward's dedup check IS a
/// canonical-key comparison, so canonical_key_v2 runs on EVERY candidate
/// (duplicate or not) and compute_edge_state_key_fast5 only on ACCEPTED
/// ones -- this asymmetry is exactly what this Sprint measures. Returns 1
/// if this round's meeting check succeeds (result in RBFS_FOUND_RESULT),
/// 0 if the round completed without a meeting (state ready for another
/// call), -1 if the frontier cap was hit mid-round (state left as-is,
/// matching the original function's own immediate-return-on-cap
/// behavior -- no partial round is committed).
#[no_mangle]
pub unsafe extern "C" fn rbfs_run_one_round(pieces_len: u32, max_frontier_size: u32) -> i32 {
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];

    let Some(st) = (&mut *&raw mut RBFS_STATE).as_mut() else { return -1 };

    let expand_forward = st.forward.key_to_id.len() <= st.backward.canon_to_id.len();
    let input_size = (if expand_forward { st.forward_frontier.len() } else { st.backward_frontier.len() }) as u32;
    if expand_forward {
        st.forward_rounds += 1;
    } else {
        st.backward_rounds += 1;
    }

    let mut generated: u32 = 0;
    let mut accepted: u32 = 0;
    let mut state_key_calls: u32 = 0;
    let mut canon_calls: u32 = 0;
    let mut cap_hit = false;
    let mut next: Vec<(State, u32)> = Vec::new();

    if expand_forward {
        'outer_f: for &(base_state, id) in &st.forward_frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    generated += 1;
                    let child = apply_move(&base_state, face, sign_negative);
                    state_key_calls += 1;
                    let key = compute_edge_state_key_fast5(&child);
                    if st.forward.key_to_id.contains_key(&key) {
                        continue;
                    }
                    if (next.len() as u32) >= max_frontier_size {
                        cap_hit = true;
                        break 'outer_f;
                    }
                    let child_id = st.forward.parent.len() as u32;
                    canon_calls += 1;
                    let child_canon = canonical_key_v2(&child);
                    st.forward.key_to_id.insert(key, child_id);
                    st.forward.canon_key.push(child_canon);
                    st.forward.parent.push(id as i32);
                    st.forward.move_face.push(face);
                    st.forward.move_sign_negative.push(sign_negative);
                    next.push((child, child_id));
                    accepted += 1;
                }
            }
        }
        if !cap_hit {
            st.forward_frontier = next;
        }
    } else {
        'outer_b: for &(base_state, id) in &st.backward_frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    generated += 1;
                    let child = apply_move(&base_state, face, sign_negative);
                    canon_calls += 1;
                    let canon = canonical_key_v2(&child);
                    if st.backward.canon_to_id.contains_key(&canon) {
                        continue;
                    }
                    if (next.len() as u32) >= max_frontier_size {
                        cap_hit = true;
                        break 'outer_b;
                    }
                    let child_id = st.backward.parent.len() as u32;
                    state_key_calls += 1;
                    let child_key = compute_edge_state_key_fast5(&child);
                    st.backward.canon_to_id.insert(canon, child_id);
                    st.backward.real_key.push(child_key);
                    st.backward.parent.push(id as i32);
                    st.backward.move_face.push(face);
                    st.backward.move_sign_negative.push(sign_negative);
                    next.push((child, child_id));
                    accepted += 1;
                }
            }
        }
        if !cap_hit {
            st.backward_frontier = next;
        }
    }

    if cap_hit {
        RBFS_ROUND_STATS = [if expand_forward { 0 } else { 1 }, input_size, generated, accepted, generated - accepted, 1, 0, st.rounds_used, st.forward.key_to_id.len() as u32, st.backward.canon_to_id.len() as u32, state_key_calls, canon_calls];
        return -1;
    }

    st.rounds_used += 1;
    let mut meeting_found = 0u32;
    if let Some(m) = rbfs_try_meet(&st.forward, &st.backward, &st.root, pieces_slice) {
        meeting_found = 1;
        let buf = &mut *&raw mut RBFS_FOUND_RESULT;
        buf.clear();
        for (face, sign_negative) in &m {
            buf.push(*face);
            buf.push(if *sign_negative { 1 } else { 0 });
        }
    }

    RBFS_ROUND_STATS = [
        if expand_forward { 0 } else { 1 },
        input_size,
        generated,
        accepted,
        generated - accepted,
        0,
        meeting_found,
        st.rounds_used,
        st.forward.key_to_id.len() as u32,
        st.backward.canon_to_id.len() as u32,
        state_key_calls,
        canon_calls,
    ];

    if meeting_found == 1 {
        1
    } else {
        0
    }
}

#[no_mangle]
pub unsafe extern "C" fn rbfs_round_stats_ptr() -> *const u32 {
    (&raw const RBFS_ROUND_STATS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn rbfs_result_len() -> u32 {
    ((&*&raw const RBFS_FOUND_RESULT).len() / 2) as u32
}
#[no_mangle]
pub unsafe extern "C" fn rbfs_result_ptr() -> *const u8 {
    (&*&raw const RBFS_FOUND_RESULT).as_ptr()
}

/// Isolated FastMap<u64,u32> insert+lookup cost at a REALISTIC large
/// table size (backward's canon_to_id table grows into the millions by
/// the later rounds per this Sprint's own round-by-round log, so a cold
/// small-table benchmark would understate real rehash/probe cost).
/// Pre-populates `prepopulate` synthetic entries once, then times
/// `repeats` insert calls of NEW, never-before-seen keys (derived from a
/// simple counter offset past the prepopulated range) plus one lookup of
/// an EXISTING key per iteration, returning an XOR checksum.
#[no_mangle]
pub unsafe extern "C" fn bench_fastmap_insert_targeted(prepopulate: u32, repeats: u32) -> u64 {
    let mut map: FastMap<u64, u32> = FastMap::default();
    map.reserve(prepopulate as usize);
    for i in 0..prepopulate {
        map.insert((i as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ 0xdeadbeef, i);
    }
    let mut acc: u64 = 0;
    for i in 0..repeats {
        let new_key = ((prepopulate + i) as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ 0xdeadbeef;
        map.insert(new_key, prepopulate + i);
        let lookup_key = ((i % prepopulate.max(1)) as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ 0xdeadbeef;
        if let Some(&v) = map.get(&lookup_key) {
            acc ^= v as u64;
        }
    }
    acc
}

/// Isolated FastMap<u64,u32> LOOKUP-only cost (no inserts mixed in),
/// isolating pure read cost at a given table size.
#[no_mangle]
pub unsafe extern "C" fn bench_fastmap_lookup_only_targeted(prepopulate: u32, repeats: u32) -> u64 {
    let mut map: FastMap<u64, u32> = FastMap::default();
    map.reserve(prepopulate as usize);
    for i in 0..prepopulate {
        map.insert((i as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ 0xdeadbeef, i);
    }
    let mut acc: u64 = 0;
    for i in 0..repeats {
        let lookup_key = ((i % prepopulate.max(1)) as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ 0xdeadbeef;
        if let Some(&v) = map.get(&lookup_key) {
            acc ^= v as u64;
        }
    }
    acc
}

// =======================================================================
// MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRECOMPUTATION_V1 -- prototype only.
// No production change, no commit/push. Builds the fixture-independent
// canonical backward BFS (B1..B7, established by the prior Sprint to be
// identical across every fallback-triggering scramble) ONCE into a static
// table, then replaces phase2's per-solve backward reconstruction with a
// SINGLE PASS over forward's own nodes doing O(1) lookups against that
// static table. phase1_raw_capture_forward_v2_impl, canonical_key_v2,
// compute_edge_state_key_fast5, apply_move, apply_seq, reconstruct_generic,
// find_symmetry_index, conjugate_seq, invert_pairs are all reused
// completely UNCHANGED; solve_cross_shared_forward_fallback_v2 (the
// existing, already-validated dynamic V2 pipeline) is also left
// completely UNCHANGED and used as this Sprint's own correctness oracle.
//
// Correctness note (why a single pass reproduces the dynamic version's
// result bit-for-bit, not just "a" valid solution): the dynamic version
// checks for a meeting after EVERY round and returns the FIRST match (by
// forward.key_to_id's own HashMap iteration order) found at the FIRST
// round where any match exists. Since backward only ever ADDS canonical
// keys (never removes), a forward node matching at round r also matches
// in the full round<=7 table; the winning node is therefore always the
// one with the GLOBAL MINIMUM round_accepted value among all matches,
// with ties (same round) broken by forward's own iteration order -- which
// is exactly what the strict '<' update below computes in one pass,
// without ever re-running apply_move/canonical_key_v2/dedup at solve time.
// =======================================================================

const PRECOMPUTED_BACKWARD_MAX_ROUND: u32 = 7;
const PRECOMPUTED_BACKWARD_FRONTIER_CAP: u32 = 1_500_000;

struct PrecomputedBackwardTable {
    canon_to_id_round: FastMap<u64, (u32, u8)>,
    real_key: Vec<u64>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
    nodes_per_round: [u32; 8],
    max_round: u8,
    frontier_cap_hit: bool,
}

static mut PRECOMPUTED_BACKWARD: Option<PrecomputedBackwardTable> = None;

/// Lazy-built exactly once (same discipline as direct_conj_tables above):
/// the SAME backward-only round body as phase2_continue_with_canonical_
/// backward_v2_impl's backward branch (canonical_key_v2-based dedup,
/// unmodified apply_move/compute_edge_state_key_fast5), starting fresh
/// from solved_state(), run for PRECOMPUTED_BACKWARD_MAX_ROUND rounds
/// (empirically confirmed via the existing, already-validated
/// solve_cross_shared_forward_fallback_v2's own phase1ForwardRounds/
/// phase2BackwardRounds stats to be exactly 6/7 for every one of the 10
/// fallback-triggering scrambles in the established 100-scramble
/// regression -- see this Sprint's own report for the raw numbers).
fn precomputed_backward_table() -> &'static PrecomputedBackwardTable {
    unsafe {
        let ptr = &raw mut PRECOMPUTED_BACKWARD;
        if (*ptr).is_none() {
            let target = solved_state();
            let target_key = compute_edge_state_key_fast5(&target);
            let target_canon = canonical_key_v2(&target);
            let mut canon_to_id_round: FastMap<u64, (u32, u8)> = FastMap::default();
            canon_to_id_round.insert(target_canon, (0, 0));
            let mut real_key = vec![target_key];
            let mut parent = vec![-1i32];
            let mut move_face = vec![0u8];
            let mut move_sign_negative = vec![false];
            let mut nodes_per_round = [0u32; 8];
            let mut frontier_cap_hit = false;
            let mut max_round_reached: u8 = 0;

            let mut frontier: Vec<(State, u32)> = vec![(target, 0)];
            let mut next: Vec<(State, u32)> = Vec::new();
            'rounds: for round in 1..=PRECOMPUTED_BACKWARD_MAX_ROUND {
                next.clear();
                for &(base_state, id) in &frontier {
                    for face in 0u8..12 {
                        for &sign_negative in &[false, true] {
                            let child = apply_move(&base_state, face, sign_negative);
                            let canon = canonical_key_v2(&child);
                            if canon_to_id_round.contains_key(&canon) {
                                continue;
                            }
                            if (next.len() as u32) >= PRECOMPUTED_BACKWARD_FRONTIER_CAP {
                                frontier_cap_hit = true;
                                break 'rounds;
                            }
                            let child_id = parent.len() as u32;
                            let child_key = compute_edge_state_key_fast5(&child);
                            canon_to_id_round.insert(canon, (child_id, round as u8));
                            real_key.push(child_key);
                            parent.push(id as i32);
                            move_face.push(face);
                            move_sign_negative.push(sign_negative);
                            next.push((child, child_id));
                        }
                    }
                }
                nodes_per_round[round as usize] = next.len() as u32;
                max_round_reached = round as u8;
                std::mem::swap(&mut frontier, &mut next);
            }

            *ptr = Some(PrecomputedBackwardTable {
                canon_to_id_round,
                real_key,
                parent,
                move_face,
                move_sign_negative,
                nodes_per_round,
                max_round: max_round_reached,
                frontier_cap_hit,
            });
        }
        (*ptr).as_ref().unwrap()
    }
}

#[no_mangle]
pub unsafe extern "C" fn precomputed_backward_table_ensure_built() -> i32 {
    let t = precomputed_backward_table();
    t.parent.len() as i32
}

/// [0..8]=nodesPerRound[0..8] (index0=root, unused) [8]=totalNodes
/// [9]=maxRoundReached [10]=frontierCapHit(0/1)
static mut PBT_STATS_WORDS: [u32; 11] = [0; 11];
#[no_mangle]
pub unsafe extern "C" fn precomputed_backward_table_stats_ptr() -> *const u32 {
    let t = precomputed_backward_table();
    PBT_STATS_WORDS = [
        t.nodes_per_round[0],
        t.nodes_per_round[1],
        t.nodes_per_round[2],
        t.nodes_per_round[3],
        t.nodes_per_round[4],
        t.nodes_per_round[5],
        t.nodes_per_round[6],
        t.nodes_per_round[7],
        t.parent.len() as u32,
        t.max_round as u32,
        if t.frontier_cap_hit { 1 } else { 0 },
    ];
    (&raw const PBT_STATS_WORDS) as *const u32
}

static mut CACHED_BWD_RESULT_BUF: Vec<u8> = Vec::new();

/// [0]=found(0/1) [1]=solutionLength [2]=phase1ForwardRounds
/// [3]=phase1BackwardRounds [4]=phase1Termination(0=foundInPhase1,
/// 1=frontierCapInPhase1, 2=captured/ranLookup) [5]=effectiveMaxRound
/// [6]=matchRound(0 if phase1-found or not-found) [7]=tableAlreadyBuilt
/// (0/1, state BEFORE this call -- 0 means THIS call triggered the build,
/// i.e. this call is "cold") [8]=forwardFinalSize
/// [9]=tableInsufficientDepth(0/1 -- effectiveMaxRound exceeded the
/// precomputed table's own max_round; should never be 1 for any of the
/// currently-known 10 fallback-triggering scrambles, per this Sprint's
/// own Gate A)
static mut CACHED_BWD_STATS_WORDS: [u32; 10] = [0; 10];

/// Same contract/inputs as solve_cross_shared_forward_fallback_v2
/// (existing, unmodified above), but phase2's dynamic backward
/// reconstruction is replaced by a single pass over forward's own nodes
/// against the precomputed table (see this section's own correctness
/// note). phase1_raw_capture_forward_v2_impl is reused verbatim -- only
/// the backward side changes.
#[no_mangle]
pub unsafe extern "C" fn solve_cross_cached_backward_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32) -> i32 {
    CACHED_BWD_STATS_WORDS = [0; 10];
    (&mut *&raw mut CACHED_BWD_RESULT_BUF).clear();
    let already_built = (&*&raw const PRECOMPUTED_BACKWARD).is_some();

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);

    if let Some(path) = phase1.found {
        let buf = &mut *&raw mut CACHED_BWD_RESULT_BUF;
        for (face, sign_negative) in &path {
            buf.push(*face);
            buf.push(if *sign_negative { 1 } else { 0 });
        }
        CACHED_BWD_STATS_WORDS = [1, path.len() as u32, phase1.forward_rounds, phase1.backward_rounds, 0, 0, 0, if already_built { 1 } else { 0 }, 0, 0];
        return path.len() as i32;
    }
    let Some(cap) = phase1.captured else {
        CACHED_BWD_STATS_WORDS = [0, 0, phase1.forward_rounds, phase1.backward_rounds, 1, 0, 0, if already_built { 1 } else { 0 }, 0, 0];
        return -1;
    };

    let table = precomputed_backward_table();
    let effective_max_round = total_max_half_depth.saturating_sub(cap.forward_rounds);
    let table_insufficient = effective_max_round > table.max_round as u32;

    let forward = &cap.forward;
    let mut best_round: u32 = u32::MAX;
    let mut best_fid: Option<u32> = None;
    for &fid in forward.key_to_id.values() {
        let canon = forward.canon_key[fid as usize];
        if let Some(&(_bid, round)) = table.canon_to_id_round.get(&canon) {
            let round = round as u32;
            if round <= effective_max_round && round < best_round {
                best_round = round;
                best_fid = Some(fid);
            }
        }
    }

    let Some(fid) = best_fid else {
        CACHED_BWD_STATS_WORDS = [
            0,
            0,
            cap.forward_rounds,
            phase1.backward_rounds,
            2,
            effective_max_round,
            0,
            if already_built { 1 } else { 0 },
            forward.key_to_id.len() as u32,
            if table_insufficient { 1 } else { 0 },
        ];
        return -1;
    };

    let canon = forward.canon_key[fid as usize];
    let (bid, round) = *table.canon_to_id_round.get(&canon).unwrap();

    let fpath = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, fid);
    let f_state = apply_seq(state, &fpath);
    let rep_key = table.real_key[bid as usize];
    let j = find_symmetry_index(&f_state, rep_key, pieces_slice);
    let rep_path = reconstruct_generic(&table.parent, &table.move_face, &table.move_sign_negative, bid);
    let conjugated_backward_path = conjugate_seq(&rep_path, &PI_F_INV_POWERS[CONJ_POWER_FOR_J[j]]);
    let mut combined = fpath;
    combined.extend(invert_pairs(&conjugated_backward_path));

    let buf = &mut *&raw mut CACHED_BWD_RESULT_BUF;
    for (face, sign_negative) in &combined {
        buf.push(*face);
        buf.push(if *sign_negative { 1 } else { 0 });
    }

    CACHED_BWD_STATS_WORDS = [
        1,
        combined.len() as u32,
        cap.forward_rounds,
        phase1.backward_rounds,
        2,
        effective_max_round,
        round as u32,
        if already_built { 1 } else { 0 },
        forward.key_to_id.len() as u32,
        if table_insufficient { 1 } else { 0 },
    ];
    combined.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn cached_bwd_stats_ptr() -> *const u32 {
    (&raw const CACHED_BWD_STATS_WORDS) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn cached_bwd_result_len() -> u32 {
    ((&*&raw const CACHED_BWD_RESULT_BUF).len() / 2) as u32
}
#[no_mangle]
pub unsafe extern "C" fn cached_bwd_result_ptr() -> *const u8 {
    (&*&raw const CACHED_BWD_RESULT_BUF).as_ptr()
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RESIDUAL3_MEETING_GAP_ANALYSIS_V1 -- pure
// measurement. No production/search-policy change. Determines, for each
// of the 3 remaining residual scrambles, whether ANY forward node's
// canonical key (already the min-over-C5-orbit representative --
// canonical_key_v2's own semantics, exhaustively validated bit-for-bit
// in earlier Sprints, e.g. MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_
// TARGETED_OPT_V1's Gate A over 450,054 states) exists ANYWHERE in the
// precomputed backward table (MEGAMINX_SOLVECROSS_BACKWARD_TABLE_
// PRECOMPUTATION_V1, reused completely unchanged, including its own
// lazy-build discipline). Since canonical_key_v2(S1) == canonical_key_v2(S2)
// iff S1 and S2's C5 orbits intersect (a state-key match at ANY relative
// rotation), a single canon-key equality check per forward node IS the
// complete orbit-vs-orbit intersection test the "raw key -> C5 orbit ->
// backward lookup" framing describes -- no separate 5-way orbit
// enumeration is needed, or would add anything beyond what
// canonical_key_v2 already encodes. phase1_raw_capture_forward_v2_impl
// and precomputed_backward_table() are reused completely unchanged.
// =======================================================================

/// [0]=forwardFinalSize [1]=hitCount [2]=minHitRound(0 if hitCount==0)
/// [3]=effectiveMaxRound [4]=tableInsufficientDepth(0/1)
/// [5]=phase1ForwardRounds
static mut RESIDUAL_GAP_STATS_WORDS: [u32; 6] = [0; 6];

/// Scans EVERY forward node from phase1's own captured tree (not a
/// sample) against the FULL precomputed backward table, counting exact
/// canonical-key hits within the solve's own effective_max_round budget
/// -- the exact same bound solve_cross_cached_backward_v1 itself uses.
/// Returns 1 if phase1 itself already found a raw meeting (unexpected
/// for the 3 known residuals), 0 on a normal scan, -1 if phase1's own
/// frontier cap was hit.
#[no_mangle]
pub unsafe extern "C" fn residual3_meeting_gap_analysis_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, total_max_half_depth: u32) -> i32 {
    RESIDUAL_GAP_STATS_WORDS = [0; 6];

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 1;
    }
    let Some(cap) = phase1.captured else {
        return -1;
    };

    let table = precomputed_backward_table();
    let effective_max_round = total_max_half_depth.saturating_sub(cap.forward_rounds);
    let table_insufficient = effective_max_round > table.max_round as u32;

    let forward = &cap.forward;
    let mut hit_count: u32 = 0;
    let mut min_hit_round: u32 = u32::MAX;
    for &fid in forward.key_to_id.values() {
        let canon = forward.canon_key[fid as usize];
        if let Some(&(_bid, round)) = table.canon_to_id_round.get(&canon) {
            let round = round as u32;
            if round <= effective_max_round {
                hit_count += 1;
                if round < min_hit_round {
                    min_hit_round = round;
                }
            }
        }
    }

    RESIDUAL_GAP_STATS_WORDS = [
        forward.key_to_id.len() as u32,
        hit_count,
        if hit_count > 0 { min_hit_round } else { 0 },
        effective_max_round,
        if table_insufficient { 1 } else { 0 },
        cap.forward_rounds,
    ];
    0
}

#[no_mangle]
pub unsafe extern "C" fn residual3_meeting_gap_stats_ptr() -> *const u32 {
    (&raw const RESIDUAL_GAP_STATS_WORDS) as *const u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RESIDUAL3_STATE_INVARIANT_ANALYSIS_V1 -- pure
// measurement. No production/search-policy change. Extracts, for every
// node of a forward tree (or the precomputed backward table), a compact
// structural signature of the RAW (pre-canonicalization) 5-tracked-piece
// state -- misplaced count, "external" count (tracked pieces sitting
// outside the 5 tracked pieces' own home slots 0..5), oriented count,
// and orientation parity -- explicitly NOT canonical_key_v2 itself
// (which already collapses the C5 orbit into one representative, per
// this Sprint's own explicit instruction). decode_base60_5,
// phase1_raw_capture_forward_v2_impl, and precomputed_backward_table()
// are all reused completely UNCHANGED; the raw fast5 key each tree node
// already stores (forward.key_to_id's own keys / backward.real_key) is
// decoded directly, no full-state replay needed.
// =======================================================================

/// misplaced(0..=5) * 72 + external(0..=5) * 12 + oriented(0..=5) * 2 +
/// orientParity(0/1). Range 0..432. NOT canonical_key_v2 -- this is a
/// structural feature of the RAW (single, uncanonicalized) state.
fn signature_from_key(key: u64) -> u16 {
    let digits = decode_base60_5(key);
    let mut misplaced: u16 = 0;
    let mut external: u16 = 0;
    let mut oriented: u16 = 0;
    let mut orient_parity: u16 = 0;
    for i in 0..5 {
        let pos = (digits[i] / 2) as i32;
        let orient = (digits[i] % 2) as u16;
        if pos != i as i32 {
            misplaced += 1;
        }
        if !(0..5).contains(&pos) {
            external += 1;
        }
        if orient == 0 {
            oriented += 1;
        }
        orient_parity ^= orient;
    }
    misplaced * 72 + external * 12 + oriented * 2 + orient_parity
}

const SIG_BUCKETS: usize = 432;
static mut SIG_HIST_BUF: [u32; SIG_BUCKETS] = [0; SIG_BUCKETS];

/// Signature histogram over phase1's own captured forward tree (the
/// CURRENT scramble in STATE_SCRATCH). Returns total forward states, or
/// 1 if phase1 itself already found a raw meeting, -1 if its frontier
/// cap was hit.
#[no_mangle]
pub unsafe extern "C" fn residual3_forward_signature_histogram_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32) -> i32 {
    SIG_HIST_BUF = [0; SIG_BUCKETS];
    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 1;
    }
    let Some(cap) = phase1.captured else {
        return -1;
    };

    for &key in cap.forward.key_to_id.keys() {
        let sig = signature_from_key(key) as usize;
        SIG_HIST_BUF[sig] += 1;
    }
    cap.forward.key_to_id.len() as i32
}

/// Signature histogram over the precomputed backward table (fixture-
/// independent, built/reused exactly as in MEGAMINX_SOLVECROSS_
/// BACKWARD_TABLE_PRECOMPUTATION_V1).
#[no_mangle]
pub unsafe extern "C" fn residual3_backward_signature_histogram_v1() -> i32 {
    SIG_HIST_BUF = [0; SIG_BUCKETS];
    let table = precomputed_backward_table();
    for &key in &table.real_key {
        let sig = signature_from_key(key) as usize;
        SIG_HIST_BUF[sig] += 1;
    }
    table.real_key.len() as i32
}

#[no_mangle]
pub unsafe extern "C" fn residual3_sig_hist_ptr() -> *const u32 {
    (&raw const SIG_HIST_BUF) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn residual3_sig_bucket_count() -> u32 {
    SIG_BUCKETS as u32
}

// =======================================================================
// MEGAMINX_SOLVECROSS_RESIDUAL3_CLUSTER_ENTRY_ANALYSIS_V1 -- pure
// measurement, no production/search-policy change. For a caller-supplied
// set of target signatures (the 24 found by MEGAMINX_SOLVECROSS_
// RESIDUAL3_STATE_INVARIANT_ANALYSIS_V1 to appear in comparison fixtures'
// forward trees but never in residual 3's), finds the SHALLOWEST depth
// at which each target signature is first reached in phase1's own
// forward tree, plus the move that led there and the full path (for
// suffix analysis) and a histogram of last-moves across every forward
// node tied at that shallowest depth. phase1_raw_capture_forward_v2_impl,
// reconstruct_generic, and signature_from_key are all reused completely
// UNCHANGED; this only adds new read-only aggregation on top of the
// existing, already-validated forward tree.
// =======================================================================

static mut CLUSTER_TARGET_SIGS_SCRATCH: [u16; 32] = [0; 32];

#[no_mangle]
pub unsafe extern "C" fn cluster_target_sigs_scratch_ptr() -> *mut u16 {
    (&raw mut CLUSTER_TARGET_SIGS_SCRATCH) as *mut u16
}

/// [slot]=bestDepth(-1 if never reached, 1..=12 otherwise), parallel to
/// the sig_count target signatures written into
/// CLUSTER_TARGET_SIGS_SCRATCH[0..sig_count] before this call.
static mut CLUSTER_BEST_DEPTH: [i16; 32] = [-1; 32];
/// [slot]=path length (0 if unreached).
static mut CLUSTER_BEST_PATH_LEN: [u8; 32] = [0; 32];
/// [slot][i*2]=face [slot][i*2+1]=signNegative(0/1), for i in 0..pathLen
/// (one arbitrary but real shallowest-depth path per target signature --
/// ties broken by HashMap iteration order, which is fine: any minimal-
/// depth path is equally informative for this Sprint's own suffix
/// analysis).
static mut CLUSTER_BEST_PATH: [[u8; 24]; 32] = [[0; 24]; 32];
/// [slot][face*2+signNegative] = count of forward nodes with this target
/// signature AT the shallowest depth found (not just the one stored
/// representative path) whose LAST move was this (face, sign).
static mut CLUSTER_MOVE_HIST: [[u32; 24]; 32] = [[0; 24]; 32];
static mut CLUSTER_TOTAL_FORWARD: u32 = 0;

#[no_mangle]
pub unsafe extern "C" fn residual3_cluster_entry_analysis_v1(pieces_len: u32, depth12_max_half_depth: u32, depth12_max_frontier: u32, sig_count: u32) -> i32 {
    CLUSTER_BEST_DEPTH = [-1; 32];
    CLUSTER_BEST_PATH_LEN = [0; 32];
    CLUSTER_BEST_PATH = [[0; 24]; 32];
    CLUSTER_MOVE_HIST = [[0; 24]; 32];
    CLUSTER_TOTAL_FORWARD = 0;

    let targets = &*&raw const CLUSTER_TARGET_SIGS_SCRATCH;
    let n = (sig_count as usize).min(32);

    let state = read_state_scratch();
    let pieces_bytes = &*&raw const PIECES_SCRATCH;
    let mut pieces = [0i8; 8];
    for i in 0..pieces_len as usize {
        pieces[i] = pieces_bytes[i] as i8;
    }
    let pieces_slice = &pieces[..pieces_len as usize];
    let target_state = solved_state();

    let phase1 = phase1_raw_capture_forward_v2_impl(state, target_state, pieces_slice, depth12_max_half_depth, depth12_max_frontier);
    if phase1.found.is_some() {
        return 1;
    }
    let Some(cap) = phase1.captured else {
        return -1;
    };

    let forward = &cap.forward;
    CLUSTER_TOTAL_FORWARD = forward.key_to_id.len() as u32;

    for (&key, &id) in forward.key_to_id.iter() {
        let sig = signature_from_key(key);
        let Some(slot) = targets[..n].iter().position(|&t| t == sig) else {
            continue;
        };

        let path = reconstruct_generic(&forward.parent, &forward.move_face, &forward.move_sign_negative, id);
        if path.is_empty() {
            continue;
        }
        let depth = path.len() as i16;
        let (last_face, last_sign) = path[path.len() - 1];
        let move_idx = (last_face as usize) * 2 + if last_sign { 1 } else { 0 };

        if CLUSTER_BEST_DEPTH[slot] == -1 || depth < CLUSTER_BEST_DEPTH[slot] {
            CLUSTER_BEST_DEPTH[slot] = depth;
            CLUSTER_MOVE_HIST[slot] = [0; 24];
            CLUSTER_MOVE_HIST[slot][move_idx] = 1;
            let plen = path.len().min(12);
            CLUSTER_BEST_PATH_LEN[slot] = plen as u8;
            let mut packed = [0u8; 24];
            for (i, &(f, s)) in path.iter().take(plen).enumerate() {
                packed[i * 2] = f;
                packed[i * 2 + 1] = if s { 1 } else { 0 };
            }
            CLUSTER_BEST_PATH[slot] = packed;
        } else if depth == CLUSTER_BEST_DEPTH[slot] {
            CLUSTER_MOVE_HIST[slot][move_idx] += 1;
        }
    }

    0
}

#[no_mangle]
pub unsafe extern "C" fn residual3_cluster_best_depth_ptr() -> *const i16 {
    (&raw const CLUSTER_BEST_DEPTH) as *const i16
}
#[no_mangle]
pub unsafe extern "C" fn residual3_cluster_best_path_len_ptr() -> *const u8 {
    (&raw const CLUSTER_BEST_PATH_LEN) as *const u8
}
#[no_mangle]
pub unsafe extern "C" fn residual3_cluster_best_path_ptr() -> *const u8 {
    (&raw const CLUSTER_BEST_PATH) as *const u8
}
#[no_mangle]
pub unsafe extern "C" fn residual3_cluster_move_hist_ptr() -> *const u32 {
    (&raw const CLUSTER_MOVE_HIST) as *const u32
}
#[no_mangle]
pub unsafe extern "C" fn residual3_cluster_total_forward() -> u32 {
    CLUSTER_TOTAL_FORWARD
}
