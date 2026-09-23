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

#[derive(Clone, Copy)]
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
        out.corner_orient[pos] = (state.corner_orient[from] + mcod[pos]).rem_euclid(3);
    }
    for pos in 0..30 {
        let from = mep[pos] as usize;
        out.edge_perm[pos] = state.edge_perm[from];
        out.edge_orient[pos] = (state.edge_orient[from] + meod[pos]).rem_euclid(2);
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
    let mut positions = [0i8; 8]; // n is always <=8, see findFinishingApplication's own guard
    let mut remaining = n;
    for pos in 0..count {
        if remaining == 0 {
            break;
        }
        let piece = perm[pos];
        for i in 0..n {
            if pieces[i] == piece {
                positions[i] = pos as i8;
                remaining -= 1;
                break;
            }
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

    let mut frontier: Vec<(State, u32)> = vec![(state, 0)];
    let mut depth: u32 = 0;
    'depth_loop: while depth < max_depth && !frontier.is_empty() && (key_to_id.len() as u32) < max_reachable {
        let mut next: Vec<(State, u32)> = Vec::new();
        for &(base_state, id) in &frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
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
        frontier = next;
        depth += 1;
    }

    ReachableIndex { key_to_id, parent, move_face, move_sign_negative }
}

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

    let try_candidate = |s_path: &[(u8, bool)], c: &Commutator| -> Option<(State, Vec<(u8, bool)>)> {
        let s_inv = invert_seq(s_path);
        let mut full_seq = Vec::with_capacity(s_path.len() + c.seq.len() + s_inv.len());
        full_seq.extend_from_slice(s_path);
        full_seq.extend_from_slice(&c.seq);
        full_seq.extend_from_slice(&s_inv);
        let result_state = apply_seq(state, &full_seq);
        if !fixed_ok(&result_state, fixed_corners, fixed_edges) {
            return None;
        }
        let wrong_after = count_wrong(kind, &result_state, target_positions);
        let blocked = if require_improvement { wrong_after >= wrong_before } else { wrong_after > wrong_before };
        if blocked {
            return None;
        }
        Some((result_state, full_seq))
    };

    let found = if displaced == target {
        let reachable = build_reachable_impl(state, kind, &[target as i8], 9, 300_000);
        let mut result = None;
        'search: for c in library {
            for &anchor in &c.moving_support {
                let Some(&id) = reachable.key_to_id.get(&(anchor as u64)) else { continue };
                let s_path = reconstruct(&reachable, id);
                if let Some(hit) = try_candidate(&s_path, c) {
                    result = Some(hit);
                    break 'search;
                }
            }
        }
        result
    } else {
        let mut pieces = [target as i8, displaced as i8];
        pieces.sort();
        let reachable = build_reachable_impl(state, kind, &pieces, 11, 300_000);
        let mut result = None;
        'search2: for c in library {
            for &anchor in &c.moving_support {
                let dest = c.destination[anchor as usize];
                if dest == anchor {
                    continue;
                }
                let key = if target <= displaced { anchor as u64 * 30 + dest as u64 } else { dest as u64 * 30 + anchor as u64 };
                let Some(&id) = reachable.key_to_id.get(&key) else { continue };
                let s_path = reconstruct(&reachable, id);
                if let Some(hit) = try_candidate(&s_path, c) {
                    result = Some(hit);
                    break 'search2;
                }
            }
        }
        result
    };

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
    let mut positions = [0i8; 8];
    let mut remaining = n;
    for pos in 0..30 {
        if remaining == 0 {
            break;
        }
        let piece = state.edge_perm[pos];
        for i in 0..n {
            if pieces[i] == piece {
                positions[i] = pos as i8;
                remaining -= 1;
                break;
            }
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

fn bidirectional_search_impl(state: State, target: State, pieces: &[i8], max_half_depth: u32, max_frontier_size: u32) -> Option<Vec<(u8, bool)>> {
    let target_key = compute_edge_state_key(&target, pieces);
    let (mut forward, mut forward_frontier) = Tree::new(state, compute_edge_state_key(&state, pieces));
    let (mut backward, mut backward_frontier) = Tree::new(target, target_key);

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

    if let Some(m) = try_meet(&forward, &backward) {
        return Some(m);
    }

    for _ in 0..max_half_depth {
        let expand_forward = forward.key_to_id.len() <= backward.key_to_id.len();
        let (tree, frontier): (&mut Tree, &[(State, u32)]) = if expand_forward { (&mut forward, &forward_frontier) } else { (&mut backward, &backward_frontier) };
        let mut next: Vec<(State, u32)> = Vec::new();
        for &(base_state, id) in frontier {
            for face in 0u8..12 {
                for &sign_negative in &[false, true] {
                    let child = apply_move(&base_state, face, sign_negative);
                    let key = compute_edge_state_key(&child, pieces);
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
                }
            }
        }
        if expand_forward {
            forward_frontier = next;
        } else {
            backward_frontier = next;
        }
        if let Some(m) = try_meet(&forward, &backward) {
            return Some(m);
        }
    }
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
    let Some(moves) = bidirectional_search_impl(state, solved_state(), &pieces[..pieces_len as usize], max_half_depth, max_frontier_size) else {
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
