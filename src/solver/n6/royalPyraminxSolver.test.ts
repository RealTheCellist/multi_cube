import { describe, expect, it } from "vitest";
import { ALL_ROYAL_MOVE_NAMES, applyRoyalMove } from "./royalPyraminxMoves";
import { createSolvedRoyalState, isSolvedRoyal, type RoyalPyraminxState } from "./royalPyraminxState";
import { solveRoyalAxialOnly, solveRoyalAxialOnlyFast, solveRoyalAxialOnlyWasm, solveRoyalBaseline, solveRoyalPyraminx } from "./royalPyraminxSolver";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function randomScramble(len: number, rng: () => number): string[] {
  const moves: string[] = [];
  let last = "";
  for (let i = 0; i < len; i++) {
    let m: string;
    do {
      m = ALL_ROYAL_MOVE_NAMES[Math.floor(rng() * ALL_ROYAL_MOVE_NAMES.length)];
    } while (m === last);
    last = m;
    moves.push(m);
  }
  return moves;
}

function scrambledState(seed: number, len: number): RoyalPyraminxState {
  const rng = mulberry32(seed);
  let state = createSolvedRoyalState();
  for (const m of randomScramble(len, rng)) state = applyRoyalMove(state, m);
  return state;
}

function applyAll(state: RoyalPyraminxState, moves: readonly string[]): RoyalPyraminxState {
  let cur = state;
  for (const m of moves) cur = applyRoyalMove(cur, m);
  return cur;
}

describe("solveRoyalBaseline (undecomposed, small scrambles only)", () => {
  it("solves a short (6-move) scramble", () => {
    const state = scrambledState(1, 6);
    const solution = solveRoyalBaseline(state, 6, 4_000_000);
    expect(solution).not.toBeNull();
    const solved = applyAll(state, solution!);
    expect(solved.tips.every((v, i) => v === i)).toBe(true);
    expect(solved.axial.every((v, i) => v === i)).toBe(true);
    expect(solved.edges.every((v, i) => v === i)).toBe(true);
    expect(solved.centers.every((v, i) => v === i)).toBe(true);
  });
});

describe("solveRoyalAxialOnly / solveRoyalAxialOnlyFast agree and are correct", () => {
  const seeds = [1, 2, 3, 4, 5];

  it.each(seeds)("solve and cross-check a 12-move scramble, seed %d", (seed) => {
    const state = scrambledState(seed, 12);
    const slow = solveRoyalAxialOnly(state.axial, 8, 4_000_000);
    const fast = solveRoyalAxialOnlyFast(state.axial, 8, 4_000_000);
    expect(!!slow).toBe(!!fast);
    if (slow) {
      const check = applyAll(state, slow);
      expect(check.axial.every((v, i) => v === i)).toBe(true);
    }
    if (fast) {
      const check = applyAll(state, fast);
      expect(check.axial.every((v, i) => v === i)).toBe(true);
    }
  });

  it("returns [] when axial is already solved", () => {
    const solved = createSolvedRoyalState();
    expect(solveRoyalAxialOnly(solved.axial, 4, 1000)).toEqual([]);
    expect(solveRoyalAxialOnlyFast(solved.axial, 4, 1000)).toEqual([]);
  });

  it(
    "returns null when the budget is exhausted before finding a solution",
    () => {
      const state = scrambledState(651, 25); // known-hard case from this session's own investigation
      expect(solveRoyalAxialOnlyFast(state.axial, 8, 4_000_000)).toBeNull();
    },
    30_000,
  );
});

describe("solveRoyalAxialOnlyWasm", () => {
  it("falls back to the JS search when wasm can't be fetched (Node/Vitest has no relative-URL fetch)", async () => {
    const state = scrambledState(1, 8);
    const solution = await solveRoyalAxialOnlyWasm(state.axial, 8, 4_000_000);
    expect(solution).not.toBeNull();
    const check = applyAll(state, solution!);
    expect(check.axial.every((v, i) => v === i)).toBe(true);
  });
});

describe("solveRoyalPyraminx (full pipeline: axial search-or-fallback -> tips -> edges -> centers)", () => {
  it("solves ordinary scrambles (axial search succeeds within budget)", async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = scrambledState(seed, 12);
      const moves = await solveRoyalPyraminx(state, 8, 4_000_000);
      const after = applyAll(state, moves);
      expect(isSolvedRoyal(after), `seed ${seed}`).toBe(true);
    }
  }, 30_000);

  it(
    "solves the 3 known-hard cases via the commutator fallback (tiny budget forces the axial search to fail first)",
    async () => {
      const cases = [
        { seed: 651, len: 25 },
        { seed: 700, len: 30 },
        { seed: 701, len: 30 },
      ];
      for (const c of cases) {
        const state = scrambledState(c.seed, c.len);
        const moves = await solveRoyalPyraminx(state, 8, 100_000);
        const after = applyAll(state, moves);
        expect(isSolvedRoyal(after), `seed ${c.seed}`).toBe(true);
      }
    },
    120_000,
  );
});
