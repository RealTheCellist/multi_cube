import { describe, expect, it } from "vitest";
import { applyRawFifthTurn, buildSolvedDodeca, generateRandomFifthTurns, isSolved, mulberry32, stickersForTurn } from "./dodecaState";

describe("buildSolvedDodeca sticker counts", () => {
  it("N=2 (Kilominx): 5 stickers/face, 60 total, no edges/center", () => {
    const s = buildSolvedDodeca(2);
    expect(s.stickers.length).toBe(60);
    expect(s.stickers.filter((x) => x.pieceType === "edge").length).toBe(0);
    expect(s.stickers.filter((x) => x.pieceType === "center").length).toBe(0);
  });

  it("N=3 (Megaminx): 11 stickers/face (5 corner + 5 edge + 1 center), 132 total", () => {
    const s = buildSolvedDodeca(3);
    expect(s.stickers.length).toBe(132);
    const perFace = s.stickers.filter((x) => x.homeFaceIndex === 0);
    expect(perFace.length).toBe(11);
    expect(perFace.filter((x) => x.pieceType === "corner").length).toBe(5);
    expect(perFace.filter((x) => x.pieceType === "edge").length).toBe(5);
    expect(perFace.filter((x) => x.pieceType === "center").length).toBe(1);
  });

  it("N=4 (Master Kilominx): 1 ring (10) + 10 closure wedges = 20/face, no center", () => {
    const s = buildSolvedDodeca(4);
    const perFace = s.stickers.filter((x) => x.homeFaceIndex === 0);
    expect(perFace.length).toBe(20);
    expect(perFace.filter((x) => x.pieceType === "center").length).toBe(0);
  });

  it("N=5 (Gigaminx): real 6-orbit structure = 31/face (matches cubing.js's own Gigaminx geometry), 372 total", () => {
    const s = buildSolvedDodeca(5);
    expect(s.stickers.length).toBe(372);
    const perFace = s.stickers.filter((x) => x.homeFaceIndex === 0);
    expect(perFace.length).toBe(31);
    // 5 CORNERS + 5 CENTERS (both rendered as pieceType "corner", since
    // both are 4-point kites, just at different ring depths) + 10 EDGES +
    // 5 EDGES2 + 5 CENTERS2 (all rendered as pieceType "edge", since all 3
    // are plain quads) + 1 CENTERS3 (pieceType "center").
    expect(perFace.filter((x) => x.pieceType === "corner").length).toBe(10);
    expect(perFace.filter((x) => x.pieceType === "edge").length).toBe(20);
    expect(perFace.filter((x) => x.pieceType === "center").length).toBe(1);
  });

  it("solved state reports isSolved() true for all sizes", () => {
    for (const n of [2, 3, 4, 5]) expect(isSolved(buildSolvedDodeca(n)), `N=${n}`).toBe(true);
  });
});

describe("applyRawFifthTurn", () => {
  it("5 applications of the same turn returns to solved (pentagon symmetry)", () => {
    for (const n of [2, 3, 4, 5]) {
      const s = buildSolvedDodeca(n);
      for (let i = 0; i < 5; i++) applyRawFifthTurn(s, 0, n - 1, 1);
      expect(isSolved(s), `N=${n}`).toBe(true);
    }
  });

  it("turn then inverse returns to solved", () => {
    for (const n of [2, 3, 4, 5]) {
      const s = buildSolvedDodeca(n);
      applyRawFifthTurn(s, 3, Math.max(1, n - 2), 1);
      applyRawFifthTurn(s, 3, Math.max(1, n - 2), -1);
      expect(isSolved(s), `N=${n}`).toBe(true);
    }
  });

  it("a scramble leaves the puzzle unsolved (sanity: turns actually move stickers)", () => {
    for (const n of [3, 4, 5]) {
      const s = buildSolvedDodeca(n);
      const rng = mulberry32(1);
      for (const t of generateRandomFifthTurns(n, 15, rng)) applyRawFifthTurn(s, t.faceIndex, t.depth, t.sign);
      expect(isSolved(s), `N=${n}`).toBe(false);
    }
  });
});

describe("stickersForTurn depth semantics", () => {
  // Faces sharing an edge with face 0, derived once during this module's
  // own geometry validation (see dodecaMath.ts's derivation script) --
  // fixed by the hardcoded FACE_VERTEX_INDICES table, not by any live state.
  const NEIGHBORS_OF_FACE_0 = new Set([1, 2, 5, 6, 9]);

  it("N=2: depth=1 turn on face 0 includes its own 5 stickers plus exactly the 2 per neighbor whose own apex vertex is shared with face 0 (15 total) -- real corner-piece-sharing behavior, like a Rubik's cube U turn dragging side facets along with it", () => {
    const s = buildSolvedDodeca(2);
    const turned = stickersForTurn(s, 0, 1);
    expect(turned.length).toBe(15);
    for (const t of turned) expect(t.homeFaceIndex === 0 || NEIGHBORS_OF_FACE_0.has(t.homeFaceIndex)).toBe(true);
  });

  it("depth=1 turn always includes every one of this face's own stickers", () => {
    for (const n of [2, 3, 4, 5]) {
      const s = buildSolvedDodeca(n);
      const turned = new Set(stickersForTurn(s, 0, 1).map((t) => t.id));
      for (const own of s.stickers.filter((x) => x.homeFaceIndex === 0)) expect(turned.has(own.id)).toBe(true);
    }
  });

  it("depth=1 turn never includes a sticker from a non-neighboring, non-home face", () => {
    for (const n of [2, 3, 4, 5]) {
      const s = buildSolvedDodeca(n);
      const turned = stickersForTurn(s, 0, 1);
      for (const t of turned) expect(t.homeFaceIndex === 0 || NEIGHBORS_OF_FACE_0.has(t.homeFaceIndex), `N=${n} home=${t.homeFaceIndex}`).toBe(true);
    }
  });

  it("increasing depth strictly increases how many stickers a turn includes", () => {
    for (const n of [3, 4, 5]) {
      const s = buildSolvedDodeca(n);
      let prev = 0;
      for (let d = 1; d <= n - 1; d++) {
        const size = stickersForTurn(s, 0, d).length;
        expect(size, `N=${n} depth=${d}`).toBeGreaterThan(prev);
        prev = size;
      }
    }
  });

  it("N=3's deepest turn (depth=2, the only other option) splits the puzzle exactly in half", () => {
    const s = buildSolvedDodeca(3);
    expect(stickersForTurn(s, 0, 2).length).toBe(s.stickers.length / 2);
  });
});
