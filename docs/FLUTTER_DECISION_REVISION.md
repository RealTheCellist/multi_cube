# Cube Solver iOS Productization Sprint v1 — Decision Revision: Flutter

## Why this revision exists

`docs/IOS_PRODUCT_ARCHITECTURE.md`'s original Decision 1 chose native
SwiftUI over Flutter, on the grounds that Version 1.0 was iOS-only and
Flutter's cross-platform benefit didn't apply yet. It explicitly left the
door open: *"If/when a Roadmap Sprint green-lights an Android port, that
Sprint is the right place to re-open this decision."* The user has now
confirmed the intent to release on Android as well, not as a distant
maybe but as a real goal to design for now — so this Sprint reopens that
decision, per its own stated condition, rather than treating the original
choice as fixed.

## New Decision — Flutter, one Dart codebase for iOS + Android

The native SwiftUI app (`ios/PolyPuzzleCube/`) and its companion Swift
Package SDK (`solver_sdk/ios/`) are **superseded and removed** by this
revision — kept alive in git history (commit `c605605`) but deleted from
the working tree, per this project's own "don't leave stale/duplicate
implementations" convention. Building the Android app as a *second*,
separately-maintained native codebase (Kotlin/Jetpack Compose) would mean
maintaining two UI layers and two solver-bridging strategies for the rest
of this project's life; Flutter's whole reason to exist is to avoid
exactly that when both platforms are real, near-term targets.

**What did NOT change**: the "never reimplement the Solver Engine" rule
from the original architecture decision holds exactly as before. The
frozen TypeScript Solver Engine is still reused unmodified via the exact
same esbuild-bundled JS bridge (`solver_sdk/bridge/PolyPuzzleSolverBridge.bundle.js`)
that was already independently verified under Node
(see `docs/IOS_PRODUCT_ARCHITECTURE.md` §Bridge Verification — those
results are unaffected by this revision, since the bridge itself was
never Swift-specific). Only the *consuming* layer changed: `flutter_js`
(a real, published Flutter plugin) evaluates the identical bundle via
JavaScriptCore on iOS/macOS and QuickJS-over-FFI on Android/Linux/Windows,
replacing the bespoke `JSContext`-based Swift SDK with one cross-platform
plugin.

## What actually got verified this time (a real toolchain, unlike the original Sprint)

Unlike the original iOS Sprint (no Swift/Xcode toolchain anywhere in this
container), a **real Flutter SDK (3.44.8 stable) was downloaded and
installed** in this session specifically to verify this revision honestly
rather than repeat the previous Sprint's "written but never compiled"
limitation:

- `flutter pub get` — real dependency resolution (35 packages, incl.
  `flutter_js 0.8.7`, `provider 6.1.5`).
- `flutter analyze` — **0 issues** (this DID catch 2 real bugs during
  writing: a missing `material.dart` import producing 6 `undefined_method`
  errors, and a deprecated `RadioListTile` API — both fixed and
  re-verified, not just written and hoped-correct).
- `flutter test` — **3/3 tests passed**, including a JSON round-trip test
  against the real `solved.json` fixture (98 cubies, captured from actual
  `buildSolvedCube(5)` output, same fixture the app itself bundles).
- `flutter build linux --debug` — a full native compile (installed
  `libgtk-3-dev` for this), exercising `flutter_js`'s real FFI/QuickJS
  native bindings end-to-end, not just Dart source analysis. See this
  Sprint's conclusion for the actual pass/fail result once the build
  finished.

This is strictly more verification than the original iOS Sprint achieved
(source-only, zero compilation) — not because this revision tried harder,
but because a Flutter SDK happened to be installable in this Linux
container while Xcode/Swift categorically is not.

## What is still not verified

- No Android SDK/NDK in this container -> `flutter build apk`/`appbundle`
  not attempted.
- No iOS-specific verification (still needs a macOS+Xcode environment,
  same as before) -> JavaScriptCore-backed `flutter_js` behavior on
  iOS specifically is unverified here, though the Linux build's QuickJS
  path exercising the same bundle is a meaningful proxy.
- No physical/simulated device of either platform -> UI flow, gesture
  behavior, and the main-isolate-blocking timing concern noted in
  `SolveController.solve()`'s own doc comment are unmeasured.

## Superseded artifacts

| Removed | Superseded by |
|---|---|
| `ios/PolyPuzzleCube/` (SwiftUI app) | `mobile/lib/` (Flutter/Dart app) |
| `solver_sdk/ios/` (Swift Package SDK) | `mobile/lib/solver/` (`flutter_js`-backed SolverService) |

`solver_sdk/bridge/` (the JS bridge source + bundle + Node smoke tests) is
**unchanged and still the single source of truth** both the removed Swift
SDK and the new Flutter SDK consumed identically.
