// Offline search for pure 3-cycle commutators on the 5x5x5 X-centers and T-centers.
// usage: centers5-gen model.txt <maxWordLen>
// model.txt: line1 "n nm"; line2 n type chars (X/T); then nm lines of dest permutations
// (dest[p] = position the piece at p moves to). Moves come in (sign +1, sign -1) pairs.
use std::collections::HashMap;
const NS: usize = 48;
type P = [u8; NS];

fn compose_first_then(a: &P, b: &P) -> P { // apply a then b: piece at p goes a[p] then b[a[p]]
    let mut o = [0u8; NS];
    for p in 0..NS { o[p] = b[a[p] as usize]; }
    o
}
fn invert(a: &P) -> P { let mut o = [0u8; NS]; for p in 0..NS { o[a[p] as usize] = p as u8; } o }

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let txt = std::fs::read_to_string(&args[1]).unwrap();
    let maxlen: usize = args[2].parse().unwrap();
    let mut it = txt.lines();
    let hdr: Vec<usize> = it.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let (n, nm) = (hdr[0], hdr[1]);
    assert_eq!(n, NS);
    let types: Vec<char> = it.next().unwrap().split_whitespace().map(|s| s.chars().next().unwrap()).collect();
    let mut moves: Vec<P> = vec![];
    for _ in 0..nm {
        let mut p = [0u8; NS];
        for (i, v) in it.next().unwrap().split_whitespace().enumerate() { p[i] = v.parse().unwrap(); }
        moves.push(p);
    }
    // words up to maxlen, skipping immediate inverse pairs
    let mut words: Vec<(Vec<u8>, P, P)> = vec![]; // (word, perm, inverse perm)
    let mut ident = [0u8; NS]; for i in 0..NS { ident[i] = i as u8; }
    let mut frontier: Vec<(Vec<u8>, P)> = vec![(vec![], ident)];
    for _l in 1..=maxlen {
        let mut next = vec![];
        for (w, p) in &frontier {
            for m in 0..nm {
                if let Some(&last) = w.last() { if (last as usize) ^ 1 == m { continue; } }
                let np = compose_first_then(p, &moves[m]);
                let mut nw = w.clone(); nw.push(m as u8);
                next.push((nw, np));
            }
        }
        for (w, p) in &next { words.push((w.clone(), *p, invert(p))); }
        frontier = next;
    }
    eprintln!("words: {}", words.len());
    // keep best (shortest) per distinct 3-cycle support-cycle
    let mut best: HashMap<(char, Vec<u8>), (usize, Vec<u8>, Vec<u8>)> = HashMap::new();
    for (wa, pa, ia) in &words {
        for (wb, pb, ib) in &words {
            // commutator: A B A' B' (apply in that order)
            let ab = compose_first_then(pa, pb);
            let aba = compose_first_then(&ab, ia);
            let c = compose_first_then(&aba, ib);
            let mut cnt = 0; let mut tp = 'X'; let mut ok = true;
            let mut sup = [0u8; 3];
            for p in 0..NS { if c[p] as usize != p {
                if cnt == 3 { ok = false; break; }
                sup[cnt] = p as u8; cnt += 1; tp = types[p];
            } }
            if !ok || cnt != 3 { continue; }
            if sup.iter().any(|&p| types[p as usize] != tp) { continue; }
            let len = 2 * (wa.len() + wb.len());
            let key = (tp, sup.to_vec());
            let e = best.entry(key).or_insert((usize::MAX, vec![], vec![]));
            if len < e.0 { *e = (len, wa.clone(), wb.clone()); }
        }
    }
    let mut out: Vec<_> = best.iter().collect();
    out.sort_by_key(|(_, v)| v.0);
    for ((tp, sup), (len, a, b)) in out.iter().take(100000) {
        println!("{} len {} support {:?} A={:?} B={:?}", tp, len, sup, a, b);
    }
    eprintln!("distinct 3-cycles found: {}", best.len());
}
