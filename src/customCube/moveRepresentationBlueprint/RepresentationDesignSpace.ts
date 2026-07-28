// --- RepresentationDesignSpace (Move Representation Blueprint Sprint v1,
// Required Analysis #1) ------------------------------------------------------
// Candidate Move Representations considered for closing the gap Move
// Representation Gap Analysis Sprint v1 measured (0/418 CYCLE_ROTATION_
// IMPROVING candidates -- the current Single-Wing unit cannot express a
// net-improving move for a pure isolated cycle). Definitions only -- no
// implementation.
export interface RepresentationCandidate {
  id: string;
  name: string;
  description: string;
  minWingUnit: "fixed" | "adaptive";
  unitSize: number | "cycleLength"; // "cycleLength" = adapts to each case's own measured cycle length
}

export const REPRESENTATION_CANDIDATES: RepresentationCandidate[] = [
  {
    id: "PAIR_MOVE",
    name: "Pair Move",
    description: "두 wing을 동시에 맞바꾸는 고정 크기(2) 이동 단위 -- 현재 LOCKED_PAIR(2-cycle) 형태만 정확히 겨냥.",
    minWingUnit: "fixed",
    unitSize: 2,
  },
  {
    id: "MULTI_WING_FIXED3",
    name: "Multi-Wing Move (fixed k=3)",
    description: "3개 wing을 동시에 재배치하는 고정 크기 이동 단위 -- 3-cycle을 한 번에 겨냥, 4+ cycle은 반복 적용 필요.",
    minWingUnit: "fixed",
    unitSize: 3,
  },
  {
    id: "CYCLE_ROTATION",
    name: "Cycle Rotation",
    description: "대상 cycle의 실제 길이(N)에 맞춰 N개 wing 전체를 한 번에 목표 위치로 순환 재배치하는 적응형 이동 단위 -- analyzeMultiCycle()이 이미 제공하는 cycle 순서를 그대로 재사용.",
    minWingUnit: "adaptive",
    unitSize: "cycleLength",
  },
  {
    id: "COMMUTATOR_MOVE",
    name: "Commutator Move",
    description: "Setup(S) + 좁은 3-cycle 전용 알고리즘(E) + Setup 역연산(S^-1) 조합으로, cycle 내 2~3개 wing만 재배치하고 나머지는 원상복구하는 이동 단위 -- 큐빙 이론의 표준 기법.",
    minWingUnit: "adaptive",
    unitSize: "cycleLength",
  },
];
