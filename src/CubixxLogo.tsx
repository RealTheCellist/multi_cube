import type { CSSProperties } from "react";
import "./CubixxLogo.css";

// Front/right/back/left/top/bottom face placements for a standard cube net,
// each carrying one CUBIXX letter + its design-spec color.
const FACES: { ch: string; color: string; rx: number; ry: number }[] = [
  { ch: "C", color: "#d97a3a", rx: 0, ry: 0 },
  { ch: "U", color: "#5c8a5a", rx: 0, ry: 90 },
  { ch: "B", color: "#f0d9a8", rx: 0, ry: 180 },
  { ch: "I", color: "#c9584e", rx: 0, ry: -90 },
  { ch: "X", color: "#4a90c4", rx: 90, ry: 0 },
  { ch: "X", color: "#e0a05a", rx: -90, ry: 0 },
];

const CUBE_HALF = 30;
const ROW_STEP = 44;

type FaceStyle = CSSProperties & Record<`--${string}`, string>;

export default function CubixxLogo() {
  return (
    <div className="cubixx-wrap" role="img" aria-label="CUBIXX">
      <div className="cubixx-rig">
        {FACES.map((face, i) => {
          const style: FaceStyle = {
            "--assembled-rx": `${face.rx}deg`,
            "--assembled-ry": `${face.ry}deg`,
            "--tz": `${CUBE_HALF}px`,
            "--row-x": `${(i - (FACES.length - 1) / 2) * ROW_STEP}px`,
            "--wave-delay": `${i * 0.08}s`,
          };
          return (
            <div className="cubixx-face" style={style} key={i}>
              <span className="cubixx-face-inner" style={{ background: face.color }}>
                {face.ch}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
