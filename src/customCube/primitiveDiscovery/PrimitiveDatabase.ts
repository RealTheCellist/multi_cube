// --- PrimitiveDatabase (Capability Expansion Sprint v2) ---------------------
// JSON on disk, keyed by Transition Hash (spec section 13: "Sequence 기준이
// 아니다... Transition Hash 기준 사용. 동일한 상태 변화를 만드는 Primitive는
// 하나만 저장한다.") -- same storage convention as failureAnalysis's own
// FailureDatabase.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PrimitiveCandidate } from "./PrimitiveCandidate";

export interface PrimitiveDatabase {
  byTransitionHash: Record<string, PrimitiveCandidate>;
}

export function createEmptyPrimitiveDatabase(): PrimitiveDatabase {
  return { byTransitionHash: {} };
}

export function loadPrimitiveDatabase(path: string): PrimitiveDatabase {
  if (!existsSync(path)) return createEmptyPrimitiveDatabase();
  const raw = readFileSync(path, "utf-8");
  if (!raw.trim()) return createEmptyPrimitiveDatabase();
  return JSON.parse(raw) as PrimitiveDatabase;
}

export function savePrimitiveDatabase(path: string, db: PrimitiveDatabase): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(db, null, 2), "utf-8");
}

/** Returns true if this was a genuinely new Transition Hash; if the hash
 * already exists, only bumps `frequency` (spec's own "Frequency" field --
 * how many times independent search attempts rediscovered the same
 * underlying transition) and never overwrites the first-found candidate's
 * own sequence/metadata. */
export function addOrBumpCandidate(db: PrimitiveDatabase, candidate: PrimitiveCandidate): boolean {
  const existing = db.byTransitionHash[candidate.transitionHash];
  if (existing) {
    existing.frequency += 1;
    return false;
  }
  db.byTransitionHash[candidate.transitionHash] = candidate;
  return true;
}

export function allCandidates(db: PrimitiveDatabase): PrimitiveCandidate[] {
  return Object.values(db.byTransitionHash);
}

export function getCandidateByTransitionHash(db: PrimitiveDatabase, transitionHash: string): PrimitiveCandidate | null {
  return db.byTransitionHash[transitionHash] ?? null;
}
