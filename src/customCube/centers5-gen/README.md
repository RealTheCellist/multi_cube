# centers5-gen

Offline search behind `../fiveByFiveCentersCommutator.ts` (5x5x5 X/T-centers by 3-cycle commutators).

`model.txt`: the 48 movable center slots (X or T) and the position permutation of each of the
24 usable quarter turns (layers -2,-1,1,2 of x/y/z, sign +1 then -1; move `m`'s inverse is `m ^ 1`),
dumped from `buildSolvedCube(5)` in the same move order the TypeScript uses.

The program enumerates move words up to length 3 and keeps, for every pair (A, B), those
commutators `A B A' B'` whose net effect is a pure 3-cycle inside the X-centers or inside the
T-centers (nothing else moves). Shortest results: X = 8 quarter turns (`A=[14]`, `B=[20,13,21]`),
T = 12 (`A=[2,8,3]`, `B=[4,19,5]`) -- the two constants in `COMMUTATORS`.

```
cargo run --release -- model.txt 3 > out3.txt        # words up to 3 moves each side, ~20 s
cargo run --release -- model.txt 2 4 > out24.txt     # A up to 2, B up to 4 moves (finds 10-move T commutators), ~10 s
```

`../data/fiveByFiveCommutators.json` (`X`, `T`) holds every commutator this search found at the shortest lengths
(X up to 10 quarter turns, T 12): `fiveByFiveCentersCommutator.ts` uses them all as sources of a multi-source search
(`threeCycleTools.ts`), which keeps the conjugating setup words to 0-2 moves.

Longer commutators (T at 10 and 14, X up to 12; wings5-gen up to 14) were tried as extra sources: they cut the
mean pairing plan only from ~299 to ~283 moves while tripling the first-call setup time, so the data file keeps
the shorter set. A 3-cycle moves three pieces, which puts the floor for this approach near 280 moves; going
lower needs macros that move several 3-cycles at once.
