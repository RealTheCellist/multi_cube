# iOS Deployment Guide (STEP5/STEP6 — execution steps for a macOS+Xcode environment)

> **SUPERSEDED** — see `docs/FLUTTER_DECISION_REVISION.md`. This guide's
> Xcode-project-from-scratch steps applied to the now-removed native
> `ios/PolyPuzzleCube/`. The Flutter app's own iOS build path is `flutter
> build ios` from `mobile/` (still requires macOS+Xcode+Apple Developer
> account, still unverified in this Sprint's Linux container) — see the
> Decision Revision doc for what has and hasn't been verified. Kept as-is
> for historical record.

This Sprint's Linux container has no Swift toolchain, no Xcode, no iOS
Simulator, and no Apple Developer account access — so nothing below this
line has actually been run. This is a checklist for whoever (human or a
future Claude Code session running on macOS) picks this up next, written
precisely enough that no guessing is required.

## STEP0 — Prerequisites

- macOS with Xcode 15+ installed.
- An Apple Developer Program account (for signing + App Store Connect).
- This repo cloned, branch `claude/cube-game-dev-afnm5z` (or wherever this
  Sprint's commit landed).

## STEP1 — Verify the Solver SDK actually builds and passes its tests

```bash
cd solver_sdk/ios
swift build      # first real compile of everything under Sources/
swift test       # runs SolverServiceTests.swift for real, incl. the
                  # already-Node-verified solved-cube / invalid-input cases
```

If `swift build` fails, the most likely cause is a JSON field mismatch
between `SolverInputModel.swift`/`SolverOutputModel.swift` and
`solver_sdk/bridge/PolyPuzzleSolverBridge.ts`'s actual JSON shape — re-run
`npx tsx solver_sdk/bridge/smokeTest.mjs` from repo root first to confirm
the bridge itself still round-trips correctly (last known-good result: see
`docs/IOS_PRODUCT_ARCHITECTURE.md` §Bridge Verification), then diff field
names.

## STEP2 — Create the Xcode app target

No `.xcodeproj` exists yet. In Xcode: File → New → Project → iOS App,
name `PolyPuzzleCube`, SwiftUI lifecycle, then:

1. Delete the template's own `ContentView.swift`/`App.swift`.
2. Add `ios/PolyPuzzleCube/` (this Sprint's source tree) to the project.
3. Add `solver_sdk/ios` as a local Swift Package dependency (File → Add
   Package Dependencies → Add Local...) and link `PolyPuzzleSolverSDK` to
   the app target.
4. Regenerate the fixture bundle resources if Xcode's own resource copy
   step doesn't pick up `ios/PolyPuzzleCube/Resources/CubeFixtures/*.json`
   automatically — add them to the app target's "Copy Bundle Resources"
   build phase.

## STEP3 — Build + run on Simulator, verify the golden path

Per this project's own standing convention ("test the golden path and edge
cases... before reporting complete" — this applies here exactly as it does
to the web app): run the app in Simulator and walk Home → Cube Input
(pick "Medium (25 moves)") → Solve → Solution → Playback, confirm:
- `SolveView` shows a progress spinner then transitions automatically.
- `SolutionListView` shows real numbers (moves/tasks/remaining wrong wings)
  matching what `docs/IOS_PRODUCT_ARCHITECTURE.md`'s bridge verification
  established is possible (a hard/medium scramble may show
  `isFullySolved: false` legitimately — that's the disclosed
  `PLAN_TIME_BUDGET_MS` behavior, not a bug).
- `PlaybackView`'s step forward/back buttons move through `moveQueue`
  correctly (0 ≤ index ≤ count).

## STEP4 — App Icon / Launch Screen / Screenshots (STEP4 assets)

Follow the specs in `assets/AppIcon/README.md`,
`assets/LaunchScreen/README.md`, `assets/Screenshots/README.md` — produce
the real files, add to `Assets.xcassets`, capture screenshots from the
Simulator run in STEP3.

## STEP5 — App Store Packaging

```bash
# Bundle Identifier / Version / Build Number: set in Xcode's target
# settings (General tab) -- suggested identifier:
# com.polypuzzle.cubesolver, Version 1.0, Build 1.
xcodebuild -scheme PolyPuzzleCube -configuration Release \
  -archivePath release/PolyPuzzleCube.xcarchive archive
xcodebuild -exportArchive -archivePath release/PolyPuzzleCube.xcarchive \
  -exportPath release/ -exportOptionsPlist ExportOptions.plist
```

`ExportOptions.plist` (App Store distribution) is not included here — it
depends on the real Team ID / provisioning profile from the Apple
Developer account, which this Sprint has no access to.

## STEP6 — App Store Connect submission

Follow `docs/APP_STORE_SUBMISSION_GUIDE.md`'s checklist directly — create
the app record, upload the `.ipa` from STEP5 via Transporter or Xcode
Organizer, fill in the listing metadata, submit for review.

## Rollback / re-verification note

If a future Maintenance Sprint changes anything under `src/customCube/`
(the only way that's allowed to happen per
`docs/SOLVER_MAINTENANCE_POLICY.md`'s event-driven conditions), STEP1's
bundle must be regenerated:

```bash
npm install --no-save esbuild   # if not already present
node solver_sdk/bridge/build.mjs
npx tsx solver_sdk/bridge/smokeTest.mjs   # re-verify stateHash match
cp solver_sdk/dist/PolyPuzzleSolverBridge.bundle.js \
   solver_sdk/ios/Sources/PolyPuzzleSolverSDK/Resources/
```
