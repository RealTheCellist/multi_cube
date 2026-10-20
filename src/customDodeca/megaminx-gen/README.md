# megaminx-gen

Offline search behind `../megaminxCycleSolver.ts` and `../data/megaminxCommutators.json`.

The Megaminx (3 layers), the Master Kilominx (4 layers) and the Kilominx (2 layers, corners only) share one piece model
and one set of move tables (checked for equality): 20 corners x 3 orientations and 30 edges x 2 orientations, moved by
24 fifth turns. Corners and edges are independent (every move is an even permutation of each), so they can be solved
separately by sequences that change only one kind of piece.

`model.txt`: the 120 piece states (corner 20x3, then edge 30x2) and, for each of the 24 moves
(`face * 2 + (sign == 1 ? 0 : 1)`; move `m`'s inverse is `m ^ 1`), where every state goes. Dumped from `MOVE_TABLE`.

The program looks for commutators `[A, B] = A B A' B'` whose net effect is confined to ONE kind of piece and touches
only a few pieces (`B` is either a plain word or `X S X'` in `conj` mode). Shortest found: corners 8 moves (3 pieces),
14 (2 pieces: a pure twist pair), edges 12 (3 pieces).

```
cargo run --release -- model.txt 3 3 6 conj cycles_conj.txt > out_conj.txt   # ~10 min single-threaded
```

`data/megaminxCommutators.json` keeps the corner commutators with at most 3 pieces and at most 14 moves, and the edge ones
with at most 3 pieces and 18 moves (pairs of move-index lists `[A, B]`). `orientedCycleSolver.ts` turns them into macros
(conjugates by every single move, a macro for every ordered triple of positions, pure flips/twists for every pair) and
solves each orbit by greedy macro selection.

Result: 25 random Megaminx scrambles solve completely in ~350 moves on average (corners ~115, edges ~235) instead of
~740 with the layer-by-layer solver; the Kilominx needs ~115 instead of ~210.
