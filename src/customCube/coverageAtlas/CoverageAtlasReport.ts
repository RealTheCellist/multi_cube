// --- CoverageAtlasReport (Coverage Hole Discovery Sprint v1, Phase 1 STEP6)
// Ties STEP1-5 together into the "Coverage Atlas" deliverable the Master
// Directive's Phase 1 asks for: text report for human reading, plus a JSON
// summary (no raw Cubie[] states -- kept small and diffable) for Phase 2's
// Structural State Classification to consume directly.
import type { HoleCase } from "./HoleDatasetBuilder";
import type { HoleStructuralProfile, DeadStateCluster } from "./DeadStateClusterAnalysis";
import type { ZeroMoveLoopResult, ZeroMoveLoopSummary } from "./CycleAnalysis";
import type { ConflictProfile, ConflictSummary } from "./ConflictAnalysis";
import type { CoverageStateGraphAtlas } from "./StateGraphAtlas";

export interface CoverageAtlasResult {
  generatedAt: string;
  inputCaseCount: number;
  holeCount: number;
  trueCoverageHoleCount: number; // anyPrimitiveApplicable === false (Goal 3 territory)
  reachableButUnexploitedCount: number; // anyPrimitiveApplicable === true but production loop still stuck (Goal 2 territory)
  zeroMoveLoopSummary: ZeroMoveLoopSummary;
  conflictSummary: ConflictSummary;
  clusters: DeadStateCluster[];
  aggregateNodeTypeCounts: CoverageStateGraphAtlas["aggregateNodeTypeCounts"];
  aggregateEdgeTypeCounts: CoverageStateGraphAtlas["aggregateEdgeTypeCounts"];
}

export function buildCoverageAtlasResult(
  holes: HoleCase[],
  inputCaseCount: number,
  profiles: HoleStructuralProfile[],
  clusters: DeadStateCluster[],
  zeroMoveLoopResults: ZeroMoveLoopResult[],
  zeroMoveLoopSummary: ZeroMoveLoopSummary,
  conflictProfiles: ConflictProfile[],
  conflictSummary: ConflictSummary,
  stateGraphAtlas: CoverageStateGraphAtlas
): CoverageAtlasResult {
  const trueCoverageHoleCount = holes.filter((h) => !h.anyPrimitiveApplicable).length;
  return {
    generatedAt: new Date().toISOString(),
    inputCaseCount,
    holeCount: holes.length,
    trueCoverageHoleCount,
    reachableButUnexploitedCount: holes.length - trueCoverageHoleCount,
    zeroMoveLoopSummary,
    conflictSummary,
    clusters,
    aggregateNodeTypeCounts: stateGraphAtlas.aggregateNodeTypeCounts,
    aggregateEdgeTypeCounts: stateGraphAtlas.aggregateEdgeTypeCounts,
  };
}

