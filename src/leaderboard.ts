export interface LeaderboardEntry {
  moves: number;
  date: string;
}

const STORAGE_PREFIX = "poly-puzzle-leaderboard-";
const MAX_ENTRIES = 10;

function storageKey(gridSize: number): string {
  return `${STORAGE_PREFIX}${gridSize}`;
}

export function getLeaderboard(gridSize: number): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(gridSize));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LeaderboardEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LeaderboardEntry).moves === "number" &&
        typeof (entry as LeaderboardEntry).date === "string",
    );
  } catch {
    // Private browsing, storage disabled, or corrupted JSON -- treat as no
    // saved history rather than breaking the leaderboard feature entirely.
    return [];
  }
}

// Records a solve's move count against the per-size local leaderboard,
// keeping only the best MAX_ENTRIES (lowest move counts first). Returns
// the updated top-10 list plus this entry's 1-indexed rank, or a null
// rank if it didn't place.
export function submitScore(gridSize: number, moves: number): { entries: LeaderboardEntry[]; rank: number | null } {
  const current = getLeaderboard(gridSize);
  const entry: LeaderboardEntry = { moves, date: new Date().toISOString() };
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
