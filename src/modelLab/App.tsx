import { useEffect, useRef, useState } from "react";
import { attachCustomSwipeTurning, type CustomSwipeController } from "../customCube/customSwipeControls";
import { deltaLogModel } from "../customCube/customCubeExperiments/DeltaLogModel";
import { discreteTwistModel } from "../customCube/customCubeExperiments/DiscreteTwistModel";
import { slotCycleModel } from "../customCube/customCubeExperiments/SlotCycleModel";
import type { CubeModel } from "../customCube/customCubeExperiments/ExperimentTypes";
import { ExperimentCubeScene } from "./ExperimentCubeScene";
import "./modelLab.css";

const MODEL_LIST: { key: string; label: string; model: CubeModel<unknown>; blurb: string }[] = [
  { key: "delta-log", label: "Delta-Log", model: deltaLogModel as CubeModel<unknown>, blurb: "체크포인트 + 턴 로그만 저장, 필요할 때 재생" },
  { key: "discrete-twist", label: "Discrete-Twist", model: discreteTwistModel as CubeModel<unknown>, blurb: "방향을 24개 회전군 인덱스(정수 1개)로 저장" },
  { key: "slot-cycle", label: "Slot-Cycle", model: slotCycleModel as CubeModel<unknown>, blurb: "gridSize당 1회 계산해 둔 슬롯 순열표를 정수 배열로만 적용" },
];

const GRID_SIZE = 3;

function ModelLabApp() {
  const [modelKey, setModelKey] = useState(MODEL_LIST[0].key);
  const [orbitMode, setOrbitMode] = useState(false);
  const [moveCount, setMoveCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ExperimentCubeScene<unknown> | null>(null);
  const controllerRef = useRef<CustomSwipeController | null>(null);
  const moveCountRef = useRef(0);
  const orbitModeRef = useRef(orbitMode);
  orbitModeRef.current = orbitMode;

  const activeModel = MODEL_LIST.find((m) => m.key === modelKey)!;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    moveCountRef.current = 0;
    setMoveCount(0);
    const scene = new ExperimentCubeScene(container, GRID_SIZE, activeModel.model);
    sceneRef.current = scene;
    scene.setOrbitEnabled(orbitModeRef.current);

    const controller = attachCustomSwipeTurning(scene, moveCountRef);
    controller.setEnabled(!orbitModeRef.current);
    controller.onCommit = (count) => setMoveCount(count);
    controllerRef.current = controller;

    return () => {
      controller.detach();
      controllerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(orbitMode);
    controllerRef.current?.setEnabled(!orbitMode);
  }, [orbitMode]);

  const handleReset = () => {
    sceneRef.current?.resetToSolved();
    moveCountRef.current = 0;
    setMoveCount(0);
  };

  return (
    <div className="lab-app">
      <header className="lab-header">
        <h1>Cube Model Lab</h1>
        <p>3x3x3 · 실제 프로덕션 스와이프 판정 로직을 그대로 사용합니다</p>
      </header>

      <div className="lab-model-picker">
        {MODEL_LIST.map((m) => (
          <button key={m.key} type="button" className={`lab-model-btn${m.key === modelKey ? " selected" : ""}`} onClick={() => setModelKey(m.key)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="lab-blurb">{activeModel.blurb}</p>

      <div className="lab-stage">
        <div className="lab-cube-view" ref={containerRef} />
      </div>

      <div className="lab-stat-row">
        <div className="lab-stat">
          <span className="lab-stat-label">이동수</span>
          <span className="lab-stat-value">{moveCount}</span>
        </div>
      </div>

      <div className="lab-controls">
        <button type="button" className={`lab-btn${orbitMode ? " selected" : ""}`} onClick={() => setOrbitMode(true)}>
          둘러보기
        </button>
        <button type="button" className={`lab-btn${!orbitMode ? " selected" : ""}`} onClick={() => setOrbitMode(false)}>
          스와이프
        </button>
        <button type="button" className="lab-btn lab-btn-reset" onClick={handleReset}>
          리셋
        </button>
      </div>
    </div>
  );
}

export default ModelLabApp;
