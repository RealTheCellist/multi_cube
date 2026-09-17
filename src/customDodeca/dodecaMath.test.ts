import { describe, expect, it } from "vitest";
import { depthFromFace, FACE_VERTEX_INDICES, nearestFaceIndex, VERTICES } from "./dodecaMath";

describe("dodecaMath geometry", () => {
  it("has 20 vertices and 12 faces", () => {
    expect(VERTICES.length).toBe(20);
    expect(FACE_VERTEX_INDICES.length).toBe(12);
  });

  it("depthFromFace is 0 at that face's own vertices, for any layerCount", () => {
    for (let f = 0; f < 12; f++) {
      for (const vi of FACE_VERTEX_INDICES[f]) {
        for (const n of [2, 3, 4, 5]) expect(depthFromFace(VERTICES[vi], f, n)).toBe(0);
      }
    }
  });

  it("depthFromFace of the antipodal face's own vertices equals layerCount", () => {
    // face 10 is antipodal to face 0 (verified via normal dot == -1 during derivation).
    for (const vi of FACE_VERTEX_INDICES[10]) {
      for (const n of [2, 3, 4, 5]) expect(depthFromFace(VERTICES[vi], 0, n)).toBe(n);
    }
  });

  it("nearestFaceIndex of a shared vertex returns one of the (exactly 3) faces that vertex belongs to", () => {
    for (let f = 0; f < 12; f++) {
      const vi = FACE_VERTEX_INDICES[f][0];
      const facesOfVertex = FACE_VERTEX_INDICES.map((m, i) => (m.includes(vi) ? i : -1)).filter((i) => i >= 0);
      expect(facesOfVertex.length).toBe(3);
      expect(facesOfVertex).toContain(nearestFaceIndex(VERTICES[vi]));
    }
  });
});
