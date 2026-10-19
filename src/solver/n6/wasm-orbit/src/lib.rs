//! Bidirectional BFS over a small "orbit" of up to 32 slots, ported from
//! royalPyraminxCommutators.ts's meetInMiddleOrbitSolve (the N=6 axial
//! fallback's orbit2+orbit5 search -- the only heavy-tailed step in that
//! fallback in plain JS). Same algorithm and expansion order as the TS
//! version, so it finds the same meeting point; just without per-node JS
//! allocation/GC.
//!
//! State representation: a state is a permutation of the orbit's own `n`
//! pieces, so each entry is an index 0..n-1 (the position of that piece id
//! in the `solved` array) and fits in 5 bits. A whole state (n <= 24) packs
//! into two u64 words, so the visited-state tables key on 16 bytes instead of a
//! 32-byte array: about half the memory per state and a cheaper hash/compare,
//! which is what dominates the hardest scrambles (millions of states).
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
struct Mix(u64);
impl Hasher for Mix {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 = (self.0 ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    fn write_u64(&mut self, v: u64) {
        // Called once per word of the key; fold both words into one well-mixed value.
        let mut h = (self.0 ^ v).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        h ^= h >> 32;
        self.0 = h.rotate_left(23);
    }
    fn finish(&self) -> u64 {
        let mut h = self.0.wrapping_mul(0xd6e8_feb8_6659_fd93);
        h ^= h >> 32;
        h
    }
}

type Key = (u64, u64);
type StateMap = HashMap<Key, u32, BuildHasherDefault<Mix>>;

const MAXN_PACKED: usize = 24; // 12 entries * 5 bits = 60 bits per u64 word

#[inline]
fn pack(s: &[u8; MAXN_PACKED], n: usize) -> Key {
    let (mut lo, mut hi) = (0u64, 0u64);
    for i in 0..n.min(12) {
        lo |= (s[i] as u64) << (5 * i);
    }
    for i in 12..n {
        hi |= (s[i] as u64) << (5 * (i - 12));
    }
    (lo, hi)
}

#[inline]
fn unpack(k: Key, n: usize) -> [u8; MAXN_PACKED] {
    let mut s = [0u8; MAXN_PACKED];
    for i in 0..n.min(12) {
        s[i] = ((k.0 >> (5 * i)) & 31) as u8;
    }
    for i in 12..n {
        s[i] = ((k.1 >> (5 * (i - 12))) & 31) as u8;
    }
    s
}

/// One BFS side. `nodes[i]` = (parent index or u32::MAX, move that led here);
/// `map` maps a packed state to its node index; `frontier` holds the states
/// (and node indices) of the most recently completed round only, so the
/// per-visited-state memory is just the 16-byte key + 4-byte index + a small node.
struct Side {
    nodes: Vec<(u32, u8)>,
    map: StateMap,
    frontier: Vec<(Key, u32)>,
}

impl Side {
    fn new(root: Key) -> Self {
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

/// `tables[m][i]` = the state index slot i's entry moves to under move m.
fn apply(tables: &[[u8; MAXN_PACKED]], n: usize, s: &[u8; MAXN_PACKED], m: usize) -> Key {
    let mut out = [0u8; MAXN_PACKED];
    let t = &tables[m];
    for i in 0..n {
        out[t[i] as usize] = s[i];
    }
    pack(&out, n)
}

/// Expands `me`'s frontier by one round. Returns Some((meNodeIdx,
/// otherNodeIdx)) the instant a new state is already known to `other`,
/// Err(()) if the visited-state cap was exceeded.
fn expand(tables: &[[u8; MAXN_PACKED]], n: usize, me: &mut Side, other: &Side, max_states: usize) -> Result<Option<(u32, u32)>, ()> {
    let frontier = std::mem::take(&mut me.frontier);
    let mut next: Vec<(Key, u32)> = Vec::new();
    for (packed, parent) in &frontier {
        let state = unpack(*packed, n);
        for m in 0..NUM_MOVES {
            let ns = apply(tables, n, &state, m);
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
    if n == 0 || n > MAXN_PACKED {
        return -1;
    }
    let (perms, start, solved) = unsafe { (&*(&raw const PERMS), &*(&raw const START), &*(&raw const SOLVED)) };

    // Re-label piece ids as 0..n-1 by their position in `solved`.
    let mut label = [255u8; 256];
    for i in 0..n {
        label[solved[i] as usize] = i as u8;
    }
    let mut start_s = [0u8; MAXN_PACKED];
    let mut solved_s = [0u8; MAXN_PACKED];
    for i in 0..n {
        let l = label[start[i] as usize];
        if l == 255 {
            return -1; // start holds a piece that isn't in this orbit
        }
        start_s[i] = l;
        solved_s[i] = i as u8;
    }
    let start_p = pack(&start_s, n);
    let solved_p = pack(&solved_s, n);
    if start_p == solved_p {
        return 0;
    }

    // Per-move index tables, copied out of the shared buffer once.
    let mut tables = vec![[0u8; MAXN_PACKED]; NUM_MOVES];
    for m in 0..NUM_MOVES {
        for i in 0..n {
            tables[m][i] = perms[m * MAXN + i];
        }
    }

    let mut fwd = Side::new(start_p);
    let mut bwd = Side::new(solved_p);
    let cap = max_states as usize;

    // (forward node, backward node) of the meeting state.
    let mut hit: Option<(u32, u32)> = None;
    'rounds: for _depth in 1..=max_depth {
        match expand(&tables, n, &mut fwd, &bwd, cap) {
            Ok(Some((f, b))) => {
                hit = Some((f, b));
                break 'rounds;
            }
            Ok(None) => {}
            Err(()) => return -1,
        }
        match expand(&tables, n, &mut bwd, &fwd, cap) {
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
