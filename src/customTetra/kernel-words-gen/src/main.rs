// Offline generator for ../data/tetraAxialKernelWords.json -- see README.md.
// usage: tetra-kernel-words <perms.txt> <depth> <out.json>
use std::collections::HashMap;

const MAXN: usize = 48;
type P = [u8; MAXN];

fn compose(a: &P, b: &P, n: usize) -> P {
    let mut o = [0u8; MAXN];
    for i in 0..n { o[i] = a[b[i] as usize]; }
    o
}
fn inv(a: &P, n: usize) -> P { let mut o = [0u8; MAXN]; for i in 0..n { o[a[i] as usize] = i as u8; } o }
fn ident(n: usize) -> P { let mut o = [0u8; MAXN]; for i in 0..n { o[i] = i as u8; } o }

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let txt = std::fs::read_to_string(&args[1]).unwrap();
    let depth: usize = args[2].parse().unwrap();
    let mut lines = txt.lines();
    let hdr: Vec<usize> = lines.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
    let (n, k, nm) = (hdr[0], hdr[1], hdr[2]);
    let mut r: Vec<P> = vec![];
    for _ in 0..nm {
        let mut p = [0u8; MAXN];
        for (i, v) in lines.next().unwrap().split_whitespace().enumerate() { p[i] = v.parse().unwrap(); }
        r.push(p);
    }
    for m in 0..nm { assert_eq!(compose(&r[m], &r[m ^ 1], n), ident(n), "move {} / {} are not inverses", m, m ^ 1); }

    // joint BFS from identity
    let mut nodes: Vec<(P, u32, u8)> = vec![(ident(n), u32::MAX, 0)];
    let mut seen: HashMap<P, u32> = HashMap::new();
    seen.insert(ident(n), 0);
    let (mut fs, mut fe) = (0usize, 1usize);
    for _ in 0..depth {
        for row in fs..fe {
            let c = nodes[row].0;
            for m in 0..nm {
                let nx = compose(&c, &r[m], n);
                if seen.contains_key(&nx) { continue; }
                seen.insert(nx, nodes.len() as u32);
                nodes.push((nx, row as u32, m as u8));
            }
        }
        fs = fe; fe = nodes.len();
    }
    eprintln!("joint states: {}", nodes.len());
    drop(seen);
    let mut len_of = vec![0usize; nodes.len()];
    for i in 1..nodes.len() { len_of[i] = len_of[nodes[i].1 as usize] + 1; }
    let word = |mut id: u32| -> Vec<u8> {
        let mut w = vec![];
        while nodes[id as usize].1 != u32::MAX { w.push(nodes[id as usize].2); id = nodes[id as usize].1; }
        w.reverse(); w
    };
    // bucket by main part (first k slots)
    let mut buckets: HashMap<Vec<u8>, Vec<u32>> = HashMap::new();
    for (i, nd) in nodes.iter().enumerate() { buckets.entry(nd.0[..k].to_vec()).or_default().push(i as u32); }
    let rest_of = |p: &P| -> Vec<u8> { p[k..n].iter().map(|v| v - k as u8).collect() };
    let mut best: HashMap<Vec<u8>, (usize, u32, u32)> = HashMap::new();
    for (_b, v) in buckets.iter() {
        if v.len() < 2 { continue; }
        for &a in v { for &b in v {
            if a == b { continue; }
            let h = compose(&nodes[a as usize].0, &inv(&nodes[b as usize].0, n), n);
            let l = len_of[a as usize] + len_of[b as usize];
            let e = best.entry(rest_of(&h)).or_insert((usize::MAX, 0, 0));
            if l < e.0 { *e = (l, a, b); }
        } }
    }
    let idh: Vec<u8> = (0..(n - k) as u8).collect();
    let mut table: HashMap<Vec<u8>, Vec<u8>> = HashMap::new();
    for (hk, (_l, a, b)) in best.iter() {
        if *hk == idh { continue; }
        let mut w = word(*a);
        for m in word(*b).into_iter().rev() { w.push(m ^ 1); }
        table.insert(hk.clone(), w);
    }
    // closure over compositions (label-correcting)
    let mut dist: HashMap<Vec<u8>, (usize, Option<(Vec<u8>, Vec<u8>)>)> = HashMap::new();
    dist.insert(idh.clone(), (0, None));
    let edges: Vec<(Vec<u8>, usize)> = table.iter().map(|(h, w)| (h.clone(), w.len())).collect();
    let mut changed = true;
    while changed {
        changed = false;
        let snap: Vec<(Vec<u8>, usize)> = dist.iter().map(|(h, v)| (h.clone(), v.0)).collect();
        for (hk, dl) in &snap { for (ek, el) in &edges {
            let o: Vec<u8> = (0..n - k).map(|i| hk[ek[i] as usize]).collect();
            let nl = dl + el;
            if dist.get(&o).map_or(true, |(x, _)| nl < *x) { dist.insert(o, (nl, Some((hk.clone(), ek.clone())))); changed = true; }
        } }
    }
    let lens: Vec<usize> = dist.values().map(|v| v.0).collect();
    eprintln!("kernel elements: {}  max len {}  mean {:.1}", dist.len(), lens.iter().max().unwrap(), lens.iter().sum::<usize>() as f64 / lens.len() as f64);
    fn build(h: &Vec<u8>, dist: &HashMap<Vec<u8>, (usize, Option<(Vec<u8>, Vec<u8>)>)>, table: &HashMap<Vec<u8>, Vec<u8>>, out: &mut Vec<u8>) {
        if let Some((prev, edge)) = &dist[h].1 { build(prev, dist, table, out); out.extend(table[edge].iter()); }
    }
    let mut keys: Vec<&Vec<u8>> = dist.keys().collect(); keys.sort();
    let mut words: Vec<String> = vec![];
    for kk in keys {
        if *kk == idh { continue; }
        let mut w = vec![]; build(kk, &dist, &table, &mut w);
        let mut c = ident(n);
        for m in &w { c = compose(&c, &r[*m as usize], n); }
        assert_eq!(&c[..k], &ident(n)[..k]);
        assert_eq!(rest_of(&c), *kk);
        words.push(w.iter().map(|m| (b'0' + *m) as char).collect());
    }
    std::fs::write(&args[3], format!("[{}]", words.iter().map(|w| format!("\"{}\"", w)).collect::<Vec<_>>().join(","))).unwrap();
    eprintln!("wrote {} words", words.len());
}
