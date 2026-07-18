// --- HybridSampler (Solver Failure Dataset Expansion Sprint v2) ----------
// STEP4: implements the Dataset Roadmap Sprint's confirmed Hybrid Sampling
// policy (Hard Gap 40% / Shape 균등 30% / Failure 유형 균등 20% /
// Random 10%) as a SELECTION policy over the validated candidate pool
// (STEP2/STEP3's output) -- NOT by steering the replay generator (which is
// out of scope for this Sprint, see ReplayCollector.ts's own header).
//
// Each phase prioritizes candidates that fill the currently emptiest
// bucket (fewest existing + already-selected-this-run members), and
// running counts are updated after each phase so later phases see the
// effect of earlier ones -- this is what makes the policy actually target
// underrepresented categories rather than just partitioning the pool by
// fixed ratio.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { ReplayMetadata } from "./MetadataBuilder";

function bucket3(n: number): number {
  return Math.floor(n / 3);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Candidate {
  snapshot: FailureSnapshot;
  meta: ReplayMetadata;
}

export interface SamplingQuotas {
  hardGap: number;
  shapeUniform: number;
  typeUniform: number;
  random: number;
}

export interface SamplingSelection {
  neededAdditional: number;
  quotas: SamplingQuotas;
  selected: FailureSnapshot[];
  selectedMetadata: ReplayMetadata[];
  actualComposition: SamplingQuotas;
  shortfall: number; // neededAdditional - selected.length, if pool ran out
}

function computeQuotas(needed: number): SamplingQuotas {
  const hardGap = Math.round(needed * 0.4);
  const shapeUniform = Math.round(needed * 0.3);
  const typeUniform = Math.round(needed * 0.2);
  const random = Math.max(0, needed - hardGap - shapeUniform - typeUniform);
  return { hardGap, shapeUniform, typeUniform, random };
}

export function selectHybridSample(
  candidates: readonly FailureSnapshot[],
  candidateMeta: readonly ReplayMetadata[],
  existingMeta: readonly ReplayMetadata[],
  targetTotalSize: number,
  seed = 20260718,
): SamplingSelection {
  const metaByHash = new Map(candidateMeta.map((m) => [m.hash, m]));
  const pool: Candidate[] = candidates.map((s) => ({ snapshot: s, meta: metaByHash.get(s.hash)! })).filter((c) => !!c.meta);

  const neededAdditional = Math.max(0, targetTotalSize - existingMeta.length);
  const quotas = computeQuotas(neededAdditional);

  // Running bucket counts, seeded from the EXISTING canonical dataset, and
  // incremented as each phase selects candidates -- so "emptiest bucket"
  // always reflects the current, up-to-date picture.
  const hardGapBucketCount = new Map<string, number>();
  const shapeBucketCount = new Map<string, number>();
  const typeBucketCount = new Map<string, number>();
  for (const m of existingMeta) {
    const hgKey = `${bucket3(m.wrongWingCount)}|${m.isHardGap}`;
    hardGapBucketCount.set(hgKey, (hardGapBucketCount.get(hgKey) ?? 0) + 1);
    shapeBucketCount.set(m.coarseShapeKey, (shapeBucketCount.get(m.coarseShapeKey) ?? 0) + 1);
    const typeKey = String(bucket3(m.wrongWingCount));
    typeBucketCount.set(typeKey, (typeBucketCount.get(typeKey) ?? 0) + 1);
  }

  const selected: Candidate[] = [];
  const selectedHashes = new Set<string>();
  const actualComposition: SamplingQuotas = { hardGap: 0, shapeUniform: 0, typeUniform: 0, random: 0 };

  function remaining(): Candidate[] {
    return pool.filter((c) => !selectedHashes.has(c.snapshot.hash));
  }

  function pickPhase(quota: number, filter: (c: Candidate) => boolean, bucketKeyOf: (c: Candidate) => string, bucketCount: Map<string, number>, tallyField: keyof SamplingQuotas): void {
    let taken = 0;
    while (taken < quota) {
      const pickable = remaining().filter(filter);
      if (pickable.length === 0) break;
      pickable.sort((a, b) => {
        const ca = bucketCount.get(bucketKeyOf(a)) ?? 0;
        const cb = bucketCount.get(bucketKeyOf(b)) ?? 0;
        if (ca !== cb) return ca - cb; // emptiest bucket first
        return a.snapshot.hash < b.snapshot.hash ? -1 : 1; // deterministic tie-break
      });
      const chosen = pickable[0];
      selected.push(chosen);
      selectedHashes.add(chosen.snapshot.hash);
      const key = bucketKeyOf(chosen);
      bucketCount.set(key, (bucketCount.get(key) ?? 0) + 1);
      actualComposition[tallyField]++;
      taken++;
    }
  }

  pickPhase(quotas.hardGap, (c) => c.meta.isHardGap, (c) => `${bucket3(c.meta.wrongWingCount)}|${c.meta.isHardGap}`, hardGapBucketCount, "hardGap");
  pickPhase(quotas.shapeUniform, () => true, (c) => c.meta.coarseShapeKey, shapeBucketCount, "shapeUniform");
  pickPhase(quotas.typeUniform, () => true, (c) => String(bucket3(c.meta.wrongWingCount)), typeBucketCount, "typeUniform");

  // Random phase: deterministic seeded shuffle over whatever remains, fills
  // the random quota AND any shortfall the earlier phases left behind
  // (their target buckets ran out of pool before their quota was met).
  const rng = mulberry32(seed);
  const left = remaining();
  for (let i = left.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [left[i], left[j]] = [left[j], left[i]];
  }
  for (const c of left) {
    if (selected.length >= neededAdditional) break;
    selected.push(c);
    selectedHashes.add(c.snapshot.hash);
    actualComposition.random++;
  }

  return {
    neededAdditional,
    quotas,
    selected: selected.map((c) => c.snapshot),
    selectedMetadata: selected.map((c) => c.meta),
    actualComposition,
    shortfall: Math.max(0, neededAdditional - selected.length),
  };
}
