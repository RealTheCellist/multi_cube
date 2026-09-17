import { describe, expect, it } from "vitest";
import { ALL_ROYAL_MOVE_NAMES, applyRoyalMove } from "./royalPyraminxMoves";
import { CENTER_COMM_1, EDGE_COMM_1, solveCentersByCommutator, solveEdgesByCommutator, solveTips } from "./royalPyraminxCommutators";
import { createSolvedRoyalState, isSolvedRoyal, type RoyalPyraminxState } from "./royalPyraminxState";

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

describe("base commutators are pure (self-check against the real engine)", () => {
  it("EDGE_COMM_1 only touches edges, is order 3", () => {
    const solved = createSolvedRoyalState();
    const once = applyAll(solved, EDGE_COMM_1.comm);
    expect(once.tips.every((v, i) => v === i)).toBe(true);
    expect(once.axial.every((v, i) => v === i)).toBe(true);
    expect(once.centers.every((v, i) => v === i)).toBe(true);
    expect(once.edges.every((v, i) => v === i)).toBe(false);
    const thrice = applyAll(applyAll(once, EDGE_COMM_1.comm), EDGE_COMM_1.comm);
    expect(isSolvedRoyal(thrice)).toBe(true);
  });

  it("CENTER_COMM_1 only touches centers, is order 3", () => {
    const solved = createSolvedRoyalState();
    const once = applyAll(solved, CENTER_COMM_1.comm);
    expect(once.tips.every((v, i) => v === i)).toBe(true);
    expect(once.axial.every((v, i) => v === i)).toBe(true);
    expect(once.edges.every((v, i) => v === i)).toBe(true);
    expect(once.edgeOri.every((v) => v === 0)).toBe(true);
    expect(once.centers.every((v, i) => v === i)).toBe(false);
    const thrice = applyAll(applyAll(once, CENTER_COMM_1.comm), CENTER_COMM_1.comm);
    expect(isSolvedRoyal(thrice)).toBe(true);
  });
});

describe("solveTips", () => {
  it("solves tips from various scrambles without needing edges/axial/centers to be solved", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = scrambledState(seed, 15);
      const { state: after } = solveTips(state);
      expect(after.tips.every((v, i) => v === i)).toBe(true);
      expect(after.tipOri.every((v) => v === 0)).toBe(true);
    }
  });
});

describe("solveEdgesByCommutator", () => {
  it("solves edges (position + orientation) without disturbing tips/axial/centers, across many scrambles", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const state = scrambledState(seed, 25);
      const before = { tips: state.tips.slice(), tipOri: state.tipOri.slice(), axial: state.axial.slice(), centers: state.centers.slice() };
      const { moves, state: after } = solveEdgesByCommutator(state);
      expect(after.edges.every((v, i) => v === i)).toBe(true);
      expect(after.edgeOri.every((v) => v === 0)).toBe(true);
      expect(after.tips).toEqual(before.tips);
      expect(after.tipOri).toEqual(before.tipOri);
      expect(after.axial).toEqual(before.axial);
      expect(after.centers).toEqual(before.centers);
      // cross-check: replaying the returned move list from the original
      // scrambled state reaches the same solved-edges result.
      const replay = applyAll(state, moves);
      expect(replay.edges).toEqual(after.edges);
      expect(replay.edgeOri).toEqual(after.edgeOri);
    }
  });

  it("is a no-op when edges are already solved", () => {
    const solved = createSolvedRoyalState();
    const { moves, state: after } = solveEdgesByCommutator(solved);
    expect(moves).toEqual([]);
    expect(isSolvedRoyal(after)).toBe(true);
  });
});

describe("solveCentersByCommutator", () => {
  it("solves centers without disturbing tips/axial/edges, across many scrambles", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const state = scrambledState(seed, 25);
      const before = { tips: state.tips.slice(), tipOri: state.tipOri.slice(), axial: state.axial.slice(), edges: state.edges.slice(), edgeOri: state.edgeOri.slice() };
      const { moves, state: after } = solveCentersByCommutator(state);
      expect(after.centers.every((v, i) => v === i)).toBe(true);
      expect(after.tips).toEqual(before.tips);
      expect(after.tipOri).toEqual(before.tipOri);
      expect(after.axial).toEqual(before.axial);
      expect(after.edges).toEqual(before.edges);
      expect(after.edgeOri).toEqual(before.edgeOri);
      const replay = applyAll(state, moves);
      expect(replay.centers).toEqual(after.centers);
    }
  });

  it("is a no-op when centers are already solved", () => {
    const solved = createSolvedRoyalState();
    const { moves, state: after } = solveCentersByCommutator(solved);
    expect(moves).toEqual([]);
    expect(isSolvedRoyal(after)).toBe(true);
  });
});

describe("full pipeline: tips -> edges -> centers (axial assumed already solved)", () => {
  it("fully solves a scramble whose axial happens to already be identity-compatible by chaining all three stages", () => {
    // Use a scramble, solve tips first (order doesn't matter for
    // correctness since each stage only cares about its own orbit), then
    // edges, then centers -- axial is left as whatever the scramble left
    // it at (this test only exercises the 3 commutator-based stages, not
    // the axial search itself, which is already covered by
    // royalPyraminxSolver.test.ts).
    for (const seed of [11, 12, 13]) {
      const state = scrambledState(seed, 30);
      const afterTips = solveTips(state).state;
      const afterEdges = solveEdgesByCommutator(afterTips).state;
      const afterCenters = solveCentersByCommutator(afterEdges).state;
      expect(afterCenters.tips.every((v, i) => v === i)).toBe(true);
      expect(afterCenters.tipOri.every((v) => v === 0)).toBe(true);
      expect(afterCenters.edges.every((v, i) => v === i)).toBe(true);
      expect(afterCenters.edgeOri.every((v) => v === 0)).toBe(true);
      expect(afterCenters.centers.every((v, i) => v === i)).toBe(true);
      // axial untouched by any of the 3 stages
      expect(afterCenters.axial).toEqual(state.axial);
    }
  });
});
