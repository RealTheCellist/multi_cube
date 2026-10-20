// Offline search: shortest commutators [A, B] on the Gigaminx (5-layer dodecahedron) whose net effect is confined to
// ONE piece orbit (corners, wings, inner corners, edge bridges or center bridges), with a small support there.
// usage: gigaminx-gen model.txt <maxLenA> <maxLenB|maxLenX> <maxMovedStatesInLowestOrbit> [conj]
// model.txt: line1 "n nm"; line2: n orbit ids (state index -> orbit); then nm lines: dest[i] = state index the state
// at i moves to. Move m's inverse is m ^ 1. A state index is (piece, orientation) for oriented orbits, so "the effect is
// the identity outside the orbit" also means no orientation change anywhere else.
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const N: usize = 360;
type P = [u16; N];

fn compose_first_then(a: &P, b: &P) -> P {
    let mut o = [0u16; N];
    for p in 0..N { o[p] = b[a[p] as usize]; }
    o
}
fn invert(a: &P) -> P { let mut o = [0u16; N]; for p in 0..N { o[a[p] as usize] = p as u16; } o }

struct W { word: Vec<u8>, perm: P, inv: P }

fn words_up_to(moves: &[P], maxlen: usize) -> Vec<W> {
    let nm = moves.len();
    let mut ident = [0u16; N]; for i in 0..N { ident[i] = i as u16; }
    let mut out = vec![];
    let mut frontier: Vec<(Vec<u8>, P)> = vec![(vec![], ident)];
    for _ in 1..=maxlen {
        let mut next = vec![];
        for (w, p) in &frontier {
            for m in 0..nm {
                if let Some(&last) = w.last() { if (last as usize) ^ 1 == m { continue; } }
                let np = compose_first_then(p, &moves[m]);
                let mut nw = w.clone(); nw.push(m as u8);
                next.push((nw, np));
            }
        }
        for (w, p) in &next { out.push(W { word: w.clone(), perm: *p, inv: invert(p) }); }
        frontier = next;
    }
    out
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let txt = std::fs::read_to_string(&args[1]).unwrap();
    let la: usize = args[2].parse().unwrap();
    let lb: usize = args[3].parse().unwrap();
    let max_support: usize = args[4].parse().unwrap();
    let mut it = txt.lines();
    let hdr: Vec<usize> = it.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let (n, nm) = (hdr[0], hdr[1]);
    assert_eq!(n, N);
    let orbit: Vec<u8> = it.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let mut moves: Vec<P> = vec![];
    for _ in 0..nm {
        let mut p = [0u16; N];
        for (i, v) in it.next().unwrap().split_whitespace().enumerate() { p[i] = v.parse().unwrap(); }
        moves.push(p);
    }
    let pool_a = Arc::new(words_up_to(&moves, la));
    // lb < 0 style switch: if the 5th argument is "conj", B ranges over X S X' with |X| <= lb and S a single move
    let conj = args.get(5).map(|x| x == "conj").unwrap_or(false);
    let pool_b = if conj {
        let xs = words_up_to(&moves, lb);
        let mut ident = [0u16; N]; for i in 0..N { ident[i] = i as u16; }
        let mut v: Vec<W> = vec![];
        let empty = W { word: vec![], perm: ident, inv: ident };
        for x in std::iter::once(&empty).chain(xs.iter()) {
            for s in 0..nm {
                if let Some(&last) = x.word.last() { if (last as usize) ^ 1 == s { continue; } }
                let mut word = x.word.clone(); word.push(s as u8);
                for &m in x.word.iter().rev() { word.push((m ^ 1) as u8); }
                let p1 = compose_first_then(&x.perm, &moves[s]);
                let perm = compose_first_then(&p1, &x.inv);
                let inv = invert(&perm);
                v.push(W { word, perm, inv });
            }
        }
        Arc::new(v)
    } else { Arc::new(words_up_to(&moves, lb)) };
    eprintln!("pools {} x {}", pool_a.len(), pool_b.len());
    // best per (orbit, number of moved states): (len, A, B)
    let best: Arc<Mutex<HashMap<(u8, usize), (usize, Vec<u8>, Vec<u8>, usize)>>> = Arc::new(Mutex::new(HashMap::new()));
    // shortest commutator per distinct moved-state set, for the orbits that have no orientation (inner corner, edge/center bridge) and exactly 3 moved states
    let cycles: Arc<Mutex<HashMap<Vec<u16>, (usize, Vec<u8>, Vec<u8>)>>> = Arc::new(Mutex::new(HashMap::new()));
    let counts: Arc<Mutex<HashMap<(u8, usize), usize>>> = Arc::new(Mutex::new(HashMap::new()));
    let threads = 4;
    let mut handles = vec![];
    for t in 0..threads {
        let (pa, pb, best, counts, orbit, cycles) = (pool_a.clone(), pool_b.clone(), best.clone(), counts.clone(), orbit.clone(), cycles.clone());
        handles.push(std::thread::spawn(move || {
            let mut local: HashMap<(u8, usize), (usize, Vec<u8>, Vec<u8>, usize)> = HashMap::new();
            let mut local_counts: HashMap<(u8, usize), usize> = HashMap::new();
            let mut local_cycles: HashMap<Vec<u16>, (usize, Vec<u8>, Vec<u8>)> = HashMap::new();
            for (ai, a) in pa.iter().enumerate() {
                if ai % threads != t { continue; }
                for b in pb.iter() {
                    // commutator A B A' B': state i -> b.inv[a.inv[b.perm[a.perm[i]]]]. States are ordered by orbit, so the
                    // first moved state fixes the LOWEST orbit touched; only that orbit's moved-state count matters (orbits
                    // above it may be disturbed freely, orbits below it must be untouched = a "stage m" commutator).
                    let mut moved = 0usize; let mut orb: i32 = -1;
                    for i in 0..N {
                        if orb != -1 && orbit[i] as i32 != orb { break; }
                        let j = b.inv[a.inv[b.perm[a.perm[i] as usize] as usize] as usize] as usize;
                        if j != i {
                            if orb == -1 { orb = orbit[i] as i32; if orb == 0 { break; } }
                            moved += 1;
                            if moved > max_support { break; }
                        }
                    }
                    if orb < 1 || moved == 0 || moved > max_support { continue; }
                    let len = 2 * (a.word.len() + b.word.len());
                    if (moved == 3 && orb >= 2) || (moved == 6 && orb == 1) {
                        let mut sup: Vec<u16> = vec![];
                        for i in 0..N { if orbit[i] as i32 == orb && b.inv[a.inv[b.perm[a.perm[i] as usize] as usize] as usize] as usize != i { sup.push(i as u16); } }
                        let e = local_cycles.entry(sup).or_insert((usize::MAX, vec![], vec![]));
                        if len < e.0 { *e = (len, a.word.clone(), b.word.clone()); }
                    }
                    let key = (orb as u8, moved);
                    *local_counts.entry(key).or_insert(0) += 1;
                    let e = local.entry(key).or_insert((usize::MAX, vec![], vec![], 0));
                    if len < e.0 { *e = (len, a.word.clone(), b.word.clone(), 0); }
                }
            }
            let mut g = best.lock().unwrap();
            for (k, v) in local { let e = g.entry(k).or_insert((usize::MAX, vec![], vec![], 0)); if v.0 < e.0 { *e = v; } }
            let mut cy = cycles.lock().unwrap();
            for (k, v) in local_cycles { let e = cy.entry(k).or_insert((usize::MAX, vec![], vec![])); if v.0 < e.0 { *e = v; } }
            let mut c = counts.lock().unwrap();
            for (k, v) in local_counts { *c.entry(k).or_insert(0) += v; }
        }));
    }
    for h in handles { h.join().unwrap(); }
    if let Some(path) = args.get(6) {
        let cy = cycles.lock().unwrap();
        let mut rows: Vec<_> = cy.iter().collect();
        rows.sort_by_key(|(_, v)| v.0);
        let mut out = String::new();
        for (sup, (len, a, b)) in rows { out.push_str(&format!("{} {} A={:?} B={:?}\n", len, sup.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(","), a, b)); }
        std::fs::write(path, out).unwrap();
    }
    let g = best.lock().unwrap(); let c = counts.lock().unwrap();
    let mut keys: Vec<_> = g.keys().cloned().collect();
    keys.sort();
    let names = ["corner", "wing", "innerCorner", "edgeBridge", "centerBridge"];
    for k in keys {
        let v = &g[&k];
        println!("{} movedStates {} shortestLen {} hits {} A={:?} B={:?}", names[k.0 as usize], k.1, v.0, c[&k], v.1, v.2);
    }
}
