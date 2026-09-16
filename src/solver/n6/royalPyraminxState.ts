// N=6 (Royal Pyraminx) state representation -- a standalone module,
// independent of src/customTetra/ (N<=5's solver code) as requested, though
// its piece-orbit structure was DERIVED from (not copied out of, no import
// dependency) that module's already-validated N-layer tetrahedron geometry.
// See royalPyraminxMoves.ts's regeneration note for exactly how.
//
// The task spec this module was built from originally assumed 8 orbits
// (tips, corners, outerEdges, middleEdges, innerEdges, leftWings,
// rightWings, centralCenters). Deriving the real geometry first (rather
// than trusting those assumed counts) found only 4 actual orbits -- a
// Royal Pyraminx has no "corner" piece distinct from its tips, and neither
// its edges nor its centers split into 3 even sub-orbits the way the spec
// assumed:
//
//   tips:    4 pieces,  3 stickers each (orientation 0..2)
//   edges:  24 pieces,  2 stickers each (orientation 0..1)
//   axial:  60 pieces,  1 sticker each  (no orientation)
//   centers: 24 pieces, 1 sticker each  (no orientation)
//
// (N=5's edge search splits its edge orbit into "middle"/"outer" subsets,
// but that's a search-space optimization discovered via separate symmetry
// analysis, not a raw geometric orbit -- the same could be done for N=6's
// edges later if a solver needs it, but Phase 1 only models what's
// actually there.)

export const TIP_COUNT = 4;
export const EDGE_COUNT = 24;
export const AXIAL_COUNT = 60;
export const CENTER_COUNT = 24;

export interface RoyalPyraminxState {
  /** tips[slot] = index (0..3) of the piece currently at `slot`. */
  tips: Uint8Array;
  /** tipOri[slot] = that piece's orientation relative to `slot`'s canonical frame (0..2). */
  tipOri: Uint8Array;
  /** edges[slot] = index (0..23) of the piece currently at `slot`. */
  edges: Uint8Array;
  /** edgeOri[slot] = that piece's orientation relative to `slot`'s canonical frame (0..1). */
  edgeOri: Uint8Array;
  /** axial[slot] = index (0..59) of the single-sticker piece currently at `slot`. */
  axial: Uint8Array;
  /** centers[slot] = index (0..23) of the single-sticker piece currently at `slot`. */
  centers: Uint8Array;
}

export function createSolvedRoyalState(): RoyalPyraminxState {
  return {
    tips: Uint8Array.from({ length: TIP_COUNT }, (_, i) => i),
    tipOri: new Uint8Array(TIP_COUNT),
    edges: Uint8Array.from({ length: EDGE_COUNT }, (_, i) => i),
    edgeOri: new Uint8Array(EDGE_COUNT),
    axial: Uint8Array.from({ length: AXIAL_COUNT }, (_, i) => i),
    centers: Uint8Array.from({ length: CENTER_COUNT }, (_, i) => i),
  };
}

export function isSolvedRoyal(state: RoyalPyraminxState): boolean {
  const identity = (arr: Uint8Array) => arr.every((v, i) => v === i);
  const allZero = (arr: Uint8Array) => arr.every((v) => v === 0);
  return identity(state.tips) && allZero(state.tipOri) && identity(state.edges) && allZero(state.edgeOri) && identity(state.axial) && identity(state.centers);
}
