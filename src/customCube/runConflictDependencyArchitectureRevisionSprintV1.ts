// CONFLICT_DEEP_DEPENDENCY Architecture Revision Sprint v1 -- driver.
//   npx tsx src/customCube/runConflictDependencyArchitectureRevisionSprintV1.ts
//
// Read-only Architecture Analysis Sprint -- NO production files are touched.
// Every measurement below calls the REAL, unmodified generateRecoveryStrategies()/
// chooseBestRecovery() (fiveByFiveEdgeRecovery.ts, itself untouched this
// Sprint) directly, bypassing Executor exactly like every prior Sprint's own
// Recovery-level collector in this arc. Protected files (Planner/Executor/
// SolverEngine/MultiHop Bridge/CCR/REPAIR/Deferred Validator/Bounded
// Resolver) are never imported for modification, only their own existing
// exported functions are called (read-only reuse, same as every other
// module in this Sprint's suite).
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import type { HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { runCompetitionRound, summarizeCompetitionMatrix, type CompetitionRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/CompetitionMatrix";
import { runSimulationRound, summarizeSimulation, type SimulationRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/AdditiveSubstitutiveSimulation";
import { runDecisionAuditRound, summarizeDecisionAudit, type DecisionAuditRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/DecisionAudit";
import { runCounterfactualRound, summarizeCounterfactualReplay, TRUE_REGRESSION_LABELS, type CounterfactualRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/CounterfactualReplay";
import { runPolicyRound, summarizePolicySimulation, buildSchedulerOptionCatalog, type PolicyRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/SchedulerBlueprintCandidates";
import { assembleDecisionMatrix } from "./solverPrimitiveConflictDependencyArchitectureRevision/DecisionMatrix";

const DATA_DIR = "src/customCube/solverPrimitiveConflictDependencyArchitectureRevision/data";
const REPORT_PATH = `${DATA_DIR}/architecture-revision-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/architecture-revision-v1-result.json`;

const CP_COMPETITION = `${DATA_DIR}/checkpoint-competition.json`;
const CP_SIMULATION = `${DATA_DIR}/checkpoint-simulation.json`;
const CP_AUDIT = `${DATA_DIR}/checkpoint-audit.json`;
const CP_COUNTERFACTUAL = `${DATA_DIR}/checkpoint-counterfactual.json`;
const CP_POLICY = `${DATA_DIR}/checkpoint-policy.json`;

const COMPETITION_REPEATS = 10;
const SIMULATION_REPEATS = 5;
const AUDIT_REPEATS = 5;
const COUNTERFACTUAL_REPEATS = 10;
const POLICY_REPEATS = 8;

function log(s: string) {
  console.log(`[${new Date().toISOString()}] ${s}`);
}

function runPhase<T>(checkpointPath: string, totalRepeats: number, label: string, runOneRepeat: () => T[]): T[][] {
  let repeats: T[][] = [];
  if (fs.existsSync(checkpointPath)) {
    repeats = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    log(`${label}: resumed checkpoint, ${repeats.length}/${totalRepeats} repeats already done`);
  }
  for (let rep = repeats.length; rep < totalRepeats; rep++) {
    log(`${label}: repeat ${rep + 1}/${totalRepeats}...`);
    repeats.push(runOneRepeat());
    fs.writeFileSync(checkpointPath, JSON.stringify(repeats));
  }
  log(`${label}: done`);
  return repeats;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dataset = loadRawHoleDataset();
  const targetCases = dataset.filter((c) => TRUE_REGRESSION_LABELS.includes(c.label));
  log(`init: ${dataset.length} Hole Dataset cases loaded, ${targetCases.length}/${TRUE_REGRESSION_LABELS.length} True Regression target cases found`);
  const libs = buildLibs();

  // --- STEP1: Competition Matrix ---
  const competitionRepeats = runPhase<CompetitionRound>(CP_COMPETITION, COMPETITION_REPEATS, "competition", () => dataset.map((c) => runCompetitionRound(c.cubies, libs, c.label)));
  const competitionRounds = competitionRepeats.flat();
  const competitionSummary = summarizeCompetitionMatrix(competitionRounds);

  // --- STEP2: Additive vs Substitutive Simulation ---
  const simulationRepeats = runPhase<SimulationRound>(CP_SIMULATION, SIMULATION_REPEATS, "simulation", () => dataset.map((c) => runSimulationRound(c.cubies, libs, c.label)));
  const simulationRounds = simulationRepeats.flat();
  const simulationSummary = summarizeSimulation(simulationRounds);

  // --- STEP3: chooseBestRecovery Decision Audit ---
  const auditRepeats = runPhase<DecisionAuditRound>(CP_AUDIT, AUDIT_REPEATS, "audit", () => dataset.map((c) => runDecisionAuditRound(c.cubies, libs, c.label)));
  const auditRounds = auditRepeats.flat();
  const auditSummary = summarizeDecisionAudit(auditRounds);

  // --- STEP4: Counterfactual Replay (11 True Regression cases only) ---
  const counterfactualRepeats = runPhase<CounterfactualRound>(CP_COUNTERFACTUAL, COUNTERFACTUAL_REPEATS, "counterfactual", () =>
    targetCases.map((c) => runCounterfactualRound(c.cubies, libs, c.label))
  );
  const counterfactualRounds = counterfactualRepeats.flat();
  const counterfactualSummaries = summarizeCounterfactualReplay(counterfactualRounds);

  // --- STEP5: Scheduler Blueprint Candidates (quantitative policy test) ---
  const policyRepeats = runPhase<PolicyRound>(CP_POLICY, POLICY_REPEATS, "policy", () => dataset.map((c) => runPolicyRound(c.cubies, libs, c.label)));
  const policyRounds = policyRepeats.flat();
  const policySummaries = summarizePolicySimulation(policyRounds);
  const schedulerOptions = buildSchedulerOptionCatalog(policySummaries);

  // --- STEP6: Decision Matrix ---
  const decisionMatrix = assembleDecisionMatrix(competitionSummary, auditSummary, simulationSummary, counterfactualSummaries, policySummaries, schedulerOptions);

  // --- Report ---
  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("CONFLICT_DEEP_DEPENDENCY Architecture Revision Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(
    `Population: Competition n=${dataset.length}x${COMPETITION_REPEATS}; Simulation n=${dataset.length}x${SIMULATION_REPEATS}; Audit n=${dataset.length}x${AUDIT_REPEATS}; Counterfactual n=${targetCases.length}x${COUNTERFACTUAL_REPEATS}; Policy n=${dataset.length}x${POLICY_REPEATS}`
  );
  push();

  push("1. Competition Matrix (STEP1)");
  push(
    `  SETUP win rate=${(competitionSummary.setupWinRate * 100).toFixed(1)}% (${competitionSummary.setupWinCount}/${competitionSummary.n}), avg score gap when SETUP wins=${competitionSummary.avgScoreGapWhenSetupWins.toFixed(
      1
    )}`
  );
  push("  Displacement (who SETUP beat as runner-up):");
  for (const d of competitionSummary.displacement) {
    push(`    ${d.displacedType}: ${d.countAsRunnerUp} rounds, avg score gap=${d.avgScoreGap.toFixed(1)}`);
  }
  push();

  push("2. Additive vs Substitutive Simulation (STEP2)");
  for (const s of simulationSummary) {
    push(`  ${s.arm}: improvedRate=${(s.improvedRate * 100).toFixed(1)}%, chosenTypeShare=${Object.entries(s.chosenTypeShare).map(([t, r]) => `${t}:${((r ?? 0) * 100).toFixed(1)}%`).join(", ")}`);
  }
  push();

  push("3. chooseBestRecovery Decision Audit (STEP3)");
  push(
    `  SETUP chosen=${auditSummary.setupChosenCount}/${auditSummary.n}, failed=${auditSummary.setupChosenFailedCount}, failed-with-better-alternative=${auditSummary.setupFailedWithBetterAlternativeCount} (${(
      auditSummary.setupFailedBetterAlternativeRate * 100
    ).toFixed(1)}%)`
  );
  push(`  Better alternative type counts: ${Object.entries(auditSummary.betterAlternativeTypeCounts).map(([t, c]) => `${t}:${c}`).join(", ") || "none"}`);
  push();

  push("4. Counterfactual Replay -- 11 True Regression cases (STEP4)");
  for (const c of counterfactualSummaries) {
    push(`  ${c.label} (n=${c.n}):`);
    for (const arm of ["FULL", "NO_SETUP", "NO_CCR", "NO_MIXED", "NO_RESERVED"] as const) {
      push(`    ${arm}: regressedRate=${(c.armRegressedRate[arm] * 100).toFixed(1)}%, succeededRate=${(c.armSucceededRate[arm] * 100).toFixed(1)}%`);
    }
    push(`    rootCauseArms=${c.rootCauseArms.join(",") || "none"}`);
  }
  push();

  push("5. Scheduler Blueprint Candidates (STEP5)");
  for (const opt of schedulerOptions) {
    push(`  ${opt.name}`);
    push(`    ${opt.description}`);
    push(`    Risk=${opt.risk}, quantitativelyTested=${opt.quantitativelyTested}`);
  }
  push();

  push("6. Decision Matrix (STEP6)");
  for (const row of decisionMatrix.rows) {
    push(`  [Level ${row.level}][${row.status}] ${row.criterion}`);
    push(`    ${row.evidence}`);
  }
  push();
  push(`Final Decision: ${decisionMatrix.decision} -- ${decisionMatrix.decisionRationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        competitionSummary,
        simulationSummary,
        auditSummary,
        counterfactualSummaries,
        policySummaries,
        schedulerOptions,
        decisionMatrix,
      },
      null,
      2
    )
  );
  log(`report written: ${REPORT_PATH}`);

  for (const cp of [CP_COMPETITION, CP_SIMULATION, CP_AUDIT, CP_COUNTERFACTUAL, CP_POLICY]) {
    if (fs.existsSync(cp)) fs.unlinkSync(cp);
  }
  log("done, checkpoints cleaned up");
}

main();
