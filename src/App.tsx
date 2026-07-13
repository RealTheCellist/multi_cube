import { useCallback, useRef, useState } from "react";
import confetti from "canvas-confetti";
import CubeView, { type CubeViewHandle } from "./CubeView";
import { formatTime, useTimer } from "./useTimer";
import "./App.css";

interface SolveHintDisplay {
  move: string;
  movesRemaining: number;
}

function App() {
  const cubeRef = useRef<CubeViewHandle>(null);
  const timer = useTimer();

  const [mode, setMode] = useState<"look" | "play">("look");
  const [gridSize, setGridSize] = useState(3);
  const [moveCount, setMoveCount] = useState(0);
  const [, setHasScrambled] = useState(false);
  const [justSolved, setJustSolved] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [lastHint, setLastHint] = useState<SolveHintDisplay | null>(null);
  const [fourByFourHint, setFourByFourHint] = useState(false);
  const [solveError, setSolveError] = useState(false);
  const [fourByFourUnsolved, setFourByFourUnsolved] = useState(false);

  const handleMoveCountChange = useCallback((count: number) => {
    setMoveCount(count);
  }, []);

  const handleFirstMove = useCallback(() => {
    timer.start();
  }, [timer]);

  const handleSolvedChange = useCallback(
    (solved: boolean) => {
      setHasScrambled((currentlyScrambled) => {
        if (solved && currentlyScrambled) {
          timer.stop();
          setJustSolved(true);
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
          });
          return false;
        }
        return currentlyScrambled;
      });
    },
    [timer],
  );

  const handleScramble = useCallback(async () => {
    setMode("look");
    setJustSolved(false);
    setMoveCount(0);
    setLastHint(null);
    setFourByFourHint(false);
    setSolveError(false);
    setFourByFourUnsolved(false);
    timer.reset();
    await cubeRef.current?.scramble();
    setHasScrambled(true);
  }, [timer]);

  const handleReset = useCallback(() => {
    cubeRef.current?.resetToSolved();
    setMode("look");
    setJustSolved(false);
    setMoveCount(0);
    setLastHint(null);
    setFourByFourHint(false);
    setSolveError(false);
    setFourByFourUnsolved(false);
    setHasScrambled(false);
    timer.reset();
  }, [timer]);

  const handleLookAround = useCallback(() => {
    setMode("look");
  }, []);

  const handleGridSizeChange = useCallback(
    (size: number) => {
      setGridSize(size);
      setMode("look");
      setJustSolved(false);
      setMoveCount(0);
      setLastHint(null);
      setFourByFourHint(false);
      setSolveError(false);
      setFourByFourUnsolved(false);
      setHasScrambled(false);
      timer.reset();
    },
    [timer],
  );

  const handleStart = useCallback(() => {
    setMode("play");
  }, []);

  const handleSolve = useCallback(async () => {
    const wasTimerRunning = timer.running;
    if (wasTimerRunning) timer.pause();
    setIsSolving(true);
    setFourByFourUnsolved(false);
    try {
      if (gridSize === 4) {
        // Same preview-and-revert idea as the 2x2x2/3x3x3 hint below: re-solve
        // from whatever the cube's actual current state is (not a cached
        // plan) and only preview the first move, since there's no letter-
        // notation move history to hint against for a 4x4x4 (see
        // cubeState.ts) -- a cached plan would go stale the moment the
        // user's own swipes diverge from it.
        const hint = await cubeRef.current?.previewNextFourByFour();
        setSolveError(false);
        setFourByFourHint(!!hint?.hasMove);
        if (hint?.hasMove) setFourByFourUnsolved(false);
        else setFourByFourUnsolved(hint ? !hint.solved : true);
      } else {
        const hint = await cubeRef.current?.solveNextMove();
        setSolveError(false);
        setLastHint(hint?.move ? { move: hint.move, movesRemaining: hint.movesRemaining } : null);
      }
    } catch {
      // The solver is a third-party library reached through an experimental
      // API — keep the button from getting stuck disabled forever if it
      // ever throws for a reason we haven't seen yet.
      setSolveError(true);
      setLastHint(null);
    } finally {
      setIsSolving(false);
      if (wasTimerRunning) timer.resume();
    }
  }, [timer, gridSize]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Poly Puzzle</h1>
        <p className="subtitle">정6면체 {gridSize}×{gridSize} 프로토타입</p>
      </header>

      <div className="controls" style={{ marginBottom: "0.5rem" }}>
        {[2, 3, 4].map((size) => (
          <button
            key={size}
            type="button"
            className={gridSize === size ? "primary" : ""}
            onClick={() => handleGridSizeChange(size)}
            disabled={isSolving}
          >
            {size}×{size}
          </button>
        ))}
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">시간</span>
          <span className="stat-value">{formatTime(timer.elapsedMs)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">이동수</span>
          <span className="stat-value">{moveCount}</span>
        </div>
      </div>

      <p className="mode-hint">
        {isSolving
          ? gridSize === 4
            ? "다음 수 미리보기 계산 중... (처음 누르면 몇 분 걸릴 수 있어요)"
            : "다음 수 미리보기 재생 중..."
          : solveError
            ? "솔버 실행 중 오류가 발생했습니다. 다시 시도해보세요"
            : fourByFourUnsolved
              ? "이 스크램블은 아직 끝까지 풀지 못했어요 (패리티 케이스일 수 있어요) — 다시 시도해보세요"
              : fourByFourHint
                ? "다음 수를 미리보기했어요 — 애니메이션을 보고 직접 돌려보세요"
                : lastHint
                  ? `다음 수: ${lastHint.move} (총 ${lastHint.movesRemaining + 1}수 필요) — 직접 돌려보세요`
                  : mode === "look"
                    ? "드래그해서 큐브를 둘러보세요"
                    : "스와이프로 면을 돌려보세요"}
      </p>

      <div className="cube-stage">
        <CubeView
          ref={cubeRef}
          orbitMode={mode === "look"}
          gridSize={gridSize}
          onMoveCountChange={handleMoveCountChange}
          onFirstMove={handleFirstMove}
          onSolvedChange={handleSolvedChange}
        />
        {justSolved && <div className="solved-banner">Solved! 🎉</div>}
      </div>

      <div className="controls">
        <button
          type="button"
          className={mode === "look" ? "primary" : ""}
          onClick={handleLookAround}
          disabled={isSolving}
        >
          둘러보기
        </button>
        <button
          type="button"
          className={mode === "play" ? "primary" : ""}
          onClick={handleStart}
          disabled={isSolving}
        >
          시작하기
        </button>
        <button type="button" onClick={handleScramble} disabled={isSolving}>
          스크램블
        </button>
        <button type="button" onClick={handleReset} disabled={isSolving}>
          리셋
        </button>
        <button
          type="button"
          onClick={handleSolve}
          disabled={isSolving}
          title={gridSize === 4 ? "3×3처럼 다음 수를 미리보기만 해요 (일부 스크램블은 아직 못 풀 수 있어요)" : undefined}
        >
          솔버
        </button>
      </div>
    </div>
  );
}

export default App;
