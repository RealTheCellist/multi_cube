// --- PolicyDatabase (Policy Generalization Sprint v1) -----------------------
// Plain JSON on disk, keyed by stateSignature (a Policy is one-per-state, by
// construction of PolicyNormalizer) -- same Node-only `fs` convention as
// every prior Database in this series.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Policy } from "../policyAnalysis/PolicyTypes";

export interface PolicyDatabase {
  byStateSignature: Record<string, Policy>;
}

export function createEmptyPolicyDatabase(): PolicyDatabase {
  return { byStateSignature: {} };
}

export function loadPolicyDatabase(path: string): PolicyDatabase {
  if (!existsSync(path)) return createEmptyPolicyDatabase();
  const raw = readFileSync(path, "utf-8");
  if (!raw.trim()) return createEmptyPolicyDatabase();
  return JSON.parse(raw) as PolicyDatabase;
}

export function savePolicyDatabase(path: string, db: PolicyDatabase, policies: readonly Policy[]): void {
  for (const p of policies) db.byStateSignature[p.stateSignature] = p;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(db, null, 2), "utf-8");
}

export function allPolicies(db: PolicyDatabase): Policy[] {
  return Object.values(db.byStateSignature);
}
