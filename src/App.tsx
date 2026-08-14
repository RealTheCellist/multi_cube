import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import CubeView, { type CubeViewHandle } from "./CubeView";
import CubixxLogo from "./CubixxLogo";
import { warmupFourByFour } from "./customCube/customSolvePlayback";
import { getDailyScrambleRng, getMissionStatus, MISSION_HINT_LIMITS, recordMissionComplete, type MissionStatus } from "./dailyMission";
import { getLeaderboard, submitScore, type LeaderboardEntry } from "./leaderboard";
import { isRewardedAdAvailable, requestRewardedAd } from "./nativeAds";
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

const MISSION_DIFFICULTY_LABELS: Record<number, string> = {
  2: "이지",
  3: "미들",
  4: "하드",
  5: "엑스하드",
};

const MISSION_AD_BONUS_HINTS = 5;

function App() {
  const cubeRef = useRef<CubeViewHandle>(null);

  const [screen, setScreen] = useState<"home" | "game" | "leaderboard" | "missions">("home");
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

  // Daily mission mode: a fixed, date+size-seeded scramble (same puzzle for
  // everyone, every replay) instead of the usual random one, with a capped
  // number of solve-hint presses (see dailyMission.ts) so the mission can't
  // just be button-mashed to an auto-solve. Independent of the regular
  // per-size leaderboard -- completing a mission never auto-registers there.
  const [missionMode, setMissionMode] = useState(false);
  const [missionHintsUsed, setMissionHintsUsed] = useState(0);
  const [missionCompleteResult, setMissionCompleteResult] = useState<{ streak: number; moves: number; hintsUsed: number } | null>(null);
  // Extra hints earned this attempt by watching a rewarded ad (see
  // nativeAds.ts) -- on top of, not instead of, the size's base budget.
  const [missionBonusHints, setMissionBonusHints] = useState(0);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adUnavailable, setAdUnavailable] = useState(false);

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
  // A mission completion is recorded separately (dailyMission.ts) and never
  // auto-registers to the regular leaderboard -- the two features stay
  // independent.
  const handleSolvedChange = useCallback(
    (solved: boolean) => {
      setHasScrambled((currentlyScrambled) => {
        if (solved && currentlyScrambled) {
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
          });
          if (missionMode) {
            const { streak } = recordMissionComplete(gridSize, moveCount, missionHintsUsed);
            setMissionCompleteResult({ streak, moves: moveCount, hintsUsed: missionHintsUsed });
          } else {
            setShowCompletionModal(true);
          }
          return false;
        }
        return currentlyScrambled;
      });
    },
    [missionMode, gridSize, moveCount, missionHintsUsed],
  );

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
    if (missionMode) {
      // "다시 시도" in mission mode -- re-applies the SAME daily scramble
      // (not a new random one) and gives the hint budget back, since this is
      // restarting today's fixed puzzle, not asking for a different one.
      // Ad-earned bonus hints reset too -- otherwise retrying for free would
      // let them stack across attempts.
      setMissionHintsUsed(0);
      setMissionBonusHints(0);
      setAdUnavailable(false);
      await cubeRef.current?.scramble(getDailyScrambleRng(gridSize));
    } else {
      await cubeRef.current?.scramble();
    }
    setHasScrambled(true);
    setMode("play");
  }, [missionMode, gridSize]);

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

  const resetGameState = useCallback((entersMissionMode = false) => {
    setMode("play");
    setShowCompletionModal(false);
    setMoveCount(0);
    setSolveError(false);
    setFourByFourUnsolved(false);
    setLastRank(null);
    setHasScrambled(false);
    setMissionMode(entersMissionMode);
    setMissionHintsUsed(0);
    setMissionCompleteResult(null);
    setMissionBonusHints(0);
    setIsWatchingAd(false);
    setAdUnavailable(false);
  }, []);

  const handlePickSize = useCallback(
    (size: number) => {
      setGridSize(size);
      resetGameState();
      setScreen("game");
      // Fire-and-forget: gets the 4x4 solver's one-time setup costs (algorithm
      // library, cubing/search's reduction solver) out of the way before the
      // player ever presses "솔브", instead of paying for them on that first
      // press (see warmupFourByFour's own docstring).
      if (size === 4) warmupFourByFour();
    },
    [resetGameState],
  );

  const handlePickMission = useCallback(
    (size: number) => {
      setGridSize(size);
      resetGameState(true);
      // The game screen's CubeView applies today's scramble itself on mount
      // (see its initialScrambleRng prop) -- this just needs to mark "there
      // is a scramble to solve" so handleSolvedChange's completion check
      // (solved && currentlyScrambled) fires correctly.
      setHasScrambled(true);
      setScreen("game");
      if (size === 4) warmupFourByFour();
    },
    [resetGameState],
  );

  // The game screen's own back button: mission mode returns to the mission
  // list (there's no "크기 변경" concept mid-mission -- you picked a
  // specific mission, not a free size), everything else goes home.
  const handleBackFromGame = useCallback(() => {
    if (missionMode) {
      setMissionMode(false);
      setScreen("missions");
    } else {
      setScreen("home");
    }
  }, [missionMode]);

  const handleOpenMissions = useCallback(() => {
    setScreen("missions");
  }, []);

  const handleMissionsBack = useCallback(() => {
    setScreen("home");
  }, []);

  const handleMissionModalClose = useCallback(() => {
    setMissionCompleteResult(null);
    setMissionMode(false);
    setScreen("missions");
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
    if (missionMode) setMissionHintsUsed((n) => n + 1);
  }, [gridSize, missionMode]);

  // A watched ad ("earned") grants MISSION_AD_BONUS_HINTS more hints on top
  // of the size's base budget -- doesn't touch missionHintsUsed, so the
  // completion record still shows exactly how many real hint presses
  // happened either way.
  const handleWatchAdForHint = useCallback(async () => {
    setIsWatchingAd(true);
    setAdUnavailable(false);
    const result = await requestRewardedAd();
    setIsWatchingAd(false);
    if (result === "earned") {
      setMissionBonusHints((n) => n + MISSION_AD_BONUS_HINTS);
    } else {
      setAdUnavailable(true);
    }
  }, []);

  const missionHintLimit = (MISSION_HINT_LIMITS[gridSize] ?? 3) + missionBonusHints;
  const missionHintsExhausted = missionMode && missionHintsUsed >= missionHintLimit;

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
          <button type="button" className="btn3d btn-accent mission-cta" onClick={handleOpenMissions}>
            오늘의 미션
          </button>
          <button type="button" className="leaderboard-text-link" onClick={handleOpenLeaderboardFromHome}>
            리더보드 보기
          </button>
        </div>
      </div>
    );
  }

  if (screen === "missions") {
    return (
      <div className="app">
        <header className="app-header with-back">
          <button type="button" className="home-link" onClick={handleMissionsBack}>
            ← 뒤로
          </button>
        </header>

        <div className="missions-page">
          <p className="missions-caption">매일 자정에 새로운 스크램블 — 모두가 같은 문제를 풀어요</p>
          <div className="missions-list">
            {[2, 3, 4, 5].map((size) => {
              const status: MissionStatus = getMissionStatus(size);
              return (
                <button
                  key={size}
                  type="button"
                  className={`mission-card mission-card-${SIZE_COLORS[size]}${status.completedToday ? " mission-card-done" : ""}`}
                  onClick={() => handlePickMission(size)}
                >
                  <span className="mission-card-size">
                    {size}×{size}
                  </span>
                  <span className="mission-card-difficulty">{MISSION_DIFFICULTY_LABELS[size]}</span>
                  <span className="mission-card-status">
                    {status.completedToday ? `완료 · ${status.todayMoves}수` : `힌트 ${status.hintLimit}개`}
                  </span>
                  {status.streak > 0 && <span className="mission-card-streak">🔥 {status.streak}일 연속</span>}
                </button>
              );
            })}
          </div>
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
          <button type="button" className="home-link" onClick={handleBackFromGame}>
            {missionMode ? "← 미션 목록" : "← 크기 변경"}
          </button>
          {!missionMode && (
            <button type="button" className="home-link leaderboard-link" onClick={handleOpenLeaderboard}>
              리더보드
            </button>
          )}
        </header>

        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">이동수</span>
            <span className="stat-value">{moveCount}</span>
          </div>
        </div>

        {missionMode && (
          <p className="mission-badge">
            오늘의 미션 · 힌트 {Math.max(missionHintLimit - missionHintsUsed, 0)}/{missionHintLimit} 남음
          </p>
        )}

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
                : missionHintsExhausted
                  ? "오늘의 힌트를 다 썼어요 — 여기서부턴 직접 풀어보세요"
                  : ""}
        </p>

        {missionHintsExhausted && isRewardedAdAvailable() && (
          <button type="button" className="btn3d btn-accent watch-ad-btn" onClick={handleWatchAdForHint} disabled={isWatchingAd}>
            {isWatchingAd ? "광고 재생 중..." : `📺 광고 보고 힌트 ${MISSION_AD_BONUS_HINTS}개 더 받기`}
          </button>
        )}
        {adUnavailable && <p className="ad-unavailable-hint">지금은 광고를 불러올 수 없어요 — 잠시 후 다시 시도해보세요</p>}
      </div>

      <div className="cube-stage">
        <CubeView
          ref={cubeRef}
          orbitMode={mode === "look"}
          gridSize={gridSize}
          initialScrambleRng={missionMode ? getDailyScrambleRng(gridSize) : undefined}
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
          disabled={isSolving || missionHintsExhausted}
          title={
            missionMode
              ? `오늘의 미션은 힌트를 ${missionHintLimit}번까지만 쓸 수 있어요`
              : gridSize === 5
                ? "다음 수를 바로 진행해요 (일부 스크램블은 여러 번 눌러야 끝까지 풀릴 수 있어요)"
                : gridSize === 4
                  ? "다음 수를 바로 진행해요"
                  : undefined
          }
        >
          솔브
        </button>
        <button type="button" className="btn3d btn-rose" onClick={handleScramble} disabled={isSolving}>
          {missionMode ? "다시 시도" : "스크램블"}
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

      {missionCompleteResult && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>🎉 오늘의 미션 완료!</h2>
            <p className="modal-summary">
              <strong>
                {gridSize}×{gridSize} · {MISSION_DIFFICULTY_LABELS[gridSize]}
              </strong>
              <br />
              이동수 <strong>{missionCompleteResult.moves}</strong> · 힌트 <strong>{missionCompleteResult.hintsUsed}</strong>개 사용
              <br />
              🔥 <strong>{missionCompleteResult.streak}일</strong> 연속 완료
            </p>
            <div className="modal-actions">
              <button type="button" className="btn3d btn-green" onClick={handleMissionModalClose}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
