// --- InvocationChainAnalysis (Solver System Bottleneck Attribution
// Sprint v1, STEP3) ----------------------------------------------------------
// Records the REAL stage invocation order for one solve() call (StageEvent[]
// preserves chronological order since StageInstrumentedMirror.ts pushes each
// event synchronously as it happens), coarsened to 5 categories
// (PAIR/FLIP/PARITY/ENDGAME/RECOVERY) to match the work order's own example
// chain shape, and computes population-level statistics across all
// snapshots: avg chain length, max depth, most common repeated 2-gram
// patterns.
import type { StageEvent, StageName } from "./StageInstrumentedMirror";

export type ChainCategory = "PAIR" | "FLIP" | "PARITY" | "ENDGAME" | "RECOVERY";

const CATEGORY_OF: Record<StageName, ChainCategory> = {
  PAIR: "PAIR",
  FLIP: "FLIP",
  PARITY: "PARITY",
  ENDGAME_BESTFIX: "ENDGAME",
  ENDGAME_MULTIPLY: "ENDGAME",
  ENDGAME_DISRUPTION: "ENDGAME",
  RECOVERY_DISRUPT1: "RECOVERY",
  RECOVERY_DISRUPT2: "RECOVERY",
  RECOVERY_SETUP: "RECOVERY",
  RECOVERY_REPAIR: "RECOVERY",
  RECOVERY_CCR: "RECOVERY",
  RECOVERY_RETRY: "RECOVERY",
};

export function buildChain(events: readonly StageEvent[]): ChainCategory[] {
  // Collapse consecutive duplicate categories (e.g. ENDGAME_BESTFIX then
  // ENDGAME_MULTIPLY in the same runPrimaryPipeline call both collapse to a
  // single "ENDGAME" step) -- matches the work order's own example chain
  // granularity (one entry per Stage-group transition, not per raw event).
  const chain: ChainCategory[] = [];
  for (const e of events) {
    const cat = CATEGORY_OF[e.stage];
    if (chain.length === 0 || chain[chain.length - 1] !== cat) chain.push(cat);
  }
  return chain;
}

export interface ChainRecord {
  hash: string;
  chain: ChainCategory[];
  length: number;
}

export function analyzeInvocationChains(chainsByHash: readonly { hash: string; events: readonly StageEvent[] }[]): {
  records: ChainRecord[];
  avgChainLength: number;
  maxChainDepth: number;
  topPatterns: { pattern: string; count: number }[];
} {
  const records: ChainRecord[] = chainsByHash.map(({ hash, events }) => {
    const chain = buildChain(events);
    return { hash, chain, length: chain.length };
  });

  const n = records.length;
  const avgChainLength = n ? records.reduce((a, r) => a + r.length, 0) / n : 0;
  const maxChainDepth = n ? Math.max(...records.map((r) => r.length)) : 0;

  // 2-gram frequency across all chains -- the simplest "repeated pattern"
  // signal (e.g. "ENDGAME->RECOVERY" appearing repeatedly indicates ENDGAME
  // failing into Recovery is a common real transition).
  const gramCounts = new Map<string, number>();
  for (const r of records) {
    for (let i = 0; i + 1 < r.chain.length; i++) {
      const gram = `${r.chain[i]}->${r.chain[i + 1]}`;
      gramCounts.set(gram, (gramCounts.get(gram) ?? 0) + 1);
    }
  }
  const topPatterns = [...gramCounts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { records, avgChainLength, maxChainDepth, topPatterns };
}
