import { describe, expect, it } from "vitest";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, mulberry32, randomLayerScramble } from "./cubeState";
import { deserializeCubies, serializeCubies } from "./cubieSerialization";
import { wrongCenterCount } from "./fourByFourCenters";
import { unpairedWingCount } from "./fourByFourEdges";
import { solveEdgesAndCentersStreaming, type PairingChunk } from "./fourByFourWorkerClient";

describe("4x4x4 edge + center solve (main-thread fallback path under Node)", () => {
  it("round-trips cubies through the plain-number serialization", () => {
    const cubies = buildSolvedCube(4);
    randomLayerScramble(cubies, 4, 25, mulberry32(7));
    const back = deserializeCubies(serializeCubies(cubies));
    expect(serializeCubies(back)).toEqual(serializeCubies(cubies));
  });

  it("pairs every edge and solves every center, leaving the input untouched", async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const cubies = buildSolvedCube(4);
      randomLayerScramble(cubies, 4, 25, mulberry32(seed * 313));
      const before = serializeCubies(cubies);
      const chunks: PairingChunk[] = [];
      await solveEdgesAndCentersStreaming(cubies, (c) => chunks.push(c));
      expect(serializeCubies(cubies)).toEqual(before);
      expect(chunks.map((c) => c.phase), `seed ${seed} phases`).toEqual(["edges", "centers"]);
      expect(chunks.every((c) => c.solved), `seed ${seed}`).toBe(true);
      const work = cloneCubies(cubies);
      for (const c of chunks) for (const [axis, layer, sign] of c.moves) applyRawQuarterTurn(work, axis, layer, sign);
      expect(unpairedWingCount(work), `seed ${seed} wings`).toBe(0);
      expect(wrongCenterCount(work), `seed ${seed} centers`).toBe(0);
    }
  }, 120_000);
});
