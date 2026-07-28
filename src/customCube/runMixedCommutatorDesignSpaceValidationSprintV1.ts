// Mixed Commutator Design Space Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runMixedCommutatorDesignSpaceValidationSprintV1.ts
//
// Research/Validation Sprint (no new Primitive, no Prototype, Production
// Solver untouched): determines whether Novel Low-Footprint Move
// Existence Validation Sprint v1's 2.33 footprintRatio floor is a
// structural limit of the bracket-commutator mechanism, or an artifact of
// that Sprint's narrow design space (same-pattern-only, single-fragment
// setups only). Expands to: mixed known-pattern pairs (RQ-1) and longer
// (2/3-fragment) setups on the single empirically-best pattern pair
// (RQ-2), then analyzes whether the global minimum footprintRatio keeps
// improving as the design space grows (RQ-3) or saturates.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { searchPatternPairs, KNOWN_PATTERNS, PATTERN_PAIRS, type PatternPairSearchResult, type CommutatorCandidate } from "./mixedCommutatorDesignSpace/PatternPairSearch";
import { searchSetupLengths, type SetupLengthSearchResult } from "./mixedCommutatorDesignSpace/SetupLengthSearch";
import { buildPairRows, buildSameVsMixedRows } from "./mixedCommutatorDesignSpace/DesignSpaceCoverageMatrix";
import { summarizeFootprintRatios } from "./mixedCommutatorDesignSpace/FootprintDistributionSummary";
import { buildConvergenceCurve, type StageInput } from "./mixedCommutatorDesignSpace/ConvergenceAnalysis";
import { classifyStructures, type BestCandidateSummary } from "./mixedCommutatorDesignSpace/StructureClassification";
import { analyzeLimitingFactor } from "./mixedCommutatorDesignSpace/LimitingFactorAnalysis";
import { assessMechanism } from "./mixedCommutatorDesignSpace/MechanismAssessment";
import { buildAtomicFragments, type MoveFragment } from "./primitiveDiscovery/PrimitiveSearch";

