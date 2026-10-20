# gigaminx-gen

Offline search behind `../gigaminxCycleSolver.ts` and `../data/gigaminxThreeCycles.json`.

The Gigaminx solver used to nest commutators of commutators to keep already-solved orbits fixed, which made its
building blocks 32 (inner corners), 128 (edge bridges) and 512 (center bridges) moves long: ~41,000 moves per solve.
This search finds the short ones directly.

`model.txt`: all 360 piece states of the Gigaminx (corner 20x3, wing 60x2, inner corner 60, edge bridge 60, center
bridge 60 -- ordered by orbit) and, for each of the 96 moves (`face * 8 + (depth - 1) * 2 + (sign == 1 ? 0 : 1)`; move
`m`'s inverse is `m ^ 1`), where every state goes. Dumped from `MOVE_TABLE` in `gigaminxState.ts`.

A commutator `[A, B] = A B A' B'` is a "stage m" building block if it leaves every state of the orbits below m
untouched and moves few states of orbit m (orbits above m may be disturbed: they are solved later, in order). Any
conjugate of such a block (`S [A, B] S'`) is again untouched on the lower orbits, so setups are unrestricted.

```
# A up to 2 moves, B = X S X' with X up to 2 moves (the forms that find 3-cycles), <=12 moved states,
# and write every distinct 3-cycle to cycles_all.txt (len, moved states, A, B):
cargo run --release -- model.txt 2 2 12 conj cycles_all.txt > out_all.txt    # ~4 min on 4 cores
```

Shortest pure 3-cycles found (moves): wings 8, edge bridges 8, inner corners 12, center bridges 12 (plus thousands of
longer ones). `data/gigaminxThreeCycles.json` keeps the shortest ones per orbit (`wg`, `ic`, `eb`, `cb`: pairs of
move-index lists `[A, B]`). Wings need no orientation handling: the 120 wing states form two orbits of 60 under a
group of order exactly 60!/2, i.e. a wing's orientation is locked to its position.

Result on 40 random 20-move scrambles: every solve completes, ~1,540 moves on average (corners 169, wings 274, inner
corners 429, edge bridges 306, center bridges 361) in ~220 ms, instead of ~41,000 moves in ~1.4 s.
