/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_REDUCTION_FEASIBILITY_V1 -- Step 3: measure
 * the actual state-space reduction a validated face-0-stabilizer
 * canonicalization (see solveCrossSymmetryFeasibility.bench.test.ts's own
 * Step 1+2, which found 500/500 exact move-conjugation matches -- the
 * symmetry is a genuine automorphism) would give, via a JS-side reference
 * BFS mirroring wasm-search/src/lib.rs's own compute_edge_state_key exactly.
 *
 * Pure measurement: no production code path is touched. This is NOT a
 * candidate implementation -- it only answers "how many fewer unique
 * states would a canonicalized tree have to store, at a given round count,
 * for the residual/depth13-only/depth12-rescued groups."
 */
import { describe, it } from "vitest";
import { deriveSymmetryTable, applySymmetry } from "./solveCrossSymmetryFeasibility.bench.test";
import { applyMegaminxMove, applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
function scrambledStateFor(key: string): MegaminxState {
  const [tier, seedStr] = key.split("#");
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(Number(seedStr) * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

// FIRST_LAYER_EDGE_POSITIONS isn't exported from megaminxState.ts (it's derived
// in megaminxSolver.ts from FACE_VERTEX_INDICES[0]'s own edges) -- but Step 1's
// own harness already established face-0's edge set is exactly EDGES indices
// [0,1,2,3,4] (see its own "face-0 edges" log line), which is also what
// megaminxSolver.ts's sortedFirstLayerEdgePositions reduces to after sorting.
const TRACKED_PIECES = [0, 1, 2, 3, 4];

function computeEdgeStateKey(state: MegaminxState, pieces: readonly number[]): bigint {
  const n = pieces.length;
  const slotForPiece = new Array(30).fill(-1);
  for (let i = 0; i < n; i++) slotForPiece[pieces[i]] = i;
  const positions = new Array(n).fill(0);
  let remaining = n;
  for (let pos = 0; pos < 30 && remaining > 0; pos++) {
    const slot = slotForPiece[state.edgePerm[pos]];
    if (slot >= 0) {
      positions[slot] = pos;
      remaining--;
    }
  }
  let key = 0n;
  for (let i = 0; i < n; i++) key = key * 60n + BigInt(positions[i] * 2 + state.edgeOrient[positions[i]]);
  return key;
}

function canonicalKey(state: MegaminxState, pieces: readonly number[], sym: ReturnType<typeof deriveSymmetryTable>): bigint {
  let best = computeEdgeStateKey(state, pieces);
  let cur = state;
  for (let k = 0; k < 4; k++) {
    cur = applySymmetry(cur, sym);
    const key = computeEdgeStateKey(cur, pieces);
    if (key < best) best = key;
  }
  return best;
}

interface BfsResult {
  rawSizes: number[]; // cumulative unique raw-key count after each round
  canonicalSizes: number[]; // cumulative unique canonical-key count after each round
}

function runBfs(root: MegaminxState, maxRounds: number, sym: ReturnType<typeof deriveSymmetryTable>): BfsResult {
  const rawKeys = new Set<bigint>();
  const canonicalKeys = new Set<bigint>();
  rawKeys.add(computeEdgeStateKey(root, TRACKED_PIECES));
  canonicalKeys.add(canonicalKey(root, TRACKED_PIECES, sym));

  let frontier: MegaminxState[] = [root];
  const rawSizes: number[] = [];
  const canonicalSizes: number[] = [];
  for (let round = 0; round < maxRounds; round++) {
    const next: MegaminxState[] = [];
    for (const base of frontier) {
      for (let face = 0; face < 12; face++) {
        for (const sign of [1, -1] as const) {
          const child = applyMegaminxMove(base, face as never, sign);
          const k = computeEdgeStateKey(child, TRACKED_PIECES);
          if (rawKeys.has(k)) continue;
          rawKeys.add(k);
          canonicalKeys.add(canonicalKey(child, TRACKED_PIECES, sym));
          next.push(child);
        }
      }
    }
    frontier = next;
    rawSizes.push(rawKeys.size);
    canonicalSizes.push(canonicalKeys.size);
  }
  return { rawSizes, canonicalSizes };
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_REDUCTION_FEASIBILITY_V1: Step 3 -- measure canonical-vs-raw state reduction", () => {
  it("measures backward-tree (from SOLVED) reduction, scramble-independent", () => {
    const sym = deriveSymmetryTable();
    const t0 = performance.now();
    const result = runBfs(solvedMegaminxState(), 7, sym);
    console.log(`BACKWARD (from SOLVED), 7 rounds, ${(performance.now() - t0).toFixed(0)}ms:`);
    for (let r = 0; r < result.rawSizes.length; r++) {
      const raw = result.rawSizes[r];
      const canon = result.canonicalSizes[r];
      console.log(`  round ${r}: raw=${raw} canonical=${canon} ratio=${(raw / canon).toFixed(3)}x`);
    }
  }, 300_000);

  it("measures forward-tree reduction for representative fixtures from each group", () => {
    const sym = deriveSymmetryTable();
    const fixtures = {
      RESIDUAL: "normal#28",
      DEPTH13_ONLY: "hard#5",
      DEPTH12_RESCUED: "normal#13",
    };
    for (const [label, key] of Object.entries(fixtures)) {
      const scrambled = scrambledStateFor(key);
      const t0 = performance.now();
      const result = runBfs(scrambled, 6, sym);
      console.log(`\nFORWARD ${label} (${key}), 6 rounds, ${(performance.now() - t0).toFixed(0)}ms:`);
      for (let r = 0; r < result.rawSizes.length; r++) {
        const raw = result.rawSizes[r];
        const canon = result.canonicalSizes[r];
        console.log(`  round ${r}: raw=${raw} canonical=${canon} ratio=${(raw / canon).toFixed(3)}x`);
      }
    }
  }, 300_000);
});
