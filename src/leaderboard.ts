export interface LeaderboardEntry {
  nickname: string;
  moves: number;
  date: string;
}

const STORAGE_PREFIX = "poly-puzzle-leaderboard-";
// CUBIXX design spec: top 7 only.
const MAX_ENTRIES = 7;
const FALLBACK_NICKNAME = "플레이어";

function storageKey(gridSize: number): string {
  return `${STORAGE_PREFIX}${gridSize}`;
}

export function getLeaderboard(gridSize: number): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(gridSize));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is { moves: number; date: string; nickname?: unknown } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { moves: unknown }).moves === "number" &&
          typeof (entry as { date: unknown }).date === "string",
      )
      // Entries saved before the nickname field existed still get shown,
      // just under a generic placeholder instead of being dropped.
      .map((entry) => ({
        nickname: typeof entry.nickname === "string" && entry.nickname.trim() ? entry.nickname : FALLBACK_NICKNAME,
        moves: entry.moves,
        date: entry.date,
      }));
  } catch {
    // Private browsing, storage disabled, or corrupted JSON -- treat as no
    // saved history rather than breaking the leaderboard feature entirely.
    return [];
  }
}

// Records a solve's move count against the per-size local leaderboard,
// keeping only the best MAX_ENTRIES (lowest move counts first). Returns
// the updated top-7 list plus this entry's 1-indexed rank, or a null
// rank if it didn't place.
export function submitScore(gridSize: number, moves: number, nickname: string): { entries: LeaderboardEntry[]; rank: number | null } {
  const current = getLeaderboard(gridSize);
  const entry: LeaderboardEntry = { nickname: nickname.trim() || FALLBACK_NICKNAME, moves, date: new Date().toISOString() };
  const updated = [...current, entry].sort((a, b) => a.moves - b.moves).slice(0, MAX_ENTRIES);
  const rank = updated.indexOf(entry);
  try {
    localStorage.setItem(storageKey(gridSize), JSON.stringify(updated));
  } catch {
    // Same fallback as above -- the current session still sees its rank,
    // it just won't be there on the next visit.
  }
  return { entries: updated, rank: rank === -1 ? null : rank + 1 };
}
