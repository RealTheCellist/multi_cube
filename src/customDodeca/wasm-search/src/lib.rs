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

#[derive(Clone, Copy)]
struct State {
    corner_perm: [i8; 20],
    corner_orient: [i8; 20],
    edge_perm: [i8; 30],
    edge_orient: [i8; 30],
}

const SOLVED: State = State {
    corner_perm: [0; 20],
    corner_orient: [0; 20],
    edge_perm: [0; 30],
    edge_orient: [0; 30],
};

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
    key_to_id: HashMap<u64, u32>,
    parent: Vec<i32>,
    move_face: Vec<u8>,
    move_sign_negative: Vec<bool>,
}

fn build_reachable_impl(state: State, kind: u8, pieces: &[i8], max_depth: u32, max_reachable: u32) -> ReachableIndex {
    let mut key_to_id: HashMap<u64, u32> = HashMap::new();
    let mut parent: Vec<i32> = Vec::new();
    let mut move_face: Vec<u8> = Vec::new();
    let mut move_sign_negative: Vec<bool> = Vec::new();
    let mut states: Vec<State> = Vec::new();

    key_to_id.insert(compute_key(&state, kind, pieces), 0);
    parent.push(-1);
    move_face.push(0);
    move_sign_negative.push(false);
    states.push(state);

    let mut frontier: Vec<u32> = vec![0];
    let mut depth: u32 = 0;
    'depth_loop: while depth < max_depth && !frontier.is_empty() && (key_to_id.len() as u32) < max_reachable {
        let mut next: Vec<u32> = Vec::new();
        for &id in &frontier {
            let base_state = states[id as usize];
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
                    states.push(child);
                    next.push(child_id);
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

/// `state_ptr` must point at exactly 100 bytes: cornerPerm[20] ++
/// cornerOrient[20] ++ edgePerm[30] ++ edgeOrient[30]. `pieces_ptr` points
/// at `pieces_len` i8 piece ids, already sorted ascending by the caller.
/// Replaces whatever reachable index a previous call built -- this module
/// only ever holds the ONE index a single findSafeApplication/
/// findFinishingApplication call is actively querying, matching how the
/// JS callers themselves use buildReachableMap's own return value.
#[no_mangle]
pub unsafe extern "C" fn build_reachable(state_ptr: *const u8, kind: u8, pieces_ptr: *const u8, pieces_len: u32, max_depth: u32, max_reachable: u32) {
    let state_bytes = std::slice::from_raw_parts(state_ptr as *const i8, 100);
    let mut state = SOLVED;
    state.corner_perm.copy_from_slice(&state_bytes[0..20]);
    state.corner_orient.copy_from_slice(&state_bytes[20..40]);
    state.edge_perm.copy_from_slice(&state_bytes[40..70]);
    state.edge_orient.copy_from_slice(&state_bytes[70..100]);

    let pieces = std::slice::from_raw_parts(pieces_ptr as *const i8, pieces_len as usize);
    CURRENT_INDEX = Some(build_reachable_impl(state, kind, pieces, max_depth, max_reachable));
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
