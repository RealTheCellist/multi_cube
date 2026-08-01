# App Store Submission Guide (STEP6)

> **Still applicable** — see `docs/FLUTTER_DECISION_REVISION.md`. The App
> Store listing/privacy/submission checklist below is stack-agnostic and
> applies unchanged to the Flutter app (`mobile/`); only the build
> artifact it starts from changes (`flutter build ipa` output instead of
> an Xcode archive of the native app).

Everything below is a checklist/draft for a future step, not a submission
that has happened — this Sprint had no App Store Connect access and no
buildable `.ipa` (see `docs/IOS_DEPLOYMENT_GUIDE.md`).

## App record

| Field | Draft value | Notes |
|---|---|---|
| App Name | Poly Puzzle: Cube Solver | Matches `HomeView`'s displayed title "Poly Puzzle" + clarifies purpose for App Store search |
| Bundle Identifier | `com.polypuzzle.cubesolver` | Placeholder — must be registered under the real Apple Developer Team once one is attached |
| Primary Category | Games → Puzzle | 5x5 Rubik's-cube-style puzzle solver |
| Secondary Category | Utilities | Solver/utility angle |
| Support URL | *(not set)* | Needs a real hosted page — could reuse this repo's own GitHub Pages deploy (`docs/SOLVER_OPERATION_GUIDE.md` references the existing web app's Pages workflow) |
| Privacy Policy URL | *(not set)* | Draft policy text below; needs real hosting |
| Age Rating | 4+ | No objectionable content, no data collection beyond what's disclosed below |

## Privacy

The app makes **zero network calls** — `SolverService` runs entirely
on-device via JavaScriptCore, no analytics, no telemetry, no user accounts.
Draft Privacy Policy:

> Poly Puzzle: Cube Solver does not collect, transmit, or store any
> personal data. All cube-solving computation happens entirely on your
> device. The app makes no network requests.

App Store Connect's "App Privacy" questionnaire: answer "No" to every data
collection category (Contact Info, Health & Fitness, Financial Info,
Location, etc.) — accurate given the architecture in
`docs/IOS_PRODUCT_ARCHITECTURE.md`.

## License / Open Source Notice

The Solver Engine is original code from this repository
(`RealTheCellist/multi_cube`). Third-party dependency this Sprint's Solver
SDK relies on:
- **three.js** (MIT License) — used transitively via `src/customCube/`'s
  `Cubie`/`Sticker` types (`THREE.Vector3`/`THREE.Quaternion`), bundled
  into `PolyPuzzleSolverBridge.bundle.js`. Attribution required in an
  in-app "Open Source Licenses" screen or `LICENSE-THIRD-PARTY.md` —
  **not yet added**; a real requirement for STEP4/submission, listed here
  so it isn't lost.

## Store listing draft

**Description:**

> Poly Puzzle solves your scrambled 5x5 Rubik's-style cube. Pick a cube
> state, tap Solve, and step through the exact sequence of moves — no
> network connection required, everything runs on your device.

**Keywords:** cube, rubik, puzzle, solver, 5x5, speedcube

**What's New (Version 1.0):** see `docs/VERSION_1_0_RELEASE_NOTE.md`.

## Submission checklist (run in order, once `docs/IOS_DEPLOYMENT_GUIDE.md` is complete)

- [ ] App record created in App Store Connect with the fields above
- [ ] Build uploaded (from `release/PolyPuzzleCube.ipa`)
- [ ] Screenshots uploaded for all required device sizes (`assets/Screenshots/README.md`)
- [ ] App Privacy questionnaire completed (all "No" per above)
- [ ] Privacy Policy URL live and reachable
- [ ] Age rating questionnaire completed
- [ ] Submit for Review
