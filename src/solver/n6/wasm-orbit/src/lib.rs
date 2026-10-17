//! Bidirectional BFS over a small "orbit" of up to 32 slots, ported from
//! royalPyraminxCommutators.ts's meetInMiddleOrbitSolve (the N=6 axial
//! fallback's orbit2+orbit5 search -- the only heavy-tailed step in that
//! fallback in plain JS). Same algorithm and expansion order as the TS
//! version, so it finds the same meeting point; just without per-node JS
//! allocation/GC.
//!
//! JS side protocol (raw `extern "C"`, no wasm-bindgen, same style as
//! src/customDodeca/wasm-search):
//!   1. write NUM_MOVES*MAXN bytes at perms_ptr(): perms[m*MAXN + i] = the
//!      state index slot i's piece moves to under move m
//!   2. write n bytes at start_ptr() and at solved_ptr()
//!   3. call solve(n, maxDepth, maxStates) -> move count, or -1 if no
//!      meeting within maxDepth rounds / maxStates visited states
//!   4. read the result at out_ptr(): i32 per move, raw < NUM_MOVES means
//!      "apply move raw", raw >= NUM_MOVES means "apply the inverse of
//!      move raw - NUM_MOVES" (same encoding royalAxialSolver.wasm uses).

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

const MAXN: usize = 32;
const NUM_MOVES: usize = 40;
const MAX_OUT: usize = 256;

static mut PERMS: [u8; NUM_MOVES * MAXN] = [0; NUM_MOVES * MAXN];
static mut START: [u8; MAXN] = [0; MAXN];
static mut SOLVED: [u8; MAXN] = [0; MAXN];
static mut OUT: [i32; MAX_OUT] = [0; MAX_OUT];

#[no_mangle]
pub extern "C" fn perms_ptr() -> *mut u8 {
    &raw mut PERMS as *mut u8
}
#[no_mangle]
pub extern "C" fn start_ptr() -> *mut u8 {
    &raw mut START as *mut u8
}
#[no_mangle]
pub extern "C" fn solved_ptr() -> *mut u8 {
    &raw mut SOLVED as *mut u8
}
#[no_mangle]
pub extern "C" fn out_ptr() -> *const i32 {
    &raw const OUT as *const i32
}

#[derive(Default)]
struct Fnv(u64);
impl Hasher for Fnv {
    fn write(&mut self, bytes: &[u8]) {
        let mut h = if self.0 == 0 { 0xcbf2_9ce4_8422_2325 } else { self.0 };
        for &b in bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        self.0 = h;
    }
    fn finish(&self) -> u64 {
        self.0
    }
}
type StateMap = HashMap<[u8; MAXN], u32, BuildHasherDefault<Fnv>>;

/// One BFS side. `nodes[i]` = (parent index or u32::MAX, move that led here);
/// `map` maps a state to its node index; `frontier` holds the states (and
/// their node indices) of the most recently completed round only, so the
/// per-visited-state memory is just the map entry plus a small node.
struct Side {
    nodes: Vec<(u32, u8)>,
    map: StateMap,
    frontier: Vec<([u8; MAXN], u32)>,
}

impl Side {
    fn new(root: [u8; MAXN]) -> Self {
        let mut map = StateMap::default();
        map.insert(root, 0);
        Side { nodes: vec![(u32::MAX, 0)], map, frontier: vec![(root, 0)] }
    }
    /// Moves from the root to node `idx`, in application order.
    fn path(&self, mut idx: u32) -> Vec<u8> {
        let mut out = Vec::new();
        while self.nodes[idx as usize].0 != u32::MAX {
            out.push(self.nodes[idx as usize].1);
            idx = self.nodes[idx as usize].0;
        }
        out.reverse();
        out
    }
}

fn apply(perms: &[u8], n: usize, s: &[u8; MAXN], m: usize) -> [u8; MAXN] {
    let mut out = [0u8; MAXN];
    let t = &perms[m * MAXN..m * MAXN + n];
    for i in 0..n {
        out[t[i] as usize] = s[i];
    }
    out
}

/// Expands `me`'s frontier by one round. Returns Some((meNodeIdx,
/// otherNodeIdx)) the instant a new state is already known to `other`,
/// Err(()) if the visited-state cap was exceeded.
fn expand(perms: &[u8], n: usize, me: &mut Side, other: &Side, max_states: usize) -> Result<Option<(u32, u32)>, ()> {
    let frontier = std::mem::take(&mut me.frontier);
    let mut next: Vec<([u8; MAXN], u32)> = Vec::new();
    for (state, parent) in &frontier {
        for m in 0..NUM_MOVES {
            let ns = apply(perms, n, state, m);
            if me.map.contains_key(&ns) {
                continue;
            }
            let idx = me.nodes.len() as u32;
            me.nodes.push((*parent, m as u8));
            me.map.insert(ns, idx);
            if let Some(&o) = other.map.get(&ns) {
                return Ok(Some((idx, o)));
            }
            next.push((ns, idx));
            if me.nodes.len() + other.nodes.len() > max_states {
                return Err(());
            }
        }
    }
    me.frontier = next;
    Ok(None)
}

#[no_mangle]
pub extern "C" fn solve(n: u32, max_depth: u32, max_states: u32) -> i32 {
    let n = n as usize;
    if n == 0 || n > MAXN {
        return -1;
    }
    let (perms, start, solved) = unsafe { (&*(&raw const PERMS), &*(&raw const START), &*(&raw const SOLVED)) };
    let mut start_s = [0u8; MAXN];
    let mut solved_s = [0u8; MAXN];
    start_s[..n].copy_from_slice(&start[..n]);
    solved_s[..n].copy_from_slice(&solved[..n]);
    if start_s == solved_s {
        return 0;
    }

    let mut fwd = Side::new(start_s);
    let mut bwd = Side::new(solved_s);
    let cap = max_states as usize;

    // (forward node, backward node) of the meeting state.
    let mut hit: Option<(u32, u32)> = None;
    'rounds: for _depth in 1..=max_depth {
        match expand(perms, n, &mut fwd, &bwd, cap) {
            Ok(Some((f, b))) => {
                hit = Some((f, b));
                break 'rounds;
            }
            Ok(None) => {}
            Err(()) => return -1,
        }
        match expand(perms, n, &mut bwd, &fwd, cap) {
            Ok(Some((b, f))) => {
                hit = Some((f, b));
                break 'rounds;
            }
            Ok(None) => {}
            Err(()) => return -1,
        }
    }
    let Some((f, b)) = hit else { return -1 };

    let mut moves: Vec<i32> = fwd.path(f).into_iter().map(|m| m as i32).collect();
    // bwd path is solved -> meeting; going meeting -> solved applies each
    // of those moves' inverses in reverse order.
    for m in bwd.path(b).into_iter().rev() {
        moves.push(m as i32 + NUM_MOVES as i32);
    }
    if moves.len() > MAX_OUT {
        return -1;
    }
    unsafe {
        let out = &mut *(&raw mut OUT);
        for (i, m) in moves.iter().enumerate() {
            out[i] = *m;
        }
    }
    moves.len() as i32
}
