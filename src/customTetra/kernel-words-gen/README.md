# kernel-words-gen (Master/Professor Pyraminx axial)

Offline generator for `../data/tetraAxialKernelWords.json`, used by
`../tetraAxialDecomposed.ts`.

For N=4/5 the axial group is (action on one 12-slot orbit) x (small group on
the remaining axial slots: order 81 for N=4, 972 for N=5). The solver searches
the 12-slot orbit directly and fixes the rest with one "kernel word": a short
move sequence that leaves that orbit untouched and realises any element of the
small group. This tool finds those words by a meet-in-the-middle over joint
states (words whose main-orbit parts coincide, combined as `a * b^-1`), then
closes the set under composition. Each word is self-checked.

- `perms_n4.txt`, `perms_n5.txt`: header `n k nm` (slots, main-orbit size,
  moves), then one line per move (same order as `pre.allMoves`; inverse moves
  are adjacent): the pull permutation over slots ordered `[main | rest]`, as
  produced by `axialSplit()` in `tetraAxialDecomposed.ts`.
- Word characters encode a move index as `char code - 48`.

```
cargo run --release -- perms_n5.txt 6 kernel_words_5.json   # ~15 s
```
Merge both outputs into `{"4": [...], "5": [...]}`.
