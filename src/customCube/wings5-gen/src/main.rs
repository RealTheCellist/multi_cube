// Offline search for pure wing 3-cycle commutators on the 5x5x5.
// usage: wings5-gen model.txt <maxLenA> <maxLenB>
// model.txt: line1 "n nm"; line2 n flags (W = wing sticker, - = anything else); then nm lines of sticker
// destination permutations (dest[i] = sticker slot that the sticker at slot i moves to). Move m's inverse is m ^ 1.
use std::collections::HashMap;
const NS: usize = 150;
type P = [u8; NS];

fn compose_first_then(a: &P, b: &P) -> P {
    let mut o = [0u8; NS];
    for p in 0..NS { o[p] = b[a[p] as usize]; }
    o
}
fn invert(a: &P) -> P { let mut o = [0u8; NS]; for p in 0..NS { o[a[p] as usize] = p as u8; } o }

fn words_up_to(moves: &[P], maxlen: usize) -> Vec<(Vec<u8>, P, P)> {
    let nm = moves.len();
    let mut ident = [0u8; NS]; for i in 0..NS { ident[i] = i as u8; }
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
        for (w, p) in &next { out.push((w.clone(), *p, invert(p))); }
        frontier = next;
    }
    out
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let txt = std::fs::read_to_string(&args[1]).unwrap();
    let (la, lb): (usize, usize) = (args[2].parse().unwrap(), args[3].parse().unwrap());
    let mut it = txt.lines();
    let hdr: Vec<usize> = it.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let (n, nm) = (hdr[0], hdr[1]);
    assert_eq!(n, NS);
    let wing: Vec<bool> = it.next().unwrap().split_whitespace().map(|s| s == "W").collect();
    let mut moves: Vec<P> = vec![];
    for _ in 0..nm {
        let mut p = [0u8; NS];
        for (i, v) in it.next().unwrap().split_whitespace().enumerate() { p[i] = v.parse().unwrap(); }
        moves.push(p);
    }
    let others: Vec<usize> = (0..NS).filter(|&i| !wing[i]).collect();
    let pool_a = words_up_to(&moves, la);
    let pool_b = words_up_to(&moves, lb);
    eprintln!("pools {} x {}", pool_a.len(), pool_b.len());
    let mut best: HashMap<Vec<u8>, (usize, Vec<u8>, Vec<u8>)> = HashMap::new();
    for (wa, pa, ia) in &pool_a {
        for (wb, pb, ib) in &pool_b {
            // commutator A B A' B': piece at i -> ib[ia[pb[pa[i]]]]
            let mut ok = true;
            for &i in &others {
                let j = ib[ia[pb[pa[i] as usize] as usize] as usize] as usize;
                if j != i { ok = false; break; }
            }
            if !ok { continue; }
            let mut moved: Vec<u8> = vec![];
            for i in 0..NS {
                if !wing[i] { continue; }
                let j = ib[ia[pb[pa[i] as usize] as usize] as usize] as usize;
                if j != i { moved.push(i as u8); }
            }
            if moved.len() != 6 { continue; }
            let len = 2 * (wa.len() + wb.len());
            let e = best.entry(moved).or_insert((usize::MAX, vec![], vec![]));
            if len < e.0 { *e = (len, wa.clone(), wb.clone()); }
        }
    }
    let mut out: Vec<_> = best.iter().collect();
    out.sort_by_key(|(_, v)| v.0);
    for (sup, (len, a, b)) in out.iter().take(1000000) { println!("len {} support {:?} A={:?} B={:?}", len, sup, a, b); }
    eprintln!("distinct pure wing 3-cycles: {}", best.len());
}
