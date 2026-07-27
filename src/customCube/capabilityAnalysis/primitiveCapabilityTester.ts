// --- PrimitiveCapabilityTester (Capability Analysis Engine v1) --------------
// Actually re-runs each of the 5 named primitives against a SCRATCH CLONE
// of a real captured cube state ("가상 적용" -- virtual application, spec
// section 3), never the real snapshot, and measures genuine before/after
// state rather than mining a trace log the way the Primitive Discovery
// Engine had to (that approach was already shown, in this session's own
// prior report, to conflate "succeeded somewhere in the whole plan" with
// "succeeded on THIS residual" -- calling the actual functions directly
// here avoids that class of mistake entirely).
//
// Every function called (tryFixWing/tryFlipWingsInPlace/tryExactCaseMatch/
// bestFixOverall/tryEndgameMultiPly from fiveByFiveEdges.ts, attemptRecovery
// from fiveByFiveEdgeRecovery.ts) is an EXISTING public export, called
// read-only exactly like every other module in this whole research-engine
// series -- none of the 4 protected files are modified.
import { cloneCubies, type Cubie } from "../cubeState";
import {
  applySeq,
  bestFixOverall,
  tryEndgameMultiPly,
  tryExactCaseMatch,
  tryFixWing,
  tryFlipWingsInPlace,
  wrongWingCount5,
  wrongWings5,
  type Move,
} from "../fiveByFiveEdges";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { buildStateGraph } from "./stateGraphBuilder";
import { analyzeConstraints } from "./constraintAnalyzer";
import type { CapabilityPrimitiveName, PrimitiveTestResult } from "./capabilityTypes";

// Generous relative to what these primitives practically get inside a real
// solve() call (often ~16-120ms, see this session's own Adaptive Executor
// v2 findings) -- a capability TEST should give each primitive a fair
// chance to prove what it CAN do, not reproduce production's own time
// starvation.
export const TEST_DEADLINE_MS = 400;

// Mutates `clone` in place and returns the applied moves (matching the
// same contract every existing pipeline function in this codebase uses --
// e.g. fiveByFiveEdgeExecutor.ts's runPrimaryPipeline) rather than just
// returning a candidate fix, since this doubles as the `retryTask` callback
// attemptRecovery expects to have already mutated its `working` argument
// when it returns a non-empty Move[].
function tryBaseApplied(clone: Cubie[], lib: ExecutorLibraries["lib"], deadline: number): Move[] {
  for (const w of wrongWings5(clone)) {
    const fix = tryFixWing(clone, w, lib, deadline);
    if (fix && fix.length > 0) {
      applySeq(clone, fix);
      return fix;
    }
  }
  return [];
}

export function testPrimitiveCapability(
  cubies: readonly Cubie[],
  primitive: CapabilityPrimitiveName,
  libs: ExecutorLibraries,
  deadlineMs: number = TEST_DEADLINE_MS
): PrimitiveTestResult {
  const wrongWingBefore = wrongWingCount5(cubies as Cubie[]);
  const graphBefore = analyzeConstraints(buildStateGraph(cubies as Cubie[]));

  const clone = cloneCubies(cubies as Cubie[]);
  const deadline = Date.now() + deadlineMs;
  const wrongCountAtStart = wrongWings5(clone).length;
  let applicable = wrongCountAtStart > 0;
  // Two different contracts converge here: BASE/RECOVERY already mutate
  // `clone` themselves and return the moves they applied (matching this
  // codebase's "pipeline function" convention), while FLIP/CASE/PARITY
  // return an unapplied CANDIDATE the caller must apply (matching
  // tryFlipWingsInPlace/tryExactCaseMatch/bestFixOverall's own convention)
  // -- `moves` always ends up applied to `clone` either way, but only ONE
  // applySeq call ever happens per branch.
  let moves: Move[] | null = null;

  if (primitive === "BASE") {
    const applied = tryBaseApplied(clone, libs.lib, deadline);
    moves = applied.length > 0 ? applied : null;
  } else if (primitive === "FLIP") {
    for (const w of wrongWings5(clone)) {
      const fix = tryFlipWingsInPlace(clone, w, libs.flipLib, wrongWingCount5(clone));
      if (fix && fix.length > 0) {
        moves = fix;
        break;
      }
    }
    if (moves) applySeq(clone, moves);
  } else if (primitive === "CASE") {
    applicable = true; // a direct lookup -- always worth trying regardless of wrong-wing count
    moves = tryExactCaseMatch(clone, libs.caseLib, deadline);
    if (moves && moves.length > 0) applySeq(clone, moves);
  } else if (primitive === "PARITY") {
    applicable = true;
    moves = bestFixOverall(clone, libs.lib, libs.flipLib, deadline);
    if (!moves || moves.length === 0) moves = tryEndgameMultiPly(clone, libs.lib, libs.flipLib, deadline);
    if (moves && moves.length > 0) applySeq(clone, moves);
  } else if (primitive === "RECOVERY") {
    applicable = true;
    const recoveryMoves = attemptRecovery(clone, libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, (working, taskDeadline) =>
      tryBaseApplied(working, libs.lib, taskDeadline)
    );
    moves = recoveryMoves.length > 0 ? recoveryMoves : null;
  }

  const succeeded = !!(moves && moves.length > 0);
  const wrongWingAfter = wrongWingCount5(clone);
  const graphAfter = analyzeConstraints(buildStateGraph(clone));

  return {
    primitive,
    applicable,
    succeeded,
    wrongWingBefore,
    wrongWingAfter,
    conflictBefore: graphBefore.conflictCount,
    conflictAfter: graphAfter.conflictCount,
    cycleBefore: graphBefore.cycleCount,
    cycleAfter: graphAfter.cycleCount,
  };
}

const ALL_PRIMITIVES: CapabilityPrimitiveName[] = ["BASE", "FLIP", "CASE", "PARITY", "RECOVERY"];

export function testAllCapabilities(
  cubies: readonly Cubie[],
  libs: ExecutorLibraries,
  deadlineMs: number = TEST_DEADLINE_MS
): PrimitiveTestResult[] {
  return ALL_PRIMITIVES.map((p) => testPrimitiveCapability(cubies, p, libs, deadlineMs));
}
