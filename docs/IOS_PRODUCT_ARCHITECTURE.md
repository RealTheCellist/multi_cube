# Cube Solver iOS Productization Sprint v1 — Product Architecture

> **SUPERSEDED (tech stack only)** — see `docs/FLUTTER_DECISION_REVISION.md`.
> The `ios/PolyPuzzleCube/` SwiftUI app and `solver_sdk/ios/` Swift Package
> described below were replaced by a Flutter app (`mobile/`) once the user
> confirmed a real, near-term Android release goal. The Bridge Verification
> findings, protected-file discipline, and "never reimplement the Solver
> Engine" rule below are all unaffected and still accurate — only the
> consuming UI/SDK layer changed. Kept as-is for historical record.

Baseline this Sprint builds on top of, unmodified:
`docs/SOLVER_BASELINE_V1.md` (commit `1df58b6`). Protected files (Solver
Engine / Primitive / Scheduler / Budget / Recovery Pipeline / Validation
Framework / Operating Contract / Release Gates — everything under
`src/customCube/` that the Baseline freezes) were not touched by this
Sprint; see §Verification below.

## 0. Environment disclosure (read this first)

This Sprint ran in a Linux container: no Xcode, no macOS, no Swift
compiler, no iOS Simulator (`which swift` / `which xcodebuild` both resolve
to nothing — see `solver_sdk/ios/Package.swift`'s own note). Every
`.swift` file in this Sprint is written to be correct by inspection and by
matching a JSON contract independently verified under real execution (see
§Bridge Verification), but **none of it has been compiled or run**.
`docs/IOS_DEPLOYMENT_GUIDE.md` starts from exactly this point and lists the
concrete steps a macOS+Xcode environment must run to close that gap.

This is a deliberate scope decision, not an oversight: the project's
established discipline (`docs/SOLVER_MAINTENANCE_POLICY.md`,
`docs/SOLVER_RESEARCH_CLOSEOUT.md`'s Known Limitation Register) never
reports a "real run" that didn't happen. Sections below are marked
**[VERIFIED]** where something real was actually executed, and
**[UNVERIFIED — spec only]** where it wasn't.

## 1. Two architecture decisions made this Sprint

The directive raised two open questions rather than dictating one answer.
Both were decided here, not left pending, because STEP1 code cannot be
written without them:

### Decision 1 — Tech stack: native SwiftUI, not Flutter

The directive's own STEP1–STEP6 body already assumes native tooling
throughout (a Swift interface, SwiftUI Architecture, Xcode Archive, App
Store Connect) — Flutter was raised only as a closing consideration tied to
a *future* Android port. Version 1.0 is explicitly iOS-only per the
directive's own "iOS First Strategy" framing, so Flutter's main benefit
(shared code across iOS+Android) doesn't apply yet. **Chosen: SwiftUI**,
consistent with the directive's own STEP bodies. If/when a Roadmap Sprint
green-lights an Android port, that Sprint is the right place to re-open
this decision — Flutter is not foreclosed, just not chosen for V1.0.

### Decision 2 — Bridging: JavaScriptCore embedding, not a Swift port

The Solver Engine is written in TypeScript
(`src/customCube/fiveByFiveEdgeSolverEngine.ts` and its imports) and is
**protected** — this Sprint's directive explicitly lists it as never to be
modified. A full Swift reimplementation was considered and rejected:
- It would be a second, independently-written implementation of the same
  algorithm, with no way to verify it matches the original bit-for-bit
  without redoing everything `docs/SOLVER_LONG_TERM_RELIABILITY_VALIDATION.md`
  and `docs/SOLVER_CONTINUOUS_VALIDATION_FRAMEWORK.md` already measured
  against the TypeScript original.
- Every future Maintenance Sprint fix
  (`docs/SOLVER_MAINTENANCE_POLICY.md`'s event-driven flow) would need
  manual porting to stay in sync, or the two platforms silently diverge.

**Chosen: JavaScriptCore.** iOS ships JavaScriptCore on every device at zero
extra dependency cost. `solver_sdk/bridge/PolyPuzzleSolverBridge.ts`
imports `FiveByFiveEdgeSolverEngine` directly from `src/customCube` (a plain
`import`, never a copy) and is bundled with esbuild into one
dependency-free JS file (`solver_sdk/dist/PolyPuzzleSolverBridge.bundle.js`,
409KB) that a Swift `JSContext` evaluates. The web app and the iOS app run
the literal same bits.

## 2. Bridge Verification [VERIFIED — real, under Node]

JavaScriptCore itself is unavailable on Linux, so full on-device
verification is impossible here. What *was* run for real (not simulated):
the bundled JS file executed inside Node's `vm` module (an isolated sandbox
comparable in structure to a `JSContext` — no access to this process's own
`require`/`fs`), driven by real 5x5 cube states built via the actual
`buildSolvedCube` / `randomLayerScramble` (`cubeState.ts`) production
functions.

Results (`solver_sdk/bridge/smokeTest.mjs`, `smokeTest2.mjs`):

| Scramble length | Runs | stateHash match | Full plan match (score/moves/tasks) |
|---|---|---|---|
| 5 moves | 1 | 100% | 100% |
| 10 moves | 1 | 100% | 0% (see below) |
| 15 moves | 1 | 100% | 0% (see below) |
| 40 moves (x5) | 5 | 100% | 40% (2/5) |

**`stateHash` matched on every single run** — this is the strongest signal
available that the JSON marshal/demarshal round-trip (`SolverVec3`/
`SolverQuat`/`SolverCubie` reconstructing real `THREE.Vector3`/
`THREE.Quaternion` instances from JSON) is byte-correct: `stateHash` is
computed from the reconstructed cube, so any marshaling bug would show up
there first, immediately, on every input.

The **plan divergence on longer scrambles is not a bridge defect.**
`solve()` is wall-clock time-budgeted (`PLAN_TIME_BUDGET_MS=1000ms`,
hardcoded, `fiveByFiveEdgeSolverEngine.ts`) — this project's own
`docs/SOLVER_LONG_TERM_RELIABILITY_VALIDATION.md` already established and
disclosed that determinism only holds for cases that don't reach
budget-sensitive Recovery logic. Running the identical bundle inside a `vm`
sandbox vs. calling the TypeScript directly changes real per-instruction
overhead, so the same 1000ms wall clock buys a different amount of real
work done — exactly the same property that makes two runs of the *unmodified
web app itself* non-deterministic on hard scrambles. The 5-move case (well
within budget headroom regardless of host speed) matched 100%, confirming
the effect is timing-driven, not structural.

**Practical implication for on-device behavior**: JavaScriptCore's real
execution speed on an actual iPhone (not measured — no device/simulator
available) determines how close on-device solve() output tracks the
TypeScript reference on hard scrambles, same as it would for any other
host. This is a property of `PLAN_TIME_BUDGET_MS` being a *wall-clock*
budget, disclosed here rather than hidden, and not something the SDK can or
should paper over.

## 3. iOS Architecture (STEP2)

```
SwiftUI (Features/*)
      |
Application Layer (ViewModels + AppNavigator + AppContainer)
      |
Solver SDK (PolyPuzzleSolverSDK: SolverService, Solver*Model.swift)
      |
Solver Engine (JSContext running PolyPuzzleSolverBridge.bundle.js,
               which is esbuild(PolyPuzzleSolverBridge.ts + src/customCube/*))
```

- **MVVM**: each feature (`CubeInput`, `Solve`, `Solution`, `Playback`) is a
  SwiftUI View + (where there's real async state) a `ViewModel:
  ObservableObject`. `Home`/`Solution`/`Playback` are simple enough to skip
  a dedicated ViewModel (no async work) — MVVM applied where it earns its
  keep, not uniformly.
- **Navigation**: `AppNavigator` (`ObservableObject`, `@Published path:
  [AppRoute]`) drives a single `NavigationStack(path:)` — one flat,
  hashable route enum (`AppRoute`), matching the directive's
  Home→CubeInput→Solve→Solution→Playback flow exactly.
- **State management**: `@StateObject`/`@EnvironmentObject`, no external
  state library — the app's state graph is small enough (5 screens, one
  shared service) that a framework would be overhead, consistent with this
  project's own "no abstraction beyond what the task requires" convention.
- **DI**: `AppContainer` (constructor injection, no framework) owns the one
  real dependency, `SolverService`. `SolveView` receives it explicitly
  through its own initializer, sidestepping the well-known
  `@EnvironmentObject`-unavailable-in-`init` SwiftUI limitation instead of
  working around it with an Optional/lazy-init box.
- **Error handling**: `SolverError` (`Error`, `LocalizedError`) is the one
  error type crossing the SDK boundary; `ErrorBanner` is the one shared
  presentation view. No per-screen ad hoc error types.

## 4. Known Limitations (disclosed, not silently absorbed)

1. **No live in-app scramble generator.** `CubeInputView` offers 5 real,
   pre-captured cube states (1 solved + 4 scrambles) rather than a live
   scrambler, because a live one would require porting `cubeMath.ts`'s
   quarter-turn rotation math into Swift a second time with no
   device/simulator in this Sprint to verify it against. See
   `SolverFixtureCubies.swift`'s own comment. Candidate for a follow-up
   Sprint once a macOS+Xcode environment is available to test against.
2. **No 3D cube renderer.** `PlaybackView` shows each move as text
   (`x2+`, `y0-`, …) rather than an animated cube, for the same
   no-device-to-verify-against reason. `docs/SOLVER_OPERATION_GUIDE.md`'s
   own web app already has a working Three.js renderer
   (`src/customCube/`'s scene code) that a future Sprint could port once
   Swift/RealityKit or SceneKit code can actually be built and run.
3. **No camera-based cube color capture.** The directive's STEP3 minimum
   feature list says "Cube 입력" without specifying camera scanning; this
   Sprint interpreted that as satisfied by fixture selection, not Vision
   framework color recognition (a materially larger, unverifiable-here
   scope).
4. **Assets are specs, not files** — see `assets/*/README.md`.
5. **No Xcode project file** (`.xcodeproj`/`.xcworkspace`) was generated —
   `solver_sdk/ios/` is a Swift Package (buildable with `swift build`/`swift
   test` on macOS on its own), but wiring `ios/PolyPuzzleCube/` into an
   actual iOS app target requires Xcode's project generation, which this
   Sprint's tooling cannot produce or verify. See
   `docs/IOS_DEPLOYMENT_GUIDE.md` STEP1.

## 5. Decision

Per Level1 (Solver SDK Packaging), Level2 (iOS Architecture), Level3 (iOS
UI minimum features) — **all three are code-complete and internally
consistent**, but Level4 (an actual buildable, tested app) is **not**
reachable in this Sprint's environment. See
`docs/VERSION_1_0_RELEASE_NOTE.md` for the overall Sprint decision, which
reflects this honestly rather than claiming
"Ready for Apple App Store Submission" without the verification to back it.
