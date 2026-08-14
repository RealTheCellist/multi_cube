import { useEffect, useRef, useState } from "react";
import { CustomTetraScene } from "../customTetra/CustomTetraScene";
import type { VertexIndex } from "../customTetra/tetraMath";
import "./tetraLab.css";

const LAYER_COUNTS = [3, 4, 5, 6];
const VERTEX_LABELS = ["0 (apex)", "1", "2", "3"];
const TURN_ANIMATION_MS = 300;

function TetraLabApp() {
  const [layerCount, setLayerCount] = useState(3);
  const [solved, setSolved] = useState(true);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CustomTetraScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new CustomTetraScene(container, layerCount);
    sceneRef.current = scene;
    setSolved(scene.isSolved());

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [layerCount]);

  const refreshSolved = () => setSolved(sceneRef.current?.isSolved() ?? false);

  // Buttons drive the exact same beginTurn/setTurnProgress/endTurn contract
  // a future swipe controller would -- this just animates progress on a
  // timer instead of reading it off a drag gesture, so it proves the turn
  // math/rendering is correct without needing gesture-recognition code yet.
  const doTurn = (vertexIndex: VertexIndex, depth: number, sign: 1 | -1) => {
    const scene = sceneRef.current;
    if (!scene || animating) return;
    if (!scene.beginTurn(vertexIndex, depth)) return;
    setAnimating(true);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TURN_ANIMATION_MS);
      scene.setTurnProgress(t * sign);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        scene.endTurn(sign);
        setAnimating(false);
        refreshSolved();
      }
    };
    requestAnimationFrame(step);
  };

  const handleReset = () => {
    sceneRef.current?.resetToSolved();
    refreshSolved();
  };

  const handleScramble = () => {
    sceneRef.current?.scramble();
    refreshSolved();
  };

  const depths = Array.from({ length: layerCount - 1 }, (_, i) => i + 1);

  return (
    <div className="lab-app">
      <header className="lab-header">
        <h1>Tetra Model Lab</h1>
        <p>사면체 지오메트리/회전 모델 검증 하네스 -- 스와이프 아님, 버튼으로만 조작</p>
      </header>

      <div className="lab-model-picker">
        {LAYER_COUNTS.map((n) => (
          <button key={n} type="button" className={`lab-model-btn${n === layerCount ? " selected" : ""}`} onClick={() => setLayerCount(n)}>
            {n}레이어
          </button>
        ))}
      </div>

      <div className="lab-stage">
        <div ref={containerRef} className="lab-tetra-view" />
      </div>

      <div className="lab-stat-row">
        <div className="lab-stat">
          <span className="lab-stat-label">Solved</span>
          <span className={`lab-stat-value ${solved ? "lab-solved-yes" : "lab-solved-no"}`}>{solved ? "YES" : "NO"}</span>
        </div>
      </div>

      <div className="lab-controls">
        <button type="button" className="lab-btn lab-btn-reset" onClick={handleReset} disabled={animating}>
          리셋
        </button>
        <button type="button" className="lab-btn" onClick={handleScramble} disabled={animating}>
          스크램블
        </button>
      </div>

      <div className="lab-turn-grid">
        {([0, 1, 2, 3] as VertexIndex[]).map((v) => (
          <div key={v} className="lab-turn-row">
            <span className="lab-turn-vertex">V{VERTEX_LABELS[v]}</span>
            {depths.map((d) => (
              <div key={d} className="lab-turn-depth-group">
                <button type="button" className="lab-turn-btn" onClick={() => doTurn(v, d, -1)} disabled={animating}>
                  d{d} ↺
                </button>
                <button type="button" className="lab-turn-btn" onClick={() => doTurn(v, d, 1)} disabled={animating}>
                  d{d} ↻
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TetraLabApp;
