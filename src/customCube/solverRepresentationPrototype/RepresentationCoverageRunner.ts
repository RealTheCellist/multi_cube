// --- RepresentationCoverageRunner (Solver Representation Prototype Sprint
// v1) -----------------------------------------------------------------
// STEP4: "실제 Solver 실행" -- a multi-round GREEDY SEQUENTIAL orchestration
// simulator. Per replay, a priority order over the 5 allowed Primitives is
// decided ONCE (STEP3, from the replay's initial-state Representation key)
// and then applied round after round to the SAME mutating clone: each
// round tries the priority list in order and stops at the first Primitive
// that succeeds, exactly mirroring how the real Planner applies one Task
// at a time to a single evolving cube state (never re-probing a fresh
// clone per Primitive the way GapDetector's independent capability probes
// do) -- this is the concrete mechanism by which "Primitive 적용 순서"
// can actually change the OUTCOME (not just which Primitive gets credit),
// since fixing one wing can change what the next Primitive sees.
//
// This is a disclosed RESEARCH simulation, not the real product Planner --
// fiveByFiveEdgePlanner.ts/fiveByFiveEdgeExecutor.ts are never touched or
// called.
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { ALLOWED_PRIMITIVES, tryPrimitiveOn, type AllowedPrimitive } from "./RepresentationPrimitiveSelector";

// Bounded, disclosed constant -- generous relative to how many Primitive
// applications a 4~22 wrongWing replay in this Dataset plausibly needs
// (BASE/FLIP fix roughly one wing at a time; CASE/PARITY can resolve
// several at once), while keeping 150 replays x 4 conditions runnable in a
// single Sprint (matches this whole project's convention of bounded,
// disclosed research constants -- e.g. BoundedResolver's
// MAX_LEAVES_EXPLORED=64).
export const MAX_ROUNDS = 8;
export const PER_PRIMITIVE_DEADLINE_MS = 250;

export interface RunResult {
  hash: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  // "Coverage" throughout this WHOLE project (solverV2PrototypeBP3/
  // ReplayBenchmark.ts's own summarize(): activatedCount/totalTested) has
  // always meant "did ANY net improvement happen", never "reached a full
  // solve" -- these 150 replays are the FAILURE residuals of the real
  // production solve() (which already tried BASE/FLIP/CASE/PARITY/RECOVERY
  // and failed), so requiring a full wrongWingCount===0 clear from a
  // DELIBERATELY WEAKER 5-primitive subset (no RECOVERY/CYCLECHASE/BP-2/
  // BP-3, per this Sprint's own scope) would floor at ~0% for every
  // condition by construction and tell us nothing about reordering effects.
  // `improved` is the metric this Sprint's own Coverage/Level1 criteria are
  // measured against; `solved` is kept only as an extra disclosed stat.
  improved: boolean;
  solved: boolean;
  roundsUsed: number;
  hardGapRound1: boolean; // nothing in the priority list improved the very first round
  primitivesUsedInOrder: AllowedPrimitive[];
  attempts: Record<AllowedPrimitive, { attempts: number; successes: number }>;
}

function freshAttempts(): Record<AllowedPrimitive, { attempts: number; successes: number }> {
  return Object.fromEntries(ALLOWED_PRIMITIVES.map((p) => [p, { attempts: 0, successes: 0 }])) as Record<AllowedPrimitive, { attempts: number; successes: number }>;
}

export function runOrchestrationOnReplay(snapshot: FailureSnapshot, priority: readonly AllowedPrimitive[], libs: ExecutorLibraries): RunResult {
  const clone = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(clone);
  const attempts = freshAttempts();
  const primitivesUsedInOrder: AllowedPrimitive[] = [];
  let rounds = 0;
  let hardGapRound1 = false;

  while (rounds < MAX_ROUNDS && wrongWingCount5(clone) > 0) {
    let succeededThisRound = false;
    for (const p of priority) {
      attempts[p].attempts++;
      const ok = tryPrimitiveOn(p, clone, libs, Date.now() + PER_PRIMITIVE_DEADLINE_MS);
      if (ok) {
        attempts[p].successes++;
        primitivesUsedInOrder.push(p);
        succeededThisRound = true;
        break;
      }
    }
    if (!succeededThisRound) {
      if (rounds === 0) hardGapRound1 = true;
      break;
    }
    rounds++;
  }

  const wrongWingAfter = wrongWingCount5(clone);
  return { hash: snapshot.hash, wrongWingBefore, wrongWingAfter, improved: wrongWingAfter < wrongWingBefore, solved: wrongWingAfter === 0, roundsUsed: rounds, hardGapRound1, primitivesUsedInOrder, attempts };
}

export function runOrchestrationOnAll(snapshots: readonly FailureSnapshot[], priorityOf: (hash: string) => readonly AllowedPrimitive[]): RunResult[] {
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
  return snapshots.map((s) => runOrchestrationOnReplay(s, priorityOf(s.hash), libs));
}
