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
  const [moveCount, setMoveCount] = useState(0);
  const [, setHasScrambled] = useState(false);
  const [justSolved, setJustSolved] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [lastHint, setLastHint] = useState<SolveHintDisplay | null>(null);
  const [solveUnsupported, setSolveUnsupported] = useState(false);

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
    setSolveUnsupported(false);
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
    setSolveUnsupported(false);
    setHasScrambled(false);
    timer.reset();
  }, [timer]);

  const handleLookAround = useCallback(() => {
    setMode("look");
  }, []);

  const handleStart = useCallback(() => {
    setMode("play");
  }, []);

  const handleSolve = useCallback(async () => {
    const wasTimerRunning = timer.running;
    if (wasTimerRunning) timer.pause();
    setIsSolving(true);
    const hint = await cubeRef.current?.solveNextMove();
    setIsSolving(false);
    setSolveUnsupported(!!hint?.unsupported);
    setLastHint(hint?.move ? { move: hint.move, movesRemaining: hint.movesRemaining } : null);
    if (wasTimerRunning) timer.resume();
  }, [timer]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Poly Puzzle</h1>
        <p className="subtitle">정6면체 3×3 프로토타입</p>
      </header>

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
          ? "다음 수 미리보기 재생 중..."
          : solveUnsupported
            ? "가운데줄(M/E/S) 이동이 포함된 상태는 솔버가 지원하지 않습니다"
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
        <button type="button" onClick={handleSolve} disabled={isSolving}>
          솔버
        </button>
      </div>
    </div>
  );
}

export default App;
