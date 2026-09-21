import { describe, it, expect } from "vitest";
import { applyMegaminxMove, applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { FACE_INDICES } from "./dodecaMath";
import { buildReachableMapWasm } from "./megaminxSearchWasm";
import { mulberry32 } from "./dodecaState";

// Independent reference implementation (NOT importing megaminxSolver.ts's
// own private positionOnlyKeyFor/buildReachableMap) -- a plain JS BFS +
// base-30 key packing, written fresh here so a bug shared between the
// Rust port and the original JS wouldn't hide behind this check.
function refKeyFn(kind: "corner" | "edge", pieces: readonly number[]): (s: MegaminxState) => number {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: MegaminxState) => {
    const perm = kind === "corner" ? s.cornerPerm : s.edgePerm;
    const count = kind === "corner" ? 20 : 30;
    const positions = new Array<number>(sorted.length);
    let remaining = sorted.length;
    for (let pos = 0; pos < count && remaining > 0; pos++) {
      const idx = sorted.indexOf(perm[pos]);
      if (idx >= 0) {
        positions[idx] = pos;
        remaining--;
      }
    }
    let key = 0;
    for (const p of positions) key = key * 30 + p;
    return key;
  };
}

function refBuildReachable(state: MegaminxState, kind: "corner" | "edge", pieces: readonly number[], maxDepth: number, maxReachable = 300_000): Map<number, MegaminxTurn[]> {
  const keyFn = refKeyFn(kind, pieces);
  const reachable = new Map<number, MegaminxTurn[]>([[keyFn(state), []]]);
  let frontier: { state: MegaminxState; path: MegaminxTurn[] }[] = [{ state, path: [] }];
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && reachable.size < maxReachable; depth++) {
    const next: { state: MegaminxState; path: MegaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const face of FACE_INDICES) {
        for (const sign of [1, -1] as const) {
          const child = applyMegaminxMove(base, face, sign);
          const key = keyFn(child);
          if (reachable.has(key)) continue;
          if (reachable.size >= maxReachable) break;
          const childPath = [...path, { face, sign }];
          reachable.set(key, childPath);
          next.push({ state: child, path: childPath });
        }
      }
    }
    frontier = next;
  }
  return reachable;
}

describe("megaminxSearchWasm buildReachableMapWasm", () => {
  it("matches the independent JS reference BFS's own key set, for several scrambled states and piece sets", () => {
    const cases: { kind: "corner" | "edge"; pieces: number[]; maxDepth: number }[] = [
      { kind: "corner", pieces: [3], maxDepth: 6 },
      { kind: "corner", pieces: [3, 11], maxDepth: 7 },
      { kind: "edge", pieces: [5], maxDepth: 6 },
      { kind: "edge", pieces: [5, 17], maxDepth: 7 },
      { kind: "corner", pieces: [0, 4, 8], maxDepth: 5 },
      { kind: "edge", pieces: [1, 9, 20], maxDepth: 5 },
    ];

    for (let seed = 1; seed <= 5; seed++) {
      const scramble = randomMegaminxScramble(20, mulberry32(seed));
      const state = applyMegaminxScramble(solvedMegaminxState(), scramble);

      for (const { kind, pieces, maxDepth } of cases) {
        const ref = refBuildReachable(state, kind, pieces, maxDepth);
        const wasmKind = kind === "corner" ? 0 : 1;
        const wasm = buildReachableMapWasm(state, wasmKind, pieces, maxDepth);

        for (const key of ref.keys()) {
          expect(wasm.has(key), `seed=${seed} kind=${kind} pieces=${pieces} maxDepth=${maxDepth} missing key=${key}`).toBe(true);
        }

        for (const key of ref.keys()) {
          const wasmPath = wasm.get(key)!;
          let s = state;
          for (const t of wasmPath) s = applyMegaminxMove(s, t.face, t.sign);
          const actualKey = refKeyFn(kind, pieces)(s);
          expect(actualKey, `seed=${seed} kind=${kind} pieces=${pieces} key=${key} wasm path replay landed on wrong key`).toBe(key);
        }
      }
    }
  }, 120000);
});
