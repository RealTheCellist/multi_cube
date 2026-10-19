# wings5-gen

Offline search behind `../fiveByFiveWings.ts` (5x5x5 wing pairing by pure wing 3-cycles).

`model.txt`: all 150 stickers of a 5x5x5 (flag `W` marks the 48 wing stickers) and the sticker
permutation of each of the 24 usable quarter turns (layers -2,-1,1,2 of x/y/z, sign +1 then -1;
move `m`'s inverse is `m ^ 1`), dumped from `buildSolvedCube(5)` in the same move order as
`WING_MOVES` in the TypeScript.

The program enumerates move words up to the given lengths and keeps every commutator `A B A' B'`
that leaves all non-wing stickers untouched and moves exactly three wings. Shortest: 8 quarter turns,
`A=[16]`, `B=[13,23,12]` -- the constant in `COMMUTATOR`.

```
cargo run --release -- model.txt 3 3 > out33.txt   # a few seconds
```
