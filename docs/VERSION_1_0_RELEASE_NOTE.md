# Cube Solver iOS Productization Sprint v1 — Release Note / Decision

## What this Sprint built

A complete, from-scratch iOS product layer on top of the frozen Solver
Version 1.0 Baseline (`docs/SOLVER_BASELINE_V1.md`, commit `1df58b6`),
without modifying a single protected file:

- **`solver_sdk/bridge/`** — `PolyPuzzleSolverBridge.ts`, a pure
  JSON-in/JSON-out wrapper that imports `FiveByFiveEdgeSolverEngine`
  directly from `src/customCube` (never copied), bundled with esbuild into
  one dependency-free 409KB JS file. Verified for real under Node (`vm`
  sandbox): `stateHash` matched the direct TypeScript call on **100% of 8
  independent real runs** across 5/10/15/40-move scrambles; full-plan
  output additionally matched on short scrambles (5-move: 1/1) and on
  ~40% of hard 40-move scrambles, with the divergence traced to
  `PLAN_TIME_BUDGET_MS`'s own wall-clock sensitivity (already disclosed in
  `docs/SOLVER_LONG_TERM_RELIABILITY_VALIDATION.md`), not a marshaling
  defect.
- **`solver_sdk/ios/`** — a Swift Package (`PolyPuzzleSolverSDK`):
  `SolverInputModel`/`SolverOutputModel`/`SolverErrorModel`/
  `SolverStatisticsModel`/`SolverService` (JavaScriptCore-backed), plus a
  test target with fixtures captured from real `buildSolvedCube(5)` output.
- **`ios/PolyPuzzleCube/`** — a full SwiftUI app source tree: MVVM
  ViewModels, `AppNavigator`/`AppRoute` navigation, `AppContainer` DI,
  5 screens (Home → Cube Input → Solve → Solution → Playback) covering
  every minimum feature the directive listed.
- **`assets/`** — App Icon / Launch Screen / Screenshot specs (not
  produced as files — see below).
- **`docs/IOS_PRODUCT_ARCHITECTURE.md`**, **`docs/IOS_DEPLOYMENT_GUIDE.md`**,
  **`docs/APP_STORE_SUBMISSION_GUIDE.md`** — this document's companions.

## Level criteria (directive's own STEP1–STEP6 grouped as Level1–4)

| Level | Scope | Status |
|---|---|---|
| Level1 | Solver SDK Packaging — `solver.solve(cubeState)` callable from Swift | **Code-complete, JSON contract verified for real under Node.** Not yet compiled with a real Swift toolchain (none available this Sprint). |
| Level2 | iOS Architecture — MVVM/Navigation/DI/Error Handling | **Code-complete.** Not yet compiled. |
| Level3 | iOS UI — Home/Cube Input/Solve/Solution/Playback | **Code-complete**, with 2 disclosed scope reductions (no live scramble generator, no 3D renderer — `docs/IOS_PRODUCT_ARCHITECTURE.md` §Known Limitations). Not yet run in Simulator. |
| Level4 | Apple Product Assets / App Store Packaging / Submission | **Spec only.** No icon/launch-screen files, no `.xcodeproj`, no signed build, no App Store Connect record. Requires a macOS+Xcode environment this Sprint did not have. |

## Decision

**Not Decision A** ("Cube Solver Version 1.0 Ready for Apple App Store
Submission") — claiming that would misrepresent what was actually verified.
This project's own established discipline
(`docs/SOLVER_MAINTENANCE_POLICY.md`'s explicit guard against both
premature closure *and* overclaiming) applies exactly here.

**Decision B — SDK/Architecture/UI Code-Complete, Build Verification
Pending a macOS+Xcode Environment.**

Levels 1–3 are done to the standard this project holds code to: real
imports of the frozen Baseline (never a reimplementation), a JSON contract
independently verified under real execution, and a complete MVVM app
covering every minimum feature. Level 4 cannot be completed inside this
Sprint's Linux container — it requires tools (Xcode, a Developer account,
a physical/simulated device) that were never available here, not more
engineering time.

## Next step

`docs/IOS_DEPLOYMENT_GUIDE.md` is written precisely so the next session (on
macOS) can pick this up directly at STEP1 (`swift build && swift test`) with
no rediscovery needed. Once that session confirms Level1–3 hold under real
compilation and Simulator execution, Level4 (assets → packaging →
submission) is the remaining, mechanical path to the directive's original
Decision A target.

## Post-Sprint Roadmap (unchanged from the directive, restated for continuity)

```
iOS Productization (this Sprint, partial)
   -> macOS/Xcode Build Verification (next)
   -> Internal Alpha -> TestFlight -> Closed Beta
   -> App Store Review -> Version 1.0 Release
   -> User Feedback -> Version 1.1 -> Android Port -> Google Play Release
```
