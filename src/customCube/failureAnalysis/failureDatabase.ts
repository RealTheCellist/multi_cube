// --- FailureDatabase (Failure Analysis Engine v1) ---------------------------
// Plain JSON on disk, keyed by hash -- chosen over SQLite since this is a
// Node-only research tool (no native binding to install) and the dataset
// size here (a few hundred to a few thousand failure snapshots) doesn't
// need a real query engine. Node's `fs` is used directly, so this module
// (and everything that imports it) must never be pulled into the browser
// bundle.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FailureSnapshot } from "./failureTypes";

export interface FailureDatabase {
  // Hash -> Snapshot, per spec's "Hash -> FailureSnapshot" index.
  byHash: Record<string, FailureSnapshot>;
}

export function createEmptyDatabase(): FailureDatabase {
  return { byHash: {} };
}

export function loadDatabase(path: string): FailureDatabase {
  if (!existsSync(path)) return createEmptyDatabase();
  const raw = readFileSync(path, "utf-8");
  if (!raw.trim()) return createEmptyDatabase();
  return JSON.parse(raw) as FailureDatabase;
}

export function saveDatabase(path: string, db: FailureDatabase): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(db, null, 2), "utf-8");
}

/** Dedup by hash (spec: "동일한 상태는 중복 저장하지 않는다") -- returns
 * true if this was a genuinely new snapshot, false if it was already known
 * (in which case the database is left untouched, not even the timestamp
 * updated, so the FIRST time a given residual was hit is what's preserved). */
export function addSnapshot(db: FailureDatabase, snapshot: FailureSnapshot): boolean {
  if (db.byHash[snapshot.hash]) return false;
  db.byHash[snapshot.hash] = snapshot;
  return true;
}

export function getByHash(db: FailureDatabase, hash: string): FailureSnapshot | null {
  return db.byHash[hash] ?? null;
}

export function allSnapshots(db: FailureDatabase): FailureSnapshot[] {
  return Object.values(db.byHash);
}