export function renderCoverageAtlasReport(result: CoverageAtlasResult): string {
  const lines: string[] = [];
  lines.push("Coverage Hole Discovery Sprint v1 -- Coverage Atlas Report");
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push("");
  lines.push("1. Hole Dataset (STEP1)");
  lines.push(
    `  Input cases: ${result.inputCaseCount} (Worst Case Library 52 + snapshot335 subsample 30 + scrambleDepth stratified subsample 60)`
  );
  lines.push(`  Confirmed Hole cases (non-convergent, no exception): ${result.holeCount}/${result.inputCaseCount}`);
  lines.push(
    `  True Coverage Hole (no existing primitive succeeds even in isolation): ${result.trueCoverageHoleCount}/${result.holeCount} (${(
      (result.trueCoverageHoleCount / Math.max(1, result.holeCount)) *
      100
    ).toFixed(2)}%)`
  );
  lines.push(
    `  Reachable-but-Unexploited (>=1 primitive succeeds in isolation, but production loop still stuck): ${result.reachableButUnexploitedCount}/${result.holeCount} (${(
      (result.reachableButUnexploitedCount / Math.max(1, result.holeCount)) *
      100
    ).toFixed(2)}%)`
  );
  lines.push("");

  lines.push("2. Dead State Clusters (STEP2, by structural mechanism)");
  for (const c of result.clusters) {
    lines.push(
      `  [${c.size} cases, ${(c.share * 100).toFixed(1)}%] ${c.mechanismLabel} -- key=${c.key}, avgWrongWing=${c.avgWrongWingCount.toFixed(
        1
      )}, avgConflict=${c.avgConflictCount.toFixed(1)}, anyPrimitiveApplicable=${c.anyPrimitiveApplicableCount}/${c.size}`
    );
  }
  lines.push("");

  lines.push("3. Zero-Move Loop confirmation (STEP3, N=10 repeat-solve per case)");
  lines.push(`  Confirmed genuine zero-move loop (10/10 empty): ${result.zeroMoveLoopSummary.confirmedZeroMoveLoopCount}/${result.zeroMoveLoopSummary.totalCases} (${(
    result.zeroMoveLoopSummary.confirmedZeroMoveLoopShare * 100
  ).toFixed(2)}%)`);
  lines.push(`  Partially stochastic (>=1/10 non-empty, but not all): ${result.zeroMoveLoopSummary.partiallyStochasticCount}`);
  lines.push(`  Average empty-moveQueue rate across all cases: ${(result.zeroMoveLoopSummary.avgEmptyMoveQueueRate * 100).toFixed(2)}%`);
  lines.push("");

  lines.push("4. Conflict Analysis (STEP4)");
  lines.push(`  Cases with >=1 structural CONFLICT edge: ${result.conflictSummary.casesWithAnyConflict}/${result.conflictSummary.totalCases} (${(
    result.conflictSummary.casesWithAnyConflictShare * 100
  ).toFixed(2)}%)`);
  lines.push(`  Cases where a conflict targets an already-SolvedPair slot: ${result.conflictSummary.casesWithSolvedPairTargetConflict}`);
  lines.push(`  Avg conflict edges per case: ${result.conflictSummary.avgConflictEdgesPerCase.toFixed(2)}`);
  lines.push(
    `  Among cases with NO applicable primitive: conflict present in ${result.conflictSummary.conflictPresentAndNoPrimitiveApplicable}, conflict absent in ${result.conflictSummary.conflictAbsentAndNoPrimitiveApplicable}`
  );
  lines.push("");

  lines.push("5. State Graph Atlas (STEP5, aggregate node/edge type counts across all Hole cases)");
  lines.push(
    `  Node types: SolvedPair=${result.aggregateNodeTypeCounts.SolvedPair}, WingPair=${result.aggregateNodeTypeCounts.WingPair}, BrokenPair=${result.aggregateNodeTypeCounts.BrokenPair}`
  );
  lines.push(
    `  Edge types: SWAP=${result.aggregateEdgeTypeCounts.SWAP}, CYCLE=${result.aggregateEdgeTypeCounts.CYCLE}, CONFLICT=${result.aggregateEdgeTypeCounts.CONFLICT}`
  );
  lines.push("");

  lines.push("6. Phase 1 Conclusion");
  if (result.trueCoverageHoleCount === result.holeCount) {
    lines.push(
      "  100% of the Hole Dataset is a True Coverage Hole -- no existing primitive (BASE/FLIP/CASE/PARITY/RECOVERY, RECOVERY covering the full production DISRUPT/SETUP/REPAIR/CCR layer) succeeds even in isolation. Phase 2/3 (new Primitive design) is necessary; the problem is not a scheduling/Planner defect."
    );
  } else if (result.trueCoverageHoleCount === 0) {
    lines.push(
      "  0% of the Hole Dataset is a True Coverage Hole -- every case has at least one existing primitive that succeeds in isolation, meaning the production loop's inability to converge is entirely a scheduling/Zero-Move-Loop problem (Goal 2), not a missing-capability problem (Goal 1/3). This would redirect the Program toward Planner/Scheduler investigation rather than new Primitive design."
    );
  } else {
    lines.push(
      `  Mixed population: ${result.trueCoverageHoleCount} True Coverage Hole cases need new Primitive capability (Goal 1/3), ${result.reachableButUnexploitedCount} Reachable-but-Unexploited cases need scheduling/Planner investigation (Goal 2) instead. Both tracks are real and distinct.`
    );
  }

  return lines.join("\n");
}
