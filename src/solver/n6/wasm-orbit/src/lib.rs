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
//!   3. call solve(n, maxDepth, maxStates) -> move count (>= 0), or a negative
//!      failure code: -1 visited-state cap exceeded, -2 no meeting within
//!      maxDepth rounds, -3 bad input (n out of range / start holds a piece
//!      that isn't in the orbit), -4 solution longer than the output buffer
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
static mut LAST_VISITED: u32 = 0;

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
/// Total states (both sides) the last solve() visited, for sizing the cap.
#[no_mangle]
pub extern "C" fn last_visited() -> u32 {
    unsafe { LAST_VISITED }
}
#[no_mangle]
pub extern "C" fn out_ptr() -> *const i32 {
    &raw const OUT as *const i32
}

type Key = (u64, u64);

const MAXN_PACKED: usize = 24; // 12 entries * 5 bits = 60 bits per u64 word
const EMPTY: u32 = u32::MAX; // "no parent" marker for a root row

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

/// Cheap hasher for the packed key (two u64 words): mixes both words so
/// hashbrown's top/bottom bit uses both see well-spread bits.
#[derive(Default)]
struct Mix(u64);
impl Hasher for Mix {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 = (self.0 ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    fn write_u64(&mut self, v: u64) {
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
type StateMap = HashMap<Key, u32, BuildHasherDefault<Mix>>;

/// One BFS side. Hybrid layout, chosen by measurement: hashbrown's SIMD
/// probing is markedly faster than a hand-rolled index table (~1.5x on the
/// hard scrambles), but the old per-state overhead (separate node Vec,
/// separate frontier Vec of key copies, map doubling) cost ~110 bytes. Here
/// every visited state is one row of three parallel arrays (16-byte key,
/// 4-byte parent, 1-byte move), and a round's frontier is just the
/// contiguous range of rows appended during that round (BFS appends in
/// order), so no frontier copy exists; the map only holds key -> row.
struct Side {
    keys: Vec<Key>,
    parent: Vec<u32>,
    mv: Vec<u8>,
    map: StateMap,
    frontier_start: usize,
    frontier_end: usize,
}

impl Side {
    fn new(root: Key) -> Self {
        let mut side = Side { keys: Vec::new(), parent: Vec::new(), mv: Vec::new(), map: StateMap::default(), frontier_start: 0, frontier_end: 1 };
        side.insert_new(root, EMPTY, 0);
        side
    }

    #[inline]
    fn find(&self, k: &Key) -> Option<u32> {
        self.map.get(k).copied()
    }

    /// Appends a state known not to be present yet; returns its row index.
    fn insert_new(&mut self, k: Key, parent: u32, m: u8) -> u32 {
        let idx = self.keys.len() as u32;
        self.keys.push(k);
        self.parent.push(parent);
        self.mv.push(m);
        self.map.insert(k, idx);
        idx
    }

    /// Moves from the root to row `idx`, in application order.
    fn path(&self, mut idx: u32) -> Vec<u8> {
        let mut out = Vec::new();
        while self.parent[idx as usize] != EMPTY {
            out.push(self.mv[idx as usize]);
            idx = self.parent[idx as usize];
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

/// Expands `me`'s current frontier by one round. Returns Some((meRow,
/// otherRow)) the instant a new state is already known to `other`, Err(())
/// if the visited-state cap was exceeded.
fn expand(tables: &[[u8; MAXN_PACKED]], n: usize, me: &mut Side, other: &Side, max_states: usize) -> Result<Option<(u32, u32)>, ()> {
    let (start, end) = (me.frontier_start, me.frontier_end);
    for row in start..end {
        let state = unpack(me.keys[row], n);
        for m in 0..NUM_MOVES {
            let ns = apply(tables, n, &state, m);
            if me.find(&ns).is_some() {
                continue;
            }
            let idx = me.insert_new(ns, row as u32, m as u8);
            if let Some(o) = other.find(&ns) {
                return Ok(Some((idx, o)));
            }
            if me.keys.len() + other.keys.len() > max_states {
                return Err(());
            }
        }
    }
    me.frontier_start = end;
    me.frontier_end = me.keys.len();
    Ok(None)
}

#[no_mangle]
pub extern "C" fn solve(n: u32, max_depth: u32, max_states: u32) -> i32 {
    let n = n as usize;
    if n == 0 || n > MAXN_PACKED {
        return -3;
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
            return -3; // start holds a piece that isn't in this orbit
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
            Err(()) => {
                unsafe {
                    LAST_VISITED = (fwd.keys.len() + bwd.keys.len()) as u32;
                }
                return -1;
            }
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
    unsafe {
        LAST_VISITED = (fwd.keys.len() + bwd.keys.len()) as u32;
    }
    let Some((f, b)) = hit else { return -2 };

    let mut moves: Vec<i32> = fwd.path(f).into_iter().map(|m| m as i32).collect();
    // bwd path is solved -> meeting; going meeting -> solved applies each
    // of those moves' inverses in reverse order.
    for m in bwd.path(b).into_iter().rev() {
        moves.push(m as i32 + NUM_MOVES as i32);
    }
    if moves.len() > MAX_OUT {
        return -4;
    }
    unsafe {
        let out = &mut *(&raw mut OUT);
        for (i, m) in moves.iter().enumerate() {
            out[i] = *m;
        }
    }
    moves.len() as i32
}
