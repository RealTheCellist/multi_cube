// Shared drive loop for isolating a raw BFS/fix-function change from the
// full Planner/Executor/Recovery pipeline -- deliberately bypasses all
// three (this Sprint forbids modifying them, and comparing a candidate
// fix-function fairly means holding everything else constant, including
// NOT going through Planner's task ordering). Deterministic on purpose (no
// shuffling -- iterates wrong wings sorted by id) so this satisfies the
// framework's own determinism check without needing a seeded RNG hook the
// EdgeExperiment interface doesn't provide.
import { applySeq, buildFlipLibrary, buildWingLibrary, tryFlipWingsInPlace, wrongWingCount5, wrongWings5 } from "../../fiveByFiveEdges";
import type { Cubie, Move, WingLibrary } from "../../fiveByFiveEdges";
import { analyzeEdgeSlots } from "../../fiveByFiveHumanEdges";

let cachedLib: WingLibrary | null = null;
let cachedFlipLib: Map<string, Move[]> | null = null;
function libs(): { lib: WingLibrary; flipLib: Map<string, Move[]> } {
  if (!cachedLib) cachedLib = buildWingLibrary();
  if (!cachedFlipLib) cachedFlipLib = buildFlipLibrary();
  return { lib: cachedLib, flipLib: cachedFlipLib };
}

export function pairCountOf(cubies: Cubie[]): number {
  return analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length;
}

export function driveFixLoop(
  cubies: Cubie[],
  deadlineMs: number,
  fixFn: (cubies: Cubie[], w: Cubie, lib: WingLibrary, deadline: number) => Move[] | null
): { moveCount: number } {
  const { lib, flipLib } = libs();
  const deadline = Date.now() + deadlineMs;
  let moveCount = 0;

  while (wrongWingCount5(cubies) > 0 && Date.now() < deadline) {
    let progressed = false;
    const wrong = [...wrongWings5(cubies)].sort((a, b) => a.id - b.id);
    for (const w of wrong) {
      if (Date.now() > deadline) break;
      const flipFix = tryFlipWingsInPlace(cubies, w, flipLib, wrongWingCount5(cubies));
      if (flipFix && flipFix.length > 0) {
        applySeq(cubies, flipFix);
        moveCount += flipFix.length;
        progressed = true;
        break;
      }
      const fix = fixFn(cubies, w, lib, deadline);
      if (fix && fix.length > 0) {
        applySeq(cubies, fix);
        moveCount += fix.length;
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }

  return { moveCount };
}
