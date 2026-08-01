// Poly Puzzle Solver SDK -- JS Bridge
//
// This module is the ONLY new code that touches the frozen Solver Engine
// (Baseline V1.0, commit 1df58b6). It imports FiveByFiveEdgeSolverEngine
// directly from src/customCube -- never copies or reimplements it -- so the
// iOS app always runs the exact same, already-validated solve() logic that
// Continuous Validation Framework and Long-term Reliability Validation
// measured. Nothing in src/customCube is modified by this Sprint.
//
// Marshaling contract: JSON string in, JSON string out. THREE.Vector3 /
// THREE.Quaternion (which Cubie/Sticker require) are not JSON-serializable
// on their own, so this module reconstructs real THREE objects from plain
// {x,y,z}/{x,y,z,w} JSON on the way in, and flattens them back to plain
// numbers on the way out. JSON-string marshaling (rather than passing JS
// objects directly across the bridge) is used because it is the one calling
// convention JavaScriptCore's JSContext supports uniformly for both
// directions without extra native shims.
import * as THREE from "three";
import type { Cubie, Face, Sticker } from "../../src/customCube/cubeState";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../../src/customCube/fiveByFiveEdgeSolverEngine";
import type { EvaluatorWeights } from "../../src/customCube/fiveByFiveEdgeEvaluator";

export interface JsonVec3 {
  x: number;
  y: number;
  z: number;
}

export interface JsonQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface JsonSticker {
  direction: JsonVec3;
  color: Face;
}

export interface JsonCubie {
  id: number;
  originalPosition: JsonVec3;
  position: JsonVec3;
  orientation: JsonQuat;
  stickers: JsonSticker[];
}

export interface SolveBridgeRequest {
  cubies: JsonCubie[];
  weights?: EvaluatorWeights;
  endgameReserveMs?: number;
  recoveryReserveMsOverride?: number;
}

export interface SolveBridgeMove {
  axis: "x" | "y" | "z";
  layer: number;
  sign: 1 | -1;
}

export interface SolveBridgeTask {
  id: number;
  type: string;
  description: string;
  targetEdge: number;
  score: number;
}

export interface SolveBridgeTrace {
  at: number;
  label: string;
  detail?: string;
}

export interface SolveBridgeResponse {
  ok: true;
  stateHash: number;
  score: number;
  createdAt: number;
  tasks: SolveBridgeTask[];
  moveQueue: SolveBridgeMove[];
  trace: SolveBridgeTrace[];
}

export interface SolveBridgeError {
  ok: false;
  errorCode: string;
  errorMessage: string;
}

function jsonToCubie(json: JsonCubie): Cubie {
  return {
    id: json.id,
    originalPosition: new THREE.Vector3(json.originalPosition.x, json.originalPosition.y, json.originalPosition.z),
    position: new THREE.Vector3(json.position.x, json.position.y, json.position.z),
    orientation: new THREE.Quaternion(json.orientation.x, json.orientation.y, json.orientation.z, json.orientation.w),
    stickers: json.stickers.map(
      (s): Sticker => ({
        direction: new THREE.Vector3(s.direction.x, s.direction.y, s.direction.z),
        color: s.color,
      })
    ),
  };
}

function moveToJson(move: readonly [string, number, 1 | -1]): SolveBridgeMove {
  return { axis: move[0] as "x" | "y" | "z", layer: move[1], sign: move[2] };
}

let warmedUp = false;

/**
 * Called once, eagerly, on app/service startup -- mirrors the web app's own
 * warmup() call site (App.tsx) so the first real solve() on iOS doesn't pay
 * the ~1.3s cold-build cost documented in fiveByFiveEdgeSolverEngine.ts's
 * own warmupFiveByFiveEdgeLibraries comment.
 */
export function warmup(): void {
  if (warmedUp) return;
  warmupFiveByFiveEdgeLibraries();
  warmedUp = true;
}

/**
 * Pure JSON in / JSON out entry point. Never throws -- catches everything
 * and returns a SolveBridgeError JSON so a native caller (Swift) always gets
 * a well-formed response it can decode with a single Codable type.
 */
export function solveBridge(requestJson: string): string {
  try {
    const request = JSON.parse(requestJson) as SolveBridgeRequest;
    if (!Array.isArray(request.cubies) || request.cubies.length === 0) {
      const err: SolveBridgeError = { ok: false, errorCode: "INVALID_INPUT", errorMessage: "cubies must be a non-empty array" };
      return JSON.stringify(err);
    }
    warmup();
    const cubies = request.cubies.map(jsonToCubie);
    const engine = new FiveByFiveEdgeSolverEngine();
    const plan = engine.solve(cubies, request.weights, request.endgameReserveMs, request.recoveryReserveMsOverride);
    const response: SolveBridgeResponse = {
      ok: true,
      stateHash: plan.stateHash,
      score: plan.score,
      createdAt: plan.createdAt,
      tasks: plan.tasks.map((t) => ({ id: t.id, type: t.type, description: t.description, targetEdge: t.targetEdge, score: t.score })),
      moveQueue: plan.moveQueue.map(moveToJson),
      trace: engine.getTrace().map((t) => ({ at: t.at, label: t.label, detail: t.detail })),
    };
    return JSON.stringify(response);
  } catch (e) {
    const err: SolveBridgeError = {
      ok: false,
      errorCode: "SOLVE_THREW",
      errorMessage: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
    return JSON.stringify(err);
  }
}

declare const globalThis: { PolyPuzzleSolverBridge?: unknown } & typeof global;

// Exposed as a single global object so a JavaScriptCore JSContext can call
// `PolyPuzzleSolverBridge.solve(jsonString)` / `.warmup()` without any
// module-resolution machinery (JSContext has no import/require).
globalThis.PolyPuzzleSolverBridge = { solve: solveBridge, warmup };
