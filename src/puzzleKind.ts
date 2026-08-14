// The puzzle-identity key: what distinguishes a "3x3x3 cube" from a
// "3-layer tetrahedron" everywhere size/kind is used as a lookup or storage
// key (dailyMission.ts, leaderboard.ts). Plain `gridSize: number` alone
// can't do this -- a tetra layerCount of 3 would otherwise collide with the
// cube's 3x3x3 in every Record<number,...> lookup and every localStorage
// key.
export type PuzzleKind = "cube" | "tetra";

export interface PuzzleId {
  kind: PuzzleKind;
  size: number; // gridSize for cube (2-5), layerCount for tetra (only 3 exposed today)
}

export function puzzleKey(id: PuzzleId): string {
  return `${id.kind}-${id.size}`;
}

export function cubePuzzleId(size: number): PuzzleId {
  return { kind: "cube", size };
}

export function tetraPuzzleId(size: number): PuzzleId {
  return { kind: "tetra", size };
}
