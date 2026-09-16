import { describe, expect, it } from "vitest";
import { ALL_ROYAL_MOVE_NAMES, applyRoyalMove } from "./royalPyraminxMoves";
import { createSolvedRoyalState, isSolvedRoyal, type RoyalPyraminxState } from "./royalPyraminxState";

function invertMoveName(move: string): string {
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

function applySequence(state: RoyalPyraminxState, moves: readonly string[]): RoyalPyraminxState {
  let cur = state;
  for (const m of moves) cur = applyRoyalMove(cur, m);
  return cur;
}

describe("royalPyraminxState / royalPyraminxMoves", () => {
  it("createSolvedRoyalState is solved", () => {
    expect(isSolvedRoyal(createSolvedRoyalState())).toBe(true);
  });

  it("exposes exactly 40 moves (4 axes x 5 depths x 2 directions)", () => {
    expect(ALL_ROYAL_MOVE_NAMES.length).toBe(40);
  });

  it.each(ALL_ROYAL_MOVE_NAMES)("move^3 == identity for %s", (move) => {
    const state = applySequence(createSolvedRoyalState(), [move, move, move]);
    expect(isSolvedRoyal(state)).toBe(true);
  });

  it.each(ALL_ROYAL_MOVE_NAMES)("move followed by its inverse == identity for %s", (move) => {
    const state = applySequence(createSolvedRoyalState(), [move, invertMoveName(move)]);
    expect(isSolvedRoyal(state)).toBe(true);
  });

  it("a mixed scramble is undone by its reversed, inverted move sequence", () => {
    const scramble = ["U", "Lw", "3Rw'", "4Bw", "r'", "L", "Uw'", "B"];
    const scrambled = applySequence(createSolvedRoyalState(), scramble);
    expect(isSolvedRoyal(scrambled)).toBe(false);
    const undo = scramble.slice().reverse().map(invertMoveName);
    const restored = applySequence(scrambled, undo);
    expect(isSolvedRoyal(restored)).toBe(true);
  });

  it("applyRoyalMove does not mutate its input state", () => {
    const solved = createSolvedRoyalState();
    const before = { ...solved, tips: solved.tips.slice() };
    applyRoyalMove(solved, "U");
    expect(solved.tips).toEqual(before.tips);
  });

  it("throws on an unknown move name", () => {
    expect(() => applyRoyalMove(createSolvedRoyalState(), "Q")).toThrow();
  });
});
