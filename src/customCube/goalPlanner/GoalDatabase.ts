// --- GoalDatabase (GOSP prototype) -------------------------------------------
// Plain JSON on disk, keyed by `${replayHash}::${goalHash}` (spec section 12's
// stored fields: Replay Hash, Goal Hash, Goal Score, Primitive Sequence,
// WrongWing, Pair, Parity, Reach Cost) -- same Node-only `fs` convention as
// failureDatabase.ts/primitiveDiscovery/PrimitiveDatabase.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GoalCandidate } from "./GoalDescriptor";

export interface GoalDatabase {
  byKey: Record<string, GoalCandidate>;
}

export function createEmptyGoalDatabase(): GoalDatabase {
  return { byKey: {} };
}

export function loadGoalDatabase(path: string): GoalDatabase {
  if (!existsSync(path)) return createEmptyGoalDatabase();
  const raw = readFileSync(path, "utf-8");
  if (!raw.trim()) return createEmptyGoalDatabase();
  return JSON.parse(raw) as GoalDatabase;
}

export function saveGoalDatabase(path: string, db: GoalDatabase): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(db, null, 2), "utf-8");
}

function keyOf(candidate: GoalCandidate): string {
  return `${candidate.replayHash}::${candidate.goalHash}`;
}

/** Dedup by (Replay Hash, Goal Hash) -- returns true if newly stored. */
export function addGoalCandidate(db: GoalDatabase, candidate: GoalCandidate): boolean {
  const key = keyOf(candidate);
  if (db.byKey[key]) return false;
  db.byKey[key] = candidate;
  return true;
}

export function allGoalCandidates(db: GoalDatabase): GoalCandidate[] {
  return Object.values(db.byKey);
}
