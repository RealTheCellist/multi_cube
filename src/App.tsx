import { useCallback, useRef, useState } from "react";
import confetti from "canvas-confetti";
import CubeView, { type CubeViewHandle } from "./CubeView";
import { formatTime, useTimer } from "./useTimer";
import "./App.css";

function App() {
  const cubeRef = useRef<CubeViewHandle>(null);
  const timer = useTimer();

  const [moveCount, setMoveCount] = useState(0);
  const [, setHasScrambled] = useState(false);
  const [justSolved, setJustSolved] = useState(false);

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
    setJustSolved(false);
    setMoveCount(0);
    timer.reset();
    await cubeRef.current?.scramble();
    setHasScrambled(true);
  }, [timer]);

  const handleReset = useCallback(() => {
    cubeRef.current?.resetToSolved();
    setJustSolved(false);
    setMoveCount(0);
    setHasScrambled(false);
    timer.reset();
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

      <div className="cube-stage">
        <CubeView
          ref={cubeRef}
          onMoveCountChange={handleMoveCountChange}
          onFirstMove={handleFirstMove}
          onSolvedChange={handleSolvedChange}
        />
        {justSolved && <div className="solved-banner">Solved! 🎉</div>}
      </div>

      <div className="controls">
        <button type="button" className="primary" onClick={handleScramble}>
          스크램블
        </button>
        <button type="button" onClick={handleReset}>
          리셋
        </button>
      </div>
    </div>
  );
}

export default App;
