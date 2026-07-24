// --- DatasetBuilder (Solver Completeness Verification Sprint v1) -----------
// Assembles all 4 required dataset categories. Categories 1 (335 Snapshot)
// and 4 (Worst Case Library) reuse the EXISTING failureAnalysis database
// read-only (no new classification compute needed -- FailureSnapshot already
// stores parity/wrongWingCount/recoveryAttempted/recoverySucceeded from the
// real solve() trace that produced each snapshot). Categories 2 (150 Replay)
// and 3 (depth-graduated scrambles) are freshly generated via the real
// production randomLayerScramble() from a real buildSolvedCube(5) state --
// no pre-existing named dataset of that exact size/shape exists in this
// repo (confirmed by search), so this Sprint generates them fresh and
// discloses the generation parameters below.
import { loadDatabase, allSnapshots } from "../failureAnalysis/failureDatabase";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildScrambledCube } from "./FullPipelineProbe";
import type { Cubie } from "../cubeState";

export interface DatasetCase {
  label: string;
  category: "snapshot335" | "replay150" | `scrambleDepth${number}` | "worstCase";
  cubies: Cubie[];
  worstCaseTags?: string[]; // only set for category==="worstCase"
}

export const REPLAY_POOL_SIZE = 150;
export const REPLAY_SCRAMBLE_DEPTH = 40; // disclosed choice: a "standard, fully-scrambled" depth, distinct from the graduated-depth study below
export const SCRAMBLE_DEPTHS = [10, 20, 30, 40, 50, 100] as const;
export const SAMPLES_PER_DEPTH = 30; // matches this whole research arc's own N=30 convention, used here as population size per depth bucket
export const WORST_CASE_TOP_N_PER_CATEGORY = 20;

export function loadSnapshot335(dbPath: string): FailureSnapshot[] {
  const db = loadDatabase(dbPath);
  return allSnapshots(db);
}

export function buildSnapshot335Cases(dbPath: string): DatasetCase[] {
  return loadSnapshot335(dbPath).map((s) => ({
    label: `snapshot335:${s.hash}`,
    category: "snapshot335" as const,
    cubies: deserializeCube(s.cubeState),
  }));
}

export function buildReplayPool150(): DatasetCase[] {
  const cases: DatasetCase[] = [];
  for (let i = 0; i < REPLAY_POOL_SIZE; i++) {
    cases.push({ label: `replay150:${i}`, category: "replay150", cubies: buildScrambledCube(REPLAY_SCRAMBLE_DEPTH) });
  }
  return cases;
}

export function buildDepthGradedScrambles(): DatasetCase[] {
  const cases: DatasetCase[] = [];
  for (const depth of SCRAMBLE_DEPTHS) {
    for (let i = 0; i < SAMPLES_PER_DEPTH; i++) {
      cases.push({ label: `scrambleDepth${depth}:${i}`, category: `scrambleDepth${depth}` as const, cubies: buildScrambledCube(depth) });
    }
  }
  return cases;
}

/**
 * Worst Case Library: derived from the existing 335-snapshot population's
 * OWN real, already-recorded solve() metadata (no fresh classification
 * compute) -- Parity-집중 (parity===true), Recovery-집중 (recoveryAttempted
 * && !recoverySucceeded -- attempted AND still failed, the genuinely hard
 * subset), Conflict-집중/Hard Case (top wrongWingCount decile). Deduped by
 * hash; capped at WORST_CASE_TOP_N_PER_CATEGORY per category so the library
 * stays a bounded, genuinely "worst" subset rather than re-including the
 * whole population under a new label.
 */
export function buildWorstCaseLibrary(dbPath: string): DatasetCase[] {
  const snaps = loadSnapshot335(dbPath);
  const seen = new Set<string>();
  const cases: DatasetCase[] = [];

  const addTagged = (snap: FailureSnapshot, tag: string) => {
    const existing = cases.find((c) => c.label === `worstCase:${snap.hash}`);
    if (existing) {
      existing.worstCaseTags!.push(tag);
      return;
    }
    if (seen.has(snap.hash)) return; // shouldn't happen given the find() above, but keep the invariant explicit
    seen.add(snap.hash);
    cases.push({
      label: `worstCase:${snap.hash}`,
      category: "worstCase",
      cubies: deserializeCube(snap.cubeState),
      worstCaseTags: [tag],
    });
  };

  const parityCases = snaps.filter((s) => s.parity).slice(0, WORST_CASE_TOP_N_PER_CATEGORY);
  for (const s of parityCases) addTagged(s, "parity");

  const recoveryHardCases = snaps
    .filter((s) => s.recoveryAttempted && !s.recoverySucceeded)
    .slice(0, WORST_CASE_TOP_N_PER_CATEGORY);
  for (const s of recoveryHardCases) addTagged(s, "recovery-failed");

  const hardestByWrongWing = [...snaps].sort((a, b) => b.wrongWingCount - a.wrongWingCount).slice(0, WORST_CASE_TOP_N_PER_CATEGORY);
  for (const s of hardestByWrongWing) addTagged(s, "high-wrongWingCount");

  return cases;
}

export function buildAllDatasets(dbPath: string): {
  snapshot335: DatasetCase[];
  replay150: DatasetCase[];
  scrambleDepths: DatasetCase[];
  worstCase: DatasetCase[];
} {
  return {
    snapshot335: buildSnapshot335Cases(dbPath),
    replay150: buildReplayPool150(),
    scrambleDepths: buildDepthGradedScrambles(),
    worstCase: buildWorstCaseLibrary(dbPath),
  };
}
