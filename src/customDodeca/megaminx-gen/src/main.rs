// Offline search: commutators [A, B] on the Megaminx family (20 corners x3 orientations, 30 edges x2) whose net effect
// is confined to ONE piece type (only corners, or only edges), touching few pieces.
// usage: megaminx-gen model.txt <maxLenA> <maxLenB> <maxPieces> [conj] [out.txt]
// model.txt: line1 "n nm"; line2: state index -> orbit id (0 corners, 1 edges); then nm lines: dest[i] = state index the
// state at i moves to. Move m's inverse is m ^ 1.  With `conj`, B ranges over X S X' (|X| <= maxLenB, S one move).
use std::collections::HashMap;

const N: usize = 120;
type P = [u8; N];

fn compose_first_then(a: &P, b: &P) -> P {
    let mut o = [0u8; N];
    for p in 0..N { o[p] = b[a[p] as usize]; }
    o
}
fn invert(a: &P) -> P { let mut o = [0u8; N]; for p in 0..N { o[a[p] as usize] = p as u8; } o }

struct W { word: Vec<u8>, perm: P, inv: P }

fn words_up_to(moves: &[P], maxlen: usize) -> Vec<W> {
    let nm = moves.len();
    let mut ident = [0u8; N]; for i in 0..N { ident[i] = i as u8; }
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
    let max_pieces: usize = args[4].parse().unwrap();
    let conj = args.get(5).map(|x| x == "conj").unwrap_or(false);
    let out_path = args.get(6).cloned();
    let mut it = txt.lines();
    let hdr: Vec<usize> = it.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let (n, nm) = (hdr[0], hdr[1]);
    assert_eq!(n, N);
    let orbit: Vec<u8> = it.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let mut moves: Vec<P> = vec![];
    for _ in 0..nm {
        let mut p = [0u8; N];
        for (i, v) in it.next().unwrap().split_whitespace().enumerate() { p[i] = v.parse().unwrap(); }
        moves.push(p);
    }
    let pool_a = words_up_to(&moves, la);
    let pool_b: Vec<W> = if conj {
        let xs = words_up_to(&moves, lb);
        let mut ident = [0u8; N]; for i in 0..N { ident[i] = i as u8; }
        let empty = W { word: vec![], perm: ident, inv: ident };
        let mut v = vec![];
        for x in std::iter::once(&empty).chain(xs.iter()) {
            for s in 0..nm {
                if let Some(&last) = x.word.last() { if (last as usize) ^ 1 == s { continue; } }
                let mut word = x.word.clone(); word.push(s as u8);
                for &m in x.word.iter().rev() { word.push(m ^ 1); }
                let perm = compose_first_then(&compose_first_then(&x.perm, &moves[s]), &x.inv);
                let inv = invert(&perm);
                v.push(W { word, perm, inv });
            }
        }
        v
    } else { words_up_to(&moves, lb) };
    eprintln!("pools {} x {}", pool_a.len(), pool_b.len());
    // per (orbit, pieces touched): shortest len + hit count; every distinct moved-state set kept for the output file
    let mut best: HashMap<(u8, usize), (usize, Vec<u8>, Vec<u8>, usize)> = HashMap::new();
    let mut sets: HashMap<Vec<u8>, (usize, Vec<u8>, Vec<u8>)> = HashMap::new();
    for a in &pool_a {
        for b in &pool_b {
            // commutator A B A' B': state i -> b.inv[a.inv[b.perm[a.perm[i]]]]
            let mut moved: Vec<u8> = vec![]; let mut orb: i32 = -1; let mut ok = true;
            for i in 0..N {
                let j = b.inv[a.inv[b.perm[a.perm[i] as usize] as usize] as usize] as usize;
                if j != i {
                    let o = orbit[i] as i32;
                    if orb == -1 { orb = o; } else if orb != o { ok = false; break; }
                    moved.push(i as u8);
                    if moved.len() > max_pieces * 3 { ok = false; break; }
                }
            }
            if !ok || moved.is_empty() { continue; }
            let per_piece = if orb == 0 { 3 } else { 2 };
            let pieces = moved.len() / per_piece;
            let len = 2 * (a.word.len() + b.word.len());
            let e = best.entry((orb as u8, pieces)).or_insert((usize::MAX, vec![], vec![], 0));
            e.3 += 1;
            if len < e.0 { e.0 = len; e.1 = a.word.clone(); e.2 = b.word.clone(); }
            let s = sets.entry(moved).or_insert((usize::MAX, vec![], vec![]));
            if len < s.0 { *s = (len, a.word.clone(), b.word.clone()); }
        }
    }
    let mut keys: Vec<_> = best.keys().cloned().collect();
    keys.sort();
    let names = ["corners", "edges"];
    for k in keys {
        let v = &best[&k];
        println!("{} piecesTouched {} shortestLen {} hits {} A={:?} B={:?}", names[k.0 as usize], k.1, v.0, v.3, v.1, v.2);
    }
    if let Some(path) = out_path {
        let mut rows: Vec<_> = sets.iter().collect();
        rows.sort_by_key(|(_, v)| v.0);
        let mut out = String::new();
        for (st, (len, a, b)) in rows {
            let orb = orbit[st[0] as usize];
            out.push_str(&format!("{} {} {} A={:?} B={:?}\n", orb, len, st.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(","), a, b));
        }
        std::fs::write(path, out).unwrap();
    }
}
