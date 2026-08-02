import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import CubeView, { type CubeViewHandle } from "./CubeView";
import { getLeaderboard, submitScore, type LeaderboardEntry } from "./leaderboard";
import "./App.css";

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" });
}

// Shown after a solver-button click: moveLabel is the letter notation for
// puzzles that have one (2x2x2/3x3x3), or null for puzzles that only
// preview via animation (4x4x4, and whatever's added next -- see
// handleSolve). Deliberately carries no move count: the total moves needed
// can be recomputed differently between clicks (the 4x4x4 solver restarts
// itself with randomized ordering), so displaying it as a stable number
// would be misleading.
interface HintDisplay {
  moveLabel: string | null;
}

const SIZE_COLORS: Record<number, string> = {
  2: "btn-blue",
  3: "btn-green",
  4: "btn-orange",
  5: "btn-rose",
};

function App() {
  const cubeRef = useRef<CubeViewHandle>(null);

  const [screen, setScreen] = useState<"home" | "game" | "leaderboard">("home");
  const [mode, setMode] = useState<"look" | "play">("play");
  const [gridSize, setGridSize] = useState(3);
  const [moveCount, setMoveCount] = useState(0);
  const [, setHasScrambled] = useState(false);
  const [justSolved, setJustSolved] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [hint, setHint] = useState<HintDisplay | null>(null);
  const [solveError, setSolveError] = useState(false);
  const [fourByFourUnsolved, setFourByFourUnsolved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lastRank, setLastRank] = useState<number | null>(null);

  useEffect(() => {
    if (screen === "game" || screen === "leaderboard") {
      setLeaderboard(getLeaderboard(gridSize));
    }
  }, [screen, gridSize]);

  const handleMoveCountChange = useCallback((count: number) => {
    setMoveCount(count);
  }, []);

  const handleSolvedChange = useCallback(
    (solved: boolean) => {
      setHasScrambled((currentlyScrambled) => {
        if (solved && currentlyScrambled) {
          setJustSolved(true);
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
          });
          const { entries, rank } = submitScore(gridSize, moveCount);
          setLeaderboard(entries);
          setLastRank(rank);
          return false;
        }
        return currentlyScrambled;
      });
    },
    [gridSize, moveCount],
  );

  const handleScramble = useCallback(async () => {
    // Orbit mode while the scramble animation plays -- keeps the swipe
    // controller disabled so a finger on the cube can't fight the
    // programmatic moves. Switches back to play once it settles so the
    // very next swipe turns a layer instead of just orbiting the camera.
    setMode("look");
    setJustSolved(false);
    setMoveCount(0);
    setHint(null);
    setSolveError(false);
    setFourByFourUnsolved(false);
    setLastRank(null);
    await cubeRef.current?.scramble();
    setHasScrambled(true);
    setMode("play");
  }, []);

  const handleReset = useCallback(() => {
    cubeRef.current?.resetToSolved();
    setMode("play");
    setJustSolved(false);
    setMoveCount(0);
    setHint(null);
    setSolveError(false);
    setFourByFourUnsolved(false);
    setLastRank(null);
    setHasScrambled(false);
  }, []);

  const handleLookAround = useCallback(() => {
    setMode("look");
  }, []);

  const resetGameState = useCallback(() => {
    setMode("play");
    setJustSolved(false);
    setMoveCount(0);
    setHint(null);
    setSolveError(false);
    setFourByFourUnsolved(false);
    setLastRank(null);
    setHasScrambled(false);
  }, []);

  const handlePickSize = useCallback(
    (size: number) => {
      setGridSize(size);
      resetGameState();
      setScreen("game");
    },
    [resetGameState],
  );

  const handleBackToHome = useCallback(() => {
    setScreen("home");
  }, []);

  const handleOpenLeaderboard = useCallback(() => {
    setScreen("leaderboard");
  }, []);

  const handleBackToGame = useCallback(() => {
    setScreen("game");
  }, []);

  const handleStart = useCallback(() => {
    setMode("play");
  }, []);

  const handleSolve = useCallback(async () => {
    setIsSolving(true);
    setFourByFourUnsolved(false);
    try {
      if (gridSize === 4 || gridSize === 5) {
        // Same preview-and-revert idea as the 2x2x2/3x3x3 hint below: the
        // user performs the actual swipe themselves, since there's no
        // letter-notation move history to hint against for a 4x4x4/5x5x5
        // (see cubeState.ts). The 5x5x5 path now caches a Plan across
        // presses instead of recomputing everything fresh each time (see
        // fiveByFiveEdgeSolverEngine.ts) -- previewNextFiveByFive still goes
        // stale-safely if the user's own swipes diverge from it, since the
        // engine itself detects that via a state hash and rebuilds.
        const result = gridSize === 4 ? await cubeRef.current?.previewNextFourByFour() : await cubeRef.current?.previewNextFiveByFive();
        setSolveError(false);
        setHint(result?.hasMove ? { moveLabel: null } : null);
        // Reflects the PLAN's own solved flag directly, not gated on
        // whether there happened to be a move to preview -- a scramble the
        // solver can't fully resolve still produces plenty of legitimate
        // moves every single recompute, so hasMove stays true forever and
        // the earlier version of this check never surfaced the warning at
        // all for exactly the case it was meant to catch.
        setFourByFourUnsolved(result ? !result.solved : true);
      } else {
        const result = await cubeRef.current?.solveNextMove();
        setSolveError(false);
        setHint(result?.move ? { moveLabel: result.move } : null);
      }
    } catch {
      // The solver is a third-party library reached through an experimental
      // API — keep the button from getting stuck disabled forever if it
      // ever throws for a reason we haven't seen yet.
      setSolveError(true);
      setHint(null);
    } finally {
      setIsSolving(false);
    }
  }, [gridSize]);

  if (screen === "home") {
    return (
      <div className="app">
        <div className="above-cube">
          <header className="app-header">
            <h1>Poly Puzzle</h1>
          </header>
        </div>

        <div className="cube-stage">
          <CubeView
            orbitMode
            gridSize={3}
            onMoveCountChange={() => {}}
            onFirstMove={() => {}}
            onSolvedChange={() => {}}
          />
        </div>

        <div className="home-bottom-controls">
          <div className="size-select">
            {[2, 3, 4, 5].map((size) => (
              <button
                key={size}
                type="button"
                className={`btn3d ${SIZE_COLORS[size]}${gridSize === size ? " selected" : ""}`}
                onClick={() => handlePickSize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "leaderboard") {
    return (
      <div className="app">
        <header className="app-header with-back">
          <button type="button" className="home-link" onClick={handleBackToGame}>
            ← 뒤로
          </button>
          <p className="subtitle">
            {gridSize}×{gridSize} 리더보드
          </p>
        </header>

        <div className="leaderboard-page">
          {leaderboard.length === 0 ? (
            <p className="leaderboard-empty">아직 기록이 없어요 — 스크램블 후 풀어보세요!</p>
          ) : (
            <>
              <p className="leaderboard-caption">이동수가 적을수록 상위예요</p>
              <ol className="leaderboard-list">
                {leaderboard.map((entry, index) => (
                  <li key={`${entry.date}-${index}`} className={lastRank === index + 1 ? "leaderboard-new" : ""}>
                    <span className={`leaderboard-rank rank-${index < 3 ? index + 1 : "other"}`}>{index + 1}</span>
                    <span className="leaderboard-moves">{entry.moves}수</span>
                    <span className="leaderboard-date">{formatEntryDate(entry.date)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="above-cube">
        <header className="app-header with-back">
          <button type="button" className="home-link" onClick={handleBackToHome}>
            ← 크기 변경
          </button>
          <button type="button" className="home-link leaderboard-link" onClick={handleOpenLeaderboard}>
            리더보드
          </button>
        </header>

        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">이동수</span>
            <span className="stat-value">{moveCount}</span>
          </div>
        </div>

        <p className="mode-hint">
          {isSolving
            ? gridSize === 4
              ? "다음 수 미리보기 계산 중... (처음 누르면 몇 분 걸릴 수 있어요)"
              : gridSize === 5
                ? "다음 수 미리보기 계산 중... (처음 누르면 몇 초 걸릴 수 있어요)"
                : "다음 수 미리보기 재생 중..."
            : solveError
              ? "솔버 실행 중 오류가 발생했습니다. 다시 시도해보세요"
              : hint
                ? (hint.moveLabel ? `다음 수: ${hint.moveLabel} — 직접 돌려보세요` : "다음 수를 미리보기했어요 — 애니메이션을 보고 직접 돌려보세요") +
                  (fourByFourUnsolved ? " (이 스크램블은 끝까지 못 풀 수도 있어요)" : "")
                : fourByFourUnsolved
                  ? "이 스크램블은 아직 끝까지 풀지 못했어요 (패리티 케이스일 수 있어요) — 다시 시도해보세요"
                  : ""}
        </p>
      </div>

      <div className="cube-stage">
        <CubeView
          ref={cubeRef}
          orbitMode={mode === "look"}
          gridSize={gridSize}
          onMoveCountChange={handleMoveCountChange}
          onFirstMove={() => {}}
          onSolvedChange={handleSolvedChange}
        />
        {justSolved && (
          <div className="solved-banner">
            Solved! 🎉
            {lastRank && <span className="solved-rank">{lastRank}위 기록!</span>}
          </div>
        )}
      </div>

      <div className="bottom-controls">
        <div className="control-row">
          <button
            type="button"
            className={`btn3d btn-blue${mode === "look" ? " selected" : ""}`}
            onClick={handleLookAround}
            disabled={isSolving}
          >
            둘러보기
          </button>
          <button
            type="button"
            className={`btn3d btn-green${mode === "play" ? " selected" : ""}`}
            onClick={handleStart}
            disabled={isSolving}
          >
            시작하기
          </button>
        </div>
        <div className="control-row">
          <button type="button" className="btn3d btn-orange" onClick={handleReset} disabled={isSolving}>
            리셋
          </button>
          <button
            type="button"
            className="btn3d btn-accent"
            onClick={handleSolve}
            disabled={isSolving}
            title={
              gridSize === 5
                ? "3×3처럼 다음 수를 미리보기만 해요 (일부 스크램블은 여러 번 눌러야 끝까지 풀릴 수 있어요)"
                : gridSize === 4
                  ? "3×3처럼 다음 수를 미리보기만 해요"
                  : undefined
            }
          >
            솔브
          </button>
          <button type="button" className="btn3d btn-rose" onClick={handleScramble} disabled={isSolving}>
            스크램블
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
