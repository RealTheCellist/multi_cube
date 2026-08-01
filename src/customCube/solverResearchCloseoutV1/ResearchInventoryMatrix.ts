// --- ResearchInventoryMatrix (Solver Research Closeout Sprint v1, STEP1)
// -------------------------------------------------------------------------
// Real, reproducible classification of every committed docs/*.md deliverable
// (fs.readdirSync -- no fabricated list) into the Directive's own 10
// categories, via a disclosed, priority-ordered keyword ruleset (not a
// hand-picked per-file judgment call, to keep the classification
// reproducible and auditable). Any file matching no rule falls into
// UNCLASSIFIED rather than being forced into a bucket.
import * as fs from "fs";

export type ResearchCategory =
  | "PRIMITIVE_DISCOVERY"
  | "BLUEPRINT"
  | "PROTOTYPE"
  | "EVALUATION"
  | "PRODUCTION_INTEGRATION"
  | "VALIDATION"
  | "FRAMEWORK"
  | "QUALIFICATION"
  | "RELEASE"
  | "POST_RELEASE"
  | "UNCLASSIFIED";

export interface InventoryRow {
  file: string;
  category: ResearchCategory;
  matchedRule: string;
}

export interface ResearchInventoryMatrixResult {
  rows: InventoryRow[];
  totalFiles: number;
  countsByCategory: Record<ResearchCategory, number>;
}

const DOCS_DIR = "src/customCube/docs";

// Priority-ordered ruleset -- first matching rule wins. Order matters: more
// specific rules (RELEASE, POST_RELEASE, QUALIFICATION, BLUEPRINT) are
// checked before broader catch-alls (PRODUCTION_INTEGRATION, VALIDATION)
// so that e.g. "PRODUCTION_INTEGRATION_BLUEPRINT.md" (a planning/Blueprint
// document, despite containing the substring "PRODUCTION_INTEGRATION")
// correctly lands in BLUEPRINT, not PRODUCTION_INTEGRATION.
const RULES: { category: ResearchCategory; pattern: RegExp }[] = [
  { category: "RELEASE", pattern: /RELEASE_READINESS|RELEASE_NOTES|RELEASE_CLOSEOUT|^PRODUCTION_RELEASE/ },
  { category: "POST_RELEASE", pattern: /POST_RELEASE/ },
  { category: "QUALIFICATION", pattern: /QUALIFICATION|VALIDATION_PROTOCOL|VALIDATION_METHODOLOGY/ },
  { category: "FRAMEWORK", pattern: /VALIDATION_FRAMEWORK/ },
  { category: "BLUEPRINT", pattern: /BLUEPRINT|INTEGRATION_PLANNING/ },
  { category: "PROTOTYPE", pattern: /PROTOTYPE/ },
  { category: "PRODUCTION_INTEGRATION", pattern: /PRODUCTION_INTEGRATION|PRODUCTION_VALIDATION/ },
  { category: "EVALUATION", pattern: /COMPLETENESS_VALIDATION|EVALUATION|STABILIZATION|COMPLETENESS_VERIFICATION/ },
  { category: "VALIDATION", pattern: /VALIDATION/ },
  {
    category: "PRIMITIVE_DISCOVERY",
    pattern:
      /DISCOVERY|GAP_ANALYSIS|STATE_TAXONOMY|DESIGN_SPACE|EXISTENCE|COVERAGE_HOLE|MECHANISM_ANALYSIS|OPPORTUNITY_ANALYSIS|BUDGET_SCHEDULING|ARCHITECTURE_REVISION|ARCHITECTURE_ANALYSIS|BOTTLENECK_ATTRIBUTION|SCHEDULING_INVESTIGATION|ISOLATION_MECHANISM|FAMILY_PRIORITIZATION|PRIMITIVE_RESEARCH_PROCESS|REFINEMENT|ATTRIBUTION_REFINEMENT/,
  },
];

export function buildResearchInventoryMatrix(): ResearchInventoryMatrixResult {
  const files: string[] = fs
    .readdirSync(DOCS_DIR)
    .filter((f: string) => f.endsWith(".md"))
    .sort();

  const rows: InventoryRow[] = files.map((file: string) => {
    for (const rule of RULES) {
      if (rule.pattern.test(file)) {
        return { file, category: rule.category, matchedRule: rule.pattern.source };
      }
    }
    return { file, category: "UNCLASSIFIED", matchedRule: "(no rule matched)" };
  });

  const countsByCategory: Record<ResearchCategory, number> = {
    PRIMITIVE_DISCOVERY: 0,
    BLUEPRINT: 0,
    PROTOTYPE: 0,
    EVALUATION: 0,
    PRODUCTION_INTEGRATION: 0,
    VALIDATION: 0,
    FRAMEWORK: 0,
    QUALIFICATION: 0,
    RELEASE: 0,
    POST_RELEASE: 0,
    UNCLASSIFIED: 0,
  };
  for (const row of rows) countsByCategory[row.category]++;

  return { rows, totalFiles: files.length, countsByCategory };
}
