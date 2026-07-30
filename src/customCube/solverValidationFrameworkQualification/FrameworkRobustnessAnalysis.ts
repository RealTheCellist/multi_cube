// --- FrameworkRobustnessAnalysis (Solver Validation Framework
// Qualification Sprint v1, STEP5) ------------------------------------------
// Classifies each Decision Replay mismatch into False PASS (Framework
// approved something the historical Sprint itself rejected/downgraded),
// False FAIL (Framework rejected something historically approved), or
// Ambiguous (Decision B on either side). Also flags the specific
// Gate-level nuance this Sprint's own manual review surfaced: Gate C
// ("Capability 감소 없음") is a deliberately WEAK bar (not worse) --
// it does not by itself require the isSignificantImprovement() bar this
// arc's historical convention actually used when calling a Capability
// gain "real". A case can pass Gate C alone while its own historical
// judgment was still B/C due to lack of significance.
import { isSignificantImprovement } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { HistoricalCase } from "./HistoricalQualificationDataset";
import type { DecisionReplayRow } from "./DecisionReplay";

export interface RobustnessFinding {
  sprintName: string;
  kind: "false_pass" | "false_fail" | "ambiguous";
  detail: string;
}

const DECISION_RANK = { A: 2, B: 1, C: 0 } as const;

export function analyzeRobustness(cases: readonly HistoricalCase[], decisionRows: readonly DecisionReplayRow[]): RobustnessFinding[] {
  const findings: RobustnessFinding[] = [];

  for (let i = 0; i < decisionRows.length; i++) {
    const row = decisionRows[i];
    const c = cases[i];
    if (row.match) continue;

    const frameworkRank = DECISION_RANK[row.frameworkDecision];
    const actualRank = DECISION_RANK[row.actualDecision];

    if (frameworkRank > actualRank) {
      findings.push({
        sprintName: row.sprintName,
        kind: "false_pass",
        detail: `Framework=${row.frameworkDecision}, 실제=${row.actualDecision} -- Framework가 실제보다 관대하게 승인. Gate C가 "감소 없음"만 확인하고 isSignificantImprovement(ciLower>0)를 별도로 요구하지 않기 때문(이 케이스의 improvedCountDiff CI=[${c.improvedCountDiff.stats.ciLower.toFixed(
          3
        )}, ${c.improvedCountDiff.stats.ciUpper.toFixed(3)}] -- isSignificantImprovement=${isSignificantImprovement(c.improvedCountDiff)}).`,
      });
    } else if (frameworkRank < actualRank) {
      findings.push({
        sprintName: row.sprintName,
        kind: "false_fail",
        detail: `Framework=${row.frameworkDecision}, 실제=${row.actualDecision} -- Framework가 실제보다 엄격하게 거부/보류.`,
      });
    } else {
      findings.push({ sprintName: row.sprintName, kind: "ambiguous", detail: `Framework=${row.frameworkDecision}, 실제=${row.actualDecision} -- 동순위 불일치(세부 사유 상이).` });
    }
  }

  return findings;
}

export interface RobustnessSummary {
  falsePassCount: number;
  falseFailCount: number;
  ambiguousCount: number;
  findings: RobustnessFinding[];
}

export function summarizeRobustness(findings: readonly RobustnessFinding[]): RobustnessSummary {
  return {
    falsePassCount: findings.filter((f) => f.kind === "false_pass").length,
    falseFailCount: findings.filter((f) => f.kind === "false_fail").length,
    ambiguousCount: findings.filter((f) => f.kind === "ambiguous").length,
    findings: [...findings],
  };
}
