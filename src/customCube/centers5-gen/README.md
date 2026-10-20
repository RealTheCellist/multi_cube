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
cargo run --release -- model.txt 3 > out3.txt   # ~20 s
```

`../data/fiveByFiveCommutators.json` (`X`, `T`) holds every commutator this search found at the shortest lengths
(X up to 10 quarter turns, T 12): `fiveByFiveCentersCommutator.ts` uses them all as sources of a multi-source search
(`threeCycleTools.ts`), which keeps the conjugating setup words to 0-2 moves.
