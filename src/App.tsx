import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import CubeView, { type CubeViewHandle } from "./CubeView";
import CubixxLogo from "./CubixxLogo";
import { getLeaderboard, submitScore, type LeaderboardEntry } from "./leaderboard";
import "./App.css";

const NICKNAME_STORAGE_KEY = "poly-puzzle-nickname";

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" });
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
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [isSolving, setIsSolving] = useState(false);
  const [solveError, setSolveError] = useState(false);
  const [fourByFourUnsolved, setFourByFourUnsolved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardSize, setLeaderboardSize] = useState(3);
  const [leaderboardOrigin, setLeaderboardOrigin] = useState<"home" | "game">("game");
  const [lastRank, setLastRank] = useState<number | null>(null);

  useEffect(() => {
    if (screen === "leaderboard") {
      setLeaderboard(getLeaderboard(leaderboardSize));
    }
  }, [screen, leaderboardSize]);

  const handleMoveCountChange = useCallback((count: number) => {
    setMoveCount(count);
  }, []);

  // Fires on real solved-state detection (the player actually lined up
  // every layer via swipes) -- not tied to the solve-hint button, which
  // only ever previews one move. Registration (nickname + leaderboard
  // submit) happens from the completion modal, not automatically here.
  const handleSolvedChange = useCallback((solved: boolean) => {
    setHasScrambled((currentlyScrambled) => {
      if (solved && currentlyScrambled) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });
        setShowCompletionModal(true);
        return false;
      }
      return currentlyScrambled;
    });
  }, []);

  const handleScramble = useCallback(async () => {
    // Orbit mode while the scramble animation plays -- keeps the swipe
    // controller disabled so a finger on the cube can't fight the
    // programmatic moves. Switches back to play once it settles so the
    // very next swipe turns a layer instead of just orbiting the camera.
    setMode("look");
    setMoveCount(0);
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
    setMoveCount(0);
    setSolveError(false);
    setFourByFourUnsolved(false);
    setLastRank(null);
    setHasScrambled(false);
  }, []);

  const handleLookAround = useCallback(() => {
    setMode("look");
  }, []);

  const handleUndo = useCallback(() => {
    const didUndo = cubeRef.current?.undoLastMove();
    if (didUndo) {
      setSolveError(false);
      setFourByFourUnsolved(false);
    }
  }, []);

  const resetGameState = useCallback(() => {
    setMode("play");
    setShowCompletionModal(false);
    setMoveCount(0);
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
    setLeaderboardOrigin("game");
    setLeaderboardSize(gridSize);
    setScreen("leaderboard");
  }, [gridSize]);

  const handleOpenLeaderboardFromHome = useCallback(() => {
    setLeaderboardOrigin("home");
    setLeaderboardSize(gridSize);
    setScreen("leaderboard");
  }, [gridSize]);

  const handleSelectLeaderboardTab = useCallback((size: number) => {
    setLeaderboardSize(size);
  }, []);

  const handleLeaderboardBack = useCallback(() => {
    setScreen(leaderboardOrigin === "home" ? "home" : "game");
  }, [leaderboardOrigin]);

  const handleRegisterScore = useCallback(() => {
    const finalNickname = nickname.trim();
    try {
      localStorage.setItem(NICKNAME_STORAGE_KEY, finalNickname);
    } catch {
      // Same fallback as leaderboard.ts -- registering the score for this
      // session still works even if persisting the nickname doesn't.
    }
    const { entries, rank } = submitScore(gridSize, moveCount, finalNickname);
    setLeaderboard(entries);
    setLastRank(rank);
    setShowCompletionModal(false);
    setLeaderboardOrigin("game");
    setLeaderboardSize(gridSize);
    setScreen("leaderboard");
  }, [nickname, gridSize, moveCount]);

  const handleSkipRegister = useCallback(() => {
    setShowCompletionModal(false);
  }, []);

  const handleStart = useCallback(() => {
    setMode("play");
  }, []);

  const handleSolve = useCallback(async () => {
    setIsSolving(true);
    setFourByFourUnsolved(false);
    try {
      if (gridSize === 4 || gridSize === 5) {
        // Plays the move for real (see customSolvePlayback.ts) -- there's no
        // letter-notation move history to hint against for a 4x4x4/5x5x5
        // (see cubeState.ts), so the plan is recomputed fresh every press.
        // The 5x5x5 path caches a Plan across presses instead of
        // recomputing everything from scratch each time (see
        // fiveByFiveEdgeSolverEngine.ts) -- solveNextFiveByFive still goes
        // stale-safely if the user's own swipes diverge from it, since the
        // engine itself detects that via a state hash and rebuilds.
        const result = gridSize === 4 ? await cubeRef.current?.solveNextFourByFour() : await cubeRef.current?.solveNextFiveByFive();
        setSolveError(false);
        // Reflects the PLAN's own solved flag directly, not gated on
        // whether there happened to be a move to preview -- a scramble the
        // solver can't fully resolve still produces plenty of legitimate
        // moves every single recompute, so hasMove stays true forever and
        // the earlier version of this check never surfaced the warning at
        // all for exactly the case it was meant to catch.
        setFourByFourUnsolved(result ? !result.solved : true);
      } else {
        await cubeRef.current?.solveNextMove();
        setSolveError(false);
      }
    } catch {
      // The solver is a third-party library reached through an experimental
      // API — keep the button from getting stuck disabled forever if it
      // ever throws for a reason we haven't seen yet.
      setSolveError(true);
    } finally {
      setIsSolving(false);
    }
  }, [gridSize]);

  if (screen === "home") {
    return (
      <div className="app">
        <div className="above-cube">
          <header className="app-header">
            <CubixxLogo />
          </header>
        </div>

        <div className="cube-stage">
          <CubeView
            orbitMode={false}
            interactive={false}
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
          <button type="button" className="leaderboard-text-link" onClick={handleOpenLeaderboardFromHome}>
            리더보드 보기
          </button>
        </div>
      </div>
    );
  }

  if (screen === "leaderboard") {
    return (
      <div className="app">
        <header className="app-header with-back">
          <button type="button" className="home-link" onClick={handleLeaderboardBack}>
            ← 뒤로
          </button>
        </header>

        <div className="leaderboard-page">
          <div className="leaderboard-tabs">
            {[2, 3, 4, 5].map((size) => (
              <button
                key={size}
                type="button"
                className={`btn3d ${SIZE_COLORS[size]}${leaderboardSize === size ? " selected" : ""}`}
                onClick={() => handleSelectLeaderboardTab(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>

          {leaderboard.length === 0 ? (
            <p className="leaderboard-empty">아직 기록이 없어요 — 스크램블 후 풀어보세요!</p>
          ) : (
            <>
              <p className="leaderboard-caption">이동수가 적을수록 상위예요</p>
              <ol className="leaderboard-list">
                {leaderboard.map((entry, index) => (
                  <li
                    key={`${entry.date}-${index}`}
                    className={leaderboardSize === gridSize && lastRank === index + 1 ? "leaderboard-new" : ""}
                  >
                    <span className={`leaderboard-rank rank-${index < 3 ? index + 1 : "other"}`}>{index + 1}</span>
                    <span className="leaderboard-name-date">
                      <span className="leaderboard-nickname">{entry.nickname}</span>
                      <span className="leaderboard-date">{formatEntryDate(entry.date)}</span>
                    </span>
                    <span className="leaderboard-moves">{entry.moves}수</span>
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
              ? "다음 수 계산 중... (처음 누르면 몇 분 걸릴 수 있어요)"
              : gridSize === 5
                ? "다음 수 계산 중... (처음 누르면 몇 초 걸릴 수 있어요)"
                : "다음 수 진행 중..."
            : solveError
              ? "솔버 실행 중 오류가 발생했습니다. 다시 시도해보세요"
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
      </div>

      <div className="bottom-controls">
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
              ? "다음 수를 바로 진행해요 (일부 스크램블은 여러 번 눌러야 끝까지 풀릴 수 있어요)"
              : gridSize === 4
                ? "다음 수를 바로 진행해요"
                : undefined
          }
        >
          솔브
        </button>
        <button type="button" className="btn3d btn-rose" onClick={handleScramble} disabled={isSolving}>
          스크램블
        </button>
        <button type="button" className="btn3d btn-slate" onClick={handleUndo} disabled={isSolving || moveCount === 0}>
          실행취소
        </button>
      </div>

      {showCompletionModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>🎉 완성!</h2>
            <p className="modal-summary">
              <strong>
                {gridSize}×{gridSize}
              </strong>{" "}
              · 이동수 <strong>{moveCount}</strong>
            </p>
            <input
              type="text"
              className="nickname-input"
              placeholder="닉네임을 입력하세요"
              maxLength={12}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn3d btn-green" onClick={handleRegisterScore}>
                리더보드 등록
              </button>
              <button type="button" className="modal-later" onClick={handleSkipRegister}>
                나중에 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