const DATA_DIR = "src/customCube/mixedCommutatorDesignSpace/data";
const REPORT_PATH = `${DATA_DIR}/mixed-commutator-design-space-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mixed-commutator-design-space-v1-result.json`;
const CHECKPOINT1_PATH = `${DATA_DIR}/checkpoint-phase1.json`;
const CHECKPOINT2_PATH = `${DATA_DIR}/checkpoint-phase2.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const NEAR_MISS_BAND = 2.2;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCheckpoint<T>(path: string): { completedLabels: string[]; rows: T[] } {
  if (!fs.existsSync(path)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}
function saveCheckpoint<T>(path: string, completedLabels: string[], rows: T[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path, JSON.stringify({ completedLabels, rows }), "utf-8");
}

const FRAGMENT_LOOKUP: Map<string, MoveFragment> = new Map([{ type: "quarter", moves: [], label: "IDENTITY" } as MoveFragment, ...buildAtomicFragments()].map((f) => [f.label, f]));

async function main() {
  const holes = loadRawHoleDataset();
  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const primary: { label: string; failureClass: string; profile: { cycleLength: number } }[] = priorResult.residualClassified.filter(
    (r: { failureClass: string }) => r.failureClass === "PURE_CYCLE_ISOLATION"
  );
  log("init", `PRIMARY (PURE_CYCLE_ISOLATION) = ${primary.length} cases`);

  // ---- Phase 1: Pattern Pair Search (RQ-1), all 6 pairs, L1 setups ----
  let phase1 = loadCheckpoint<PatternPairSearchResult>(CHECKPOINT1_PATH);
  const phase1Done = new Set(phase1.completedLabels);
  if (phase1Done.size > 0) log("phase1", `resuming: ${phase1Done.size}/${primary.length} done`);
  for (const p of primary) {
    if (phase1Done.has(p.label)) continue;
    const hole = holesByLabel.get(p.label);
    if (!hole) {
      log("phase1", `WARNING: ${p.label} missing from raw dataset, skipping`);
      phase1.completedLabels.push(p.label);
      phase1Done.add(p.label);
      continue;
    }
    const clone = cloneCubies(hole.cubies as Cubie[]);
    const t0 = Date.now();
    const result = searchPatternPairs(clone, p.label, p.profile.cycleLength);
    log("phase1", `${p.label}: attempts=${result.attemptsEvaluated}, improving=${result.candidates.length}, bestOverall.affectedWingCount=${result.bestOverall?.affectedWingCount ?? "N/A"}, ${Date.now() - t0}ms`);
    phase1.rows.push(result);
    phase1.completedLabels.push(p.label);
    phase1Done.add(p.label);
    saveCheckpoint(CHECKPOINT1_PATH, phase1.completedLabels, phase1.rows);
  }
  log("phase1", "done");

  // Reconstruct Map objects (JSON round-trip flattens Map -> array of pairs via toJSON? Actually Map doesn't serialize via JSON.stringify -- rebuild from candidates directly for safety)
  const phase1Results: PatternPairSearchResult[] = phase1.rows.map((r) => {
    const bestByPatternPair = new Map<string, CommutatorCandidate | null>();
    for (const [nameA, nameB] of PATTERN_PAIRS) {
      const key = `${nameA}|${nameB}`;
      const candidatesForPair = r.candidates.filter((c) => c.patternA === nameA && c.patternB === nameB);
      const best = candidatesForPair.length ? candidatesForPair.reduce((a, b) => (b.affectedWingCount < a.affectedWingCount ? b : a)) : null;
      bestByPatternPair.set(key, best);
    }
    return { ...r, bestByPatternPair };
  });

  // ---- Determine the single winning pattern pair (disclosed method: lowest MIN affectedWingCount across cases; tie-break by most casesWithSuccess) ----
  const pairRows = buildPairRows(phase1Results, PATTERN_PAIRS);
  let winningPair = pairRows[0];
  for (const row of pairRows) {
    if (row.casesWithSuccess === 0) continue;
    if (winningPair.casesWithSuccess === 0 || (row.avgAffectedWingCount ?? Infinity) < (winningPair.avgAffectedWingCount ?? Infinity)) {
      winningPair = row;
    }
  }
  log("phase1", `winning pattern pair: ${winningPair.patternA}+${winningPair.patternB} (avgAffectedWingCount=${winningPair.avgAffectedWingCount?.toFixed(2) ?? "N/A"}, casesWithSuccess=${winningPair.casesWithSuccess})`);

  // ---- Phase 2: Setup Length Search (RQ-2/RQ-3), winning pair only ----
  const knownA = KNOWN_PATTERNS.find((p) => p.name === winningPair.patternA)!.seq;
  const knownB = KNOWN_PATTERNS.find((p) => p.name === winningPair.patternB)!.seq;
  const winningKey = `${winningPair.patternA}|${winningPair.patternB}`;

  let phase2 = loadCheckpoint<SetupLengthSearchResult>(CHECKPOINT2_PATH);
  const phase2Done = new Set(phase2.completedLabels);
  if (phase2Done.size > 0) log("phase2", `resuming: ${phase2Done.size}/${primary.length} done`);
  for (const p of primary) {
    if (phase2Done.has(p.label)) continue;
    const hole = holesByLabel.get(p.label);
    if (!hole) {
      phase2.completedLabels.push(p.label);
      phase2Done.add(p.label);
      continue;
    }
    const r1 = phase1Results.find((r) => r.label === p.label)!;
    const best = r1.bestByPatternPair.get(winningKey) ?? null;
    const fixedSetupAMoves = best ? FRAGMENT_LOOKUP.get(best.setupALabel)?.moves ?? [] : [];
    const fixedSetupBMoves = best ? FRAGMENT_LOOKUP.get(best.setupBLabel)?.moves ?? [] : [];
    const fixedSetupALabel = best?.setupALabel ?? "IDENTITY";
    const fixedSetupBLabel = best?.setupBLabel ?? "IDENTITY";

    const clone = cloneCubies(hole.cubies as Cubie[]);
    const t0 = Date.now();
    const result = searchSetupLengths(clone, p.label, p.profile.cycleLength, winningPair.patternA, winningPair.patternB, knownA, knownB, fixedSetupAMoves, fixedSetupALabel, fixedSetupBMoves, fixedSetupBLabel);
    const l2 = result.bestAtLength[2];
    const l3 = result.bestAtLength[3];
    log("phase2", `${p.label}: attempts=${result.attemptsEvaluated}, L2.best=${l2?.affectedWingCount ?? "N/A"}, L3.best=${l3?.affectedWingCount ?? "N/A"}, ${Date.now() - t0}ms`);
    phase2.rows.push(result);
    phase2.completedLabels.push(p.label);
    phase2Done.add(p.label);
    saveCheckpoint(CHECKPOINT2_PATH, phase2.completedLabels, phase2.rows);
  }
  log("phase2", "done");

  const phase2Results: SetupLengthSearchResult[] = phase2.rows;

  // ---- Required Analysis #1: Same vs Mixed Pattern Matrix ----
  const sameVsMixedRows = buildSameVsMixedRows(pairRows);

  // ---- Footprint Distribution (Deliverable #3), pooled across the WHOLE expanded design space ----
  const allRatios: number[] = [];
  for (const r of phase1Results) for (const c of r.candidates) allRatios.push(c.footprintRatio);
  for (const r of phase2Results) {
    const l2 = r.bestAtLength[2];
    const l3 = r.bestAtLength[3];
    if (l2) allRatios.push(l2.footprintRatio);
    if (l3) allRatios.push(l3.footprintRatio);
  }
  const footprintDistribution = summarizeFootprintRatios(allRatios);

  // ---- Convergence Analysis (Deliverable #4, RQ-3) ----
  const samePairKeys = new Set(PATTERN_PAIRS.filter(([a, b]) => a === b).map(([a, b]) => `${a}|${b}`));
  const stage1Map = new Map<string, number>();
  const stage2Map = new Map<string, number>();
  for (const r of phase1Results) {
    let bestSame: number | null = null;
    let bestMixed: number | null = null;
    for (const [key, cand] of r.bestByPatternPair) {
      if (!cand) continue;
      if (samePairKeys.has(key)) {
        if (bestSame === null || cand.footprintRatio < bestSame) bestSame = cand.footprintRatio;
      } else {
        if (bestMixed === null || cand.footprintRatio < bestMixed) bestMixed = cand.footprintRatio;
      }
    }
    if (bestSame !== null) stage1Map.set(r.label, bestSame);
    if (bestMixed !== null) stage2Map.set(r.label, bestMixed);
  }
  const stage3Map = new Map<string, number>();
  const stage4Map = new Map<string, number>();
  for (const r of phase2Results) {
    const l2 = r.bestAtLength[2];
    const l3 = r.bestAtLength[3];
    if (l2) stage3Map.set(r.label, l2.footprintRatio);
    if (l3) stage4Map.set(r.label, l3.footprintRatio);
  }

  const ATTEMPTS_PER_SAME_PAIR = 2401 * 28;
  const ATTEMPTS_PER_MIXED_SET = 2401 * 3 * 28;
  const ATTEMPTS_L2 = 2304 * 2 * 28;
  const ATTEMPTS_L3 = 2304 * 2 * 28;

  const stages: StageInput[] = [
    { stage: "stage1_same_pattern_L1", attemptsThisStage: ATTEMPTS_PER_SAME_PAIR * 3, perCaseBestThisStage: stage1Map },
    { stage: "stage2_mixed_pattern_L1", attemptsThisStage: ATTEMPTS_PER_MIXED_SET, perCaseBestThisStage: stage2Map },
    { stage: "stage3_setup_length_L2", attemptsThisStage: ATTEMPTS_L2, perCaseBestThisStage: stage3Map },
    { stage: "stage4_setup_length_L3", attemptsThisStage: ATTEMPTS_L3, perCaseBestThisStage: stage4Map },
  ];
  const convergence = buildConvergenceCurve(stages);

  // ---- Structure Classification (RQ-4): per case, the single best candidate across the WHOLE expanded design space ----
  const bestCandidateSummaries: BestCandidateSummary[] = primary.map((p) => {
    const r1 = phase1Results.find((r) => r.label === p.label);
    const r2 = phase2Results.find((r) => r.label === p.label);
    let bestAffected = Infinity;
    let best: { mixedPattern: boolean; setupALength: number; setupBLength: number } | null = null;
    if (r1?.bestOverall) {
      best = { mixedPattern: r1.bestOverall.mixedPattern, setupALength: r1.bestOverall.setupALength, setupBLength: r1.bestOverall.setupBLength };
      bestAffected = r1.bestOverall.affectedWingCount;
    }
    for (const level of [2, 3] as const) {
      const cand = r2?.bestAtLength[level];
      if (cand && cand.affectedWingCount < bestAffected) {
        bestAffected = cand.affectedWingCount;
        best = {
          mixedPattern: winningPair.patternA !== winningPair.patternB,
          setupALength: cand.extendedSide === "A" ? cand.extendedLength : 1,
          setupBLength: cand.extendedSide === "B" ? cand.extendedLength : 1,
        };
      }
    }
    return { label: p.label, found: best !== null, mixedPattern: best?.mixedPattern ?? false, setupALength: best?.setupALength ?? 0, setupBLength: best?.setupBLength ?? 0 };
  });
  const structure = classifyStructures(bestCandidateSummaries);

  // ---- Limiting Factor Analysis (Required Analysis #4) + Mechanism Assessment (Deliverable #5) ----
  const limitingFactor = analyzeLimitingFactor(convergence);
  const finalStage = convergence[convergence.length - 1];
  const nearMissCaseCount = Array.from(new Set([...stage1Map.keys(), ...stage2Map.keys(), ...stage3Map.keys(), ...stage4Map.keys()]))
    .map((label) => Math.min(...[stage1Map.get(label), stage2Map.get(label), stage3Map.get(label), stage4Map.get(label)].filter((v): v is number => v !== undefined)))
    .filter((v) => v <= NEAR_MISS_BAND).length;
  const assessment = assessMechanism(finalStage, nearMissCaseCount, limitingFactor);

  // ---- Report ----
  const lines: string[] = [];
  lines.push("Mixed Commutator Design Space Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Mixed Commutator Report -- Pattern Pair Rows");
  for (const row of pairRows) {
    lines.push(`  ${row.patternA}+${row.patternB} (${row.samePattern ? "Same" : "Mixed"}): casesWithSuccess=${row.casesWithSuccess}/28, avgAffectedWingCount=${row.avgAffectedWingCount?.toFixed(2) ?? "N/A"}, avgMoveLength=${row.avgMoveLength?.toFixed(1) ?? "N/A"}, avgImprovementScore=${row.avgImprovementScore?.toFixed(2) ?? "N/A"}`);
  }
  lines.push(`  >> winning pair (used for Setup Length probes): ${winningPair.patternA}+${winningPair.patternB}`);
  lines.push("");

  lines.push("1b. Same vs Mixed Pattern Matrix (Required Analysis #1)");
  for (const row of sameVsMixedRows) {
    lines.push(`  ${row.group}: success=${row.success}, avgFootprint=${row.avgFootprint?.toFixed(2) ?? "N/A"}, avgMoveLength=${row.avgMoveLength?.toFixed(1) ?? "N/A"}, avgImprovement=${row.avgImprovement?.toFixed(2) ?? "N/A"}`);
  }
  lines.push("");

  lines.push("2. Design Space Coverage Matrix -- Setup Length Probes (winning pair only)");
  for (const r of phase2Results) {
    const l2 = r.bestAtLength[2];
    const l3 = r.bestAtLength[3];
    lines.push(`  ${r.label}: L2.best=${l2 ? `affected=${l2.affectedWingCount},ratio=${l2.footprintRatio.toFixed(2)},side=${l2.extendedSide}` : "N/A"} | L3.best=${l3 ? `affected=${l3.affectedWingCount},ratio=${l3.footprintRatio.toFixed(2)},side=${l3.extendedSide}` : "N/A"}`);
  }
  lines.push("");

  lines.push("3. Footprint Distribution (pooled across whole expanded design space)");
  lines.push(`  n=${footprintDistribution.n}, min=${footprintDistribution.min?.toFixed(2) ?? "N/A"}, avg=${footprintDistribution.avg?.toFixed(2) ?? "N/A"}, median=${footprintDistribution.median?.toFixed(2) ?? "N/A"}, max=${footprintDistribution.max?.toFixed(2) ?? "N/A"}`);
  lines.push("");

  lines.push("4. Convergence Analysis (RQ-3: does global min keep improving as design space grows?)");
  for (const pt of convergence) {
    lines.push(`  ${pt.stage}: cumulativeAttempts=${pt.cumulativeAttempts}, casesWithImprovement=${pt.casesWithAnyImprovement}, globalMinFootprintRatio=${pt.globalMinFootprintRatio?.toFixed(2) ?? "N/A"}, avgBest=${pt.avgBestFootprintRatioAcrossCases?.toFixed(2) ?? "N/A"}, lowFootprintCaseCount(<=2.0)=${pt.lowFootprintCaseCount}`);
  }
  lines.push("");

  lines.push("5. Structure Classification (RQ-4)");
  for (const t of structure.tally) lines.push(`  ${t.structureLabel}: ${t.count}`);
  lines.push(`  dominantLabel=${structure.dominantLabel ?? "N/A"}, dominantShare=${structure.dominantShare !== null ? (structure.dominantShare * 100).toFixed(1) + "%" : "N/A"}`);
  lines.push("");

  lines.push("6. Limiting Factor Analysis (Required Analysis #4)");
  lines.push(`  limitingFactor: ${limitingFactor.limitingFactor}`);
  lines.push(`  rationale: ${limitingFactor.rationale}`);
  lines.push(`  stage1GlobalMin=${limitingFactor.stage1GlobalMin?.toFixed(2) ?? "N/A"}, stage2GlobalMin=${limitingFactor.stage2GlobalMin?.toFixed(2) ?? "N/A"}, stage3GlobalMin=${limitingFactor.stage3GlobalMin?.toFixed(2) ?? "N/A"}, stage4GlobalMin=${limitingFactor.stage4GlobalMin?.toFixed(2) ?? "N/A"}`);
  lines.push("");

  lines.push("7. Mechanism Assessment (Deliverable #5, Success Criteria)");
  lines.push(`  decision: ${assessment.decision}`);
  lines.push(`  decisionLabel: ${assessment.decisionLabel}`);
  lines.push(`  globalMinFootprintRatio=${assessment.globalMinFootprintRatio?.toFixed(2) ?? "N/A"}, nearMissCaseCount(<=${NEAR_MISS_BAND})=${assessment.nearMissCaseCount}, priorSprintBest=${assessment.priorSprintBest}, improvedBeyondPrior=${assessment.improvedBeyondPrior}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      { pairRows, sameVsMixedRows, footprintDistribution, convergence, structure, limitingFactor, assessment, winningPair: { patternA: winningPair.patternA, patternB: winningPair.patternB } },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT1_PATH)) fs.unlinkSync(CHECKPOINT1_PATH);
  if (fs.existsSync(CHECKPOINT2_PATH)) fs.unlinkSync(CHECKPOINT2_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
