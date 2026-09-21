import { describe, expect, it } from "vitest";
import { solvedMegaminxState } from "./megaminxState";
import { solveLastLayer } from "./megaminxSolver";

// See megaminxSolverCross.test.ts's own dev notes on why each phase now
// lives in its own file.
describe("solveLastLayer (Phase 3b+3c: bottom corners + bottom edges)", () => {
  // Same alternating technique as solveMiddleLayer, for the same reason:
  // exhaustively confirmed there is NO commutator at this module's search
  // depth whose support avoids all 20 corners while touching only the
  // last layer's own edges, so the edge step must run with the bottom
  // corners temporarily unfixed, then the corner step re-run to restore
  // them, ping-ponging until both hold at once. Full 10-seed, all-phases
  // coverage of this exact code path lives in solveMegaminx's own test
  // (its public entry point runs through this phase last), so this
  // describe block only covers solveLastLayer's own edge case.
  it("returns an empty solution when the last layer is already solved", () => {
    expect(solveLastLayer(solvedMegaminxState())).toEqual([]);
  });
});
