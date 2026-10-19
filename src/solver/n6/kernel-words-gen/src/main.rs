use std::collections::HashMap;
use std::time::Instant;

type P = [u8; 24];
const NM: usize = 40;

fn compose(a: &P, b: &P) -> P { // (a∘b)[i] = a[b[i]]  == apply a then b with pull semantics
    let mut o = [0u8; 24];
    for i in 0..24 { o[i] = a[b[i] as usize]; }
    o
}
fn inv(a: &P) -> P { let mut o = [0u8; 24]; for i in 0..24 { o[a[i] as usize] = i as u8; } o }
fn ident() -> P { let mut o = [0u8; 24]; for i in 0..24 { o[i] = i as u8; } o }

fn main() {
    let txt = std::fs::read_to_string("perms.txt").unwrap();
    let mut names = vec![]; let mut r: Vec<P> = vec![];
    for l in txt.lines() {
        let mut it = l.split_whitespace();
        names.push(it.next().unwrap().to_string());
        let mut p = [0u8; 24];
        for i in 0..24 { p[i] = it.next().unwrap().parse().unwrap(); }
        r.push(p);
    }
    assert_eq!(r.len(), NM);
    for m in 0..NM { assert_eq!(compose(&r[m], &r[m ^ 1]), ident(), "inverse pairing {}", m); }

    // ---------- Part 1: kernel words (o5 part trivial, o2 part = h)
    let depth: usize = std::env::args().nth(1).map(|s| s.parse().unwrap()).unwrap_or(6);
    let t0 = Instant::now();
    // nodes: (perm, parent, move)
    let mut nodes: Vec<(P, u32, u8)> = vec![(ident(), u32::MAX, 0)];
    let mut seen: HashMap<P, u32> = HashMap::new();
    seen.insert(ident(), 0);
    let (mut fs, mut fe) = (0usize, 1usize);
    for _d in 0..depth {
        for row in fs..fe {
            let c = nodes[row].0;
            for m in 0..NM {
                let n = compose(&c, &r[m]);
                if seen.contains_key(&n) { continue; }
                let id = nodes.len() as u32;
                seen.insert(n, id);
                nodes.push((n, row as u32, m as u8));
            }
        }
        fs = fe; fe = nodes.len();
    }
    println!("joint states depth<= {}: {} ({:?})", depth, nodes.len(), t0.elapsed());
    drop(seen);
    let word = |mut id: u32| -> Vec<u8> {
        let mut w = vec![];
        while nodes[id as usize].1 != u32::MAX { w.push(nodes[id as usize].2); id = nodes[id as usize].1; }
        w.reverse(); w
    };
    // bucket by o5 part
    let mut buckets: HashMap<[u8; 12], Vec<u32>> = HashMap::new();
    for (i, n) in nodes.iter().enumerate() {
        let mut k = [0u8; 12]; k.copy_from_slice(&n.0[12..24]);
        buckets.entry(k).or_default().push(i as u32);
    }
    // best kernel word per h (o2 part), as (len, a, b)
    let mut best: HashMap<[u8; 12], (usize, u32, u32)> = HashMap::new();
    let mut len_of = vec![0usize; nodes.len()];
    for i in 1..nodes.len() { len_of[i] = len_of[nodes[i].1 as usize] + 1; }
    for (_k, v) in buckets.iter() {
        if v.len() < 2 { continue; }
        for ai in 0..v.len() { for bi in 0..v.len() {
            if ai == bi { continue; }
            let (a, b) = (v[ai], v[bi]);
            let h = compose(&nodes[a as usize].0, &inv(&nodes[b as usize].0));
            let mut hk = [0u8; 12]; hk.copy_from_slice(&h[0..12]);
            let l = len_of[a as usize] + len_of[b as usize];
            let e = best.entry(hk).or_insert((usize::MAX, 0, 0));
            if l < e.0 { *e = (l, a, b); }
        } }
    }
    let idh: [u8; 12] = core::array::from_fn(|i| i as u8);
    println!("distinct o2 elements from direct collisions: {} ({:?})", best.len(), t0.elapsed());
    // materialize words
    let mut table: HashMap<[u8; 12], Vec<u8>> = HashMap::new(); // move idx sequence
    for (hk, (_l, a, b)) in best.iter() {
        if *hk == idh { continue; }
        let mut w = word(*a);
        for m in word(*b).into_iter().rev() { w.push(m ^ 1); }
        table.insert(*hk, w);
    }
    // closure via Dijkstra over 11520 nodes using direct entries as edges
    let target = 11520usize;
    let mut dist: HashMap<[u8; 12], (usize, Option<([u8; 12], [u8; 12])>)> = HashMap::new();
    dist.insert(idh, (0, None));
    let edges: Vec<([u8; 12], usize)> = table.iter().map(|(k, w)| (*k, w.len())).collect();
    let mut frontier: Vec<[u8; 12]> = vec![idh];
    // simple label-correcting
    let mut changed = true; let mut it = 0;
    let mut tmp = vec![];
    while changed && it < 40 {
        changed = false; it += 1;
        tmp.clear();
        for (hk, (dl, _)) in dist.iter() { tmp.push((*hk, *dl)); }
        for (hk, dl) in &tmp {
            for (ek, el) in &edges {
                // compose o2 parts: h' = hk ∘ ek (apply word_hk then word_edge)
                let mut o = [0u8; 12];
                for i in 0..12 { o[i] = hk[ek[i] as usize]; }
                let nl = dl + el;
                let ent = dist.get(&o);
                if ent.map_or(true, |(x, _)| nl < *x) { dist.insert(o, (nl, Some((*hk, *ek)))); changed = true; }
            }
        }
        println!("closure pass {}: {} elements / {}", it, dist.len(), target);
    }
    let lens: Vec<usize> = dist.values().map(|v| v.0).collect();
    println!("coverage {}/{}  max len {}  mean {:.1}", dist.len(), target, lens.iter().max().unwrap(), lens.iter().sum::<usize>() as f64 / lens.len() as f64);
    // reconstruct words
    fn build(h: &[u8;12], dist: &HashMap<[u8;12],(usize,Option<([u8;12],[u8;12])>)>, table: &HashMap<[u8;12],Vec<u8>>, out: &mut Vec<u8>) {
        match &dist[h].1 { None => {}, Some((prev, edge)) => { build(prev, dist, table, out); out.extend(table[edge].iter()); } }
    }
    let mut words: Vec<String> = vec![];
    let mut keys: Vec<&[u8;12]> = dist.keys().collect(); keys.sort();
    for k in keys {
        if *k == idh { continue; }
        let mut w = vec![]; build(k, &dist, &table, &mut w);
        // self-check: apply word to identity, o5 trivial and o2 == k
        let mut c = ident();
        for m in &w { c = compose(&c, &r[*m as usize]); }
        assert_eq!(&c[12..24], &ident()[12..24]); assert_eq!(&c[0..12], &k[..]);
        words.push(w.iter().map(|m| (b'0' + *m) as char).collect());
    }
    std::fs::write("kernel_words.json", format!("[{}]", words.iter().map(|w| format!("\"{}\"", w)).collect::<Vec<_>>().join(","))).unwrap();
    println!("wrote {} words", words.len());
    println!("total {:?}", t0.elapsed());
}
