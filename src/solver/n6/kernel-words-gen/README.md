# kernel-words-gen

Offline generator for `../data/royalOrbit2KernelWords.json` (N=6 Royal Pyraminx).

The 40 moves, restricted to axial orbit2+orbit5 (24 slots), generate the direct
product of orbit2's action (order 11,520) and orbit5's action (A12). This tool
finds, for every orbit2 arrangement, a short move word that leaves orbit5
untouched: a meet-in-the-middle over joint states (depth 6) pairs words whose
orbit5 parts coincide, then a closure pass fills any gaps. Result: 11,519
words, at most 10 moves each. Every word is self-checked before it is written.

- `perms.txt`: one line per move (`name` then 24 slot indices): the pull
  permutation of `applyRoyalMove(solved, move).axial` restricted to
  orbit2 slots (first 12) + orbit5 slots (last 12), in `ALL_ROYAL_MOVE_NAMES` order.
  Inverse moves are adjacent (index `m ^ 1`).
- Output chars encode a move index as `char code - 48`.

```
cargo run --release 6   # writes kernel_words.json (~30 s); copy it to ../data/royalOrbit2KernelWords.json
```
