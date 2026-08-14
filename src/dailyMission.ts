import { mulberry32, type Rng } from "./customCube/cubeState";
import { type PuzzleId, puzzleKey } from "./puzzleKind";

// How many solve-hint presses a daily mission attempt allows, per puzzle --
// scaled to roughly how long a casual human solve actually runs for that
// size (2x2 ~10-15 moves, 3x3 ~40-60, 4x4/5x5 100+), so the limit reads as
// "a nudge or two when you're stuck" rather than either "free auto-solve"
// (unlimited, the pre-mission behavior) or "basically useless" (a flat
// small number applied to a 4x4/5x5's much longer solve). Keys must match
// puzzleKey()'s "kind-size" format -- missions are cube-only today (no
// tetra solver to budget hints against), so only cube-* keys exist.
export const MISSION_HINT_LIMITS: Record<string, number> = { "cube-2": 2, "cube-3": 3, "cube-4": 5, "cube-5": 5 };

const STORAGE_PREFIX = "poly-puzzle-mission-";

function storageKey(id: PuzzleId): string {
  return `${STORAGE_PREFIX}${puzzleKey(id)}`;
}

/** Local calendar date as YYYY-MM-DD -- the mission's own "day" boundary,
 * same as what the player's device considers "today". */
export function getTodayDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// FNV-1a: fast, good-enough avalanche for turning "date+size" into a
// mulberry32 seed -- doesn't need to be cryptographic, just needs the same
// input to always produce the same seed (and different sizes on the same
// day to produce different seeds, which mixing in gridSize achieves).
function hashSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The RNG that produces today's mission scramble for a given puzzle --
 * same date + same puzzle always reproduces the exact same scramble, so
 * every player (and every replay) sees the identical daily puzzle. */
export function getDailyScrambleRng(id: PuzzleId, date: string = getTodayDateString()): Rng {
  return mulberry32(hashSeed(`${date}:${puzzleKey(id)}`));
}

interface MissionStorage {
  streak: number;
  lastCompletedDate: string | null;
  today: { date: string; moves: number; hintsUsed: number } | null;
}

const EMPTY_STORAGE: MissionStorage = { streak: 0, lastCompletedDate: null, today: null };

function readStorage(id: PuzzleId): MissionStorage {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return EMPTY_STORAGE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STORAGE;
    const p = parsed as Partial<MissionStorage>;
    if (typeof p.streak !== "number") return EMPTY_STORAGE;
    return {
      streak: p.streak,
      lastCompletedDate: typeof p.lastCompletedDate === "string" ? p.lastCompletedDate : null,
      today:
        p.today && typeof p.today.date === "string" && typeof p.today.moves === "number" && typeof p.today.hintsUsed === "number"
          ? p.today
          : null,
    };
  } catch {
    // Private browsing, storage disabled, or corrupted JSON -- treat as a
    // fresh mission history rather than breaking the feature entirely.
    return EMPTY_STORAGE;
  }
}

function writeStorage(id: PuzzleId, data: MissionStorage): void {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(data));
  } catch {
    // No persistence this session, but the in-memory result (streak, etc.)
    // returned to the caller still reflects reality for right now.
  }
}

export interface MissionStatus {
  hintLimit: number;
  completedToday: boolean;
  todayMoves: number | null;
  todayHintsUsed: number | null;
  streak: number;
}

export function getMissionStatus(id: PuzzleId, today: string = getTodayDateString()): MissionStatus {
  const data = readStorage(id);
  const completedToday = data.today?.date === today;
  return {
    hintLimit: MISSION_HINT_LIMITS[puzzleKey(id)] ?? 3,
    completedToday,
    todayMoves: completedToday ? (data.today?.moves ?? null) : null,
    todayHintsUsed: completedToday ? (data.today?.hintsUsed ?? null) : null,
    streak: data.streak,
  };
}

/**
 * Records today's mission as complete. Streak logic: completing again on
 * the same day (shouldn't normally happen -- the mission screen hides an
 * already-completed mission's play button -- but replaying for fun must
 * stay harmless) keeps the streak unchanged; completing the day right
 * after the last completed day extends it; any bigger gap (or no prior
 * completion) restarts it at 1.
 */
export function recordMissionComplete(id: PuzzleId, moves: number, hintsUsed: number, today: string = getTodayDateString()): { streak: number } {
  const data = readStorage(id);
  let streak: number;
  if (data.lastCompletedDate === today) {
    streak = data.streak;
  } else if (data.lastCompletedDate && daysBetween(data.lastCompletedDate, today) === 1) {
    streak = data.streak + 1;
  } else {
    streak = 1;
  }
  writeStorage(id, { streak, lastCompletedDate: today, today: { date: today, moves, hintsUsed } });
  return { streak };
}
