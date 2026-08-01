# Cube Solver iOS Productization Sprint v1 — Pivot: WebView Shell over the real Cube Game

## Why this pivot exists

The Flutter app built under `docs/FLUTTER_DECISION_REVISION.md` had five
native Dart screens (Home → Cube Input → Solve → Solution → Playback)
built around `flutter_js` running the Solver Engine. When the user asked
to see the gameplay screen, the answer was: there wasn't one. The app let
you type in a scrambled cube state and watch the Solver produce a
solution — a solver utility, not a cube game. The user's own words:

> "내가 제품 개발 한 이유가 솔버로 5x5 큐브 푸는거였는데 그걸 그렇게
> 해버리면 내 시간은 뭐가 되냐… 진짜 큐브게임으로 만들고 개발한 솔버는
> 큐브 풀기가 막혔을때 헬프해주는 시스템으로 하자"

Two hard requirements follow directly from that: (1) the mobile app must
be a real, playable cube game, and (2) the Solver work already done must
become an in-game "stuck? here's the next move" help feature, not be
thrown away.

## What was found instead of built

Before writing any Dart cube-rendering code, `src/App.tsx` and
`src/CubeView.tsx` (this repo's existing web app) were checked — and both
requirements already exist there, fully working:

- A real, playable 3D cube (`CustomCubeScene`, Three.js-based) for
  2x2/3x3/4x4/5x5, with swipe-to-turn gestures
  (`attachCustomSwipeTurning`), scramble, a timer, and a solved-confetti
  celebration.
- A Solver-backed help button already wired as exactly the "stuck? get
  a hint" feature the user asked for:
  `App.tsx`'s `handleSolve` → `cubeRef.current.previewNextFiveByFive()`
  → `CubeView.tsx` → `previewNextFiveByFiveMove(scene)` from
  `src/customCube/customSolvePlayback` — i.e. it previews the Solver's
  next recommended move on the real cube, it does not take over the
  screen or replace play with an abstract solve trace.

Reimplementing this in Dart would have meant rebuilding validated cube
kinematics, a Three.js-equivalent renderer, and gesture handling from
scratch — directly against this whole project's standing rule to never
reimplement already-validated code. So this Sprint does not reimplement
it: the Flutter app becomes a thin shell that bundles the real web app's
production build and displays it full-screen.

## What changed

- **Removed**: all `flutter_js`-era Dart code — `lib/app_container.dart`,
  `lib/features/{home,cube_input,solve,solution,playback}/`,
  `lib/navigation/`, `lib/solver/`, `assets/js/`, `assets/cube_fixtures/`,
  `test/solver_models_test.dart`. None of it is needed: the web app does
  everything these screens were trying to do, and does it against the
  real 3D game instead of a text-entry form.
- **Added**: `mobile/assets/webapp/` — a production build of `src/`
  (`npx vite build --base ./`, relative asset paths so the bundle
  resolves correctly as local Flutter assets; `--base ./` was passed on
  the CLI rather than changed in `vite.config.ts`, since that file's
  `GITHUB_PAGES`-conditional `base` is load-bearing for the real GitHub
  Pages deploy workflow and pivot has no reason to touch it).
- **`mobile/lib/main.dart`**: rewritten from ~5 screens + navigation down
  to one `WebViewController` (`webview_flutter`) that calls
  `loadFlutterAsset('assets/webapp/index.html')` and fills the whole
  screen (no `AppBar`, `setBackgroundColor(Colors.black)`) — matching how
  the web app already looks on GitHub Pages.
- **`mobile/pubspec.yaml`**: `flutter_js` + `provider` dependencies
  removed; `webview_flutter: ^4.10.0` added as the only non-Flutter-SDK
  dependency. `loadFlutterAsset` was confirmed to be a real, implemented
  method (not a stub) by reading its source directly in
  `webview_flutter-4.14.1` and `webview_flutter_platform_interface-2.15.1`
  before relying on it.
- `solver_sdk/bridge/` (the JS bridge + Node smoke tests from the prior
  two Sprints) is now unused by the mobile app — the web app calls the
  Solver Engine directly in-browser, no native bridge required. Left
  untouched in the repo; still valid, just no longer on the mobile app's
  path.

## What actually got verified this time

- `flutter analyze` — **0 issues.**
- `flutter test` — **no test files.** The only test that existed
  (`solver_models_test.dart`) tested the now-deleted Dart solver models.
  A widget test was attempted (`pumpWidget` + assert the WebView shell
  builds with no `AppBar`) but `webview_flutter` asserts
  `WebViewPlatform.instance != null` at construction time and that
  instance is only registered by the real Android/iOS/macOS platform
  plugins at app startup — not by `flutter test`'s harness. Faking a
  `WebViewPlatform` just to satisfy one assertion was judged
  disproportionate for a one-widget shell, so the test was dropped rather
  than kept as a shallow, low-signal check. This is disclosed rather than
  silently left implied by an empty `test/` directory.
- `flutter build linux --debug` — **compiles and links successfully**
  with `webview_flutter` swapped in for `flutter_js`. This is weaker
  proof than the previous Sprint's Linux build, and that's worth being
  explicit about: `webview_flutter` has **no Linux platform
  implementation** (only `webview_flutter_android` and
  `webview_flutter_wkwebview` for iOS/macOS resolve as real transitive
  deps — confirmed in `pubspec.lock`), so
  `mobile/linux/flutter/generated_plugin_registrant.cc` registers zero
  plugins and an actual run on Linux would hit the same
  `WebViewPlatform.instance != null` assertion the widget test did. The
  Linux build is still useful — it proves the Dart source and its real
  dependency graph compile cleanly against the Flutter engine — but
  unlike the prior Sprint's QuickJS Linux build (a genuine target-platform
  proxy), it does **not** exercise the WebView itself. Actual iOS/Android
  WebView behavior remains unverified in this container, same limitation
  as before.

## What is still not verified

- No Android SDK/NDK or macOS+Xcode in this container → `flutter build
  apk`/`ios` not attempted, same as the prior Sprint.
- WKWebView (iOS) / Android System WebView real behavior: whether the
  bundled `index.html`'s relative asset paths resolve correctly via
  `loadFlutterAsset`, whether the Three.js/WebGL cube renders and swipe
  gestures feel right inside a mobile WebView versus a desktop browser,
  and whether `cubing.js`'s 2x2/3x3/4x4 WASM search-worker assets load
  correctly from a Flutter asset bundle instead of an HTTP server — none
  of this can be checked without a real device/simulator.
- The GPU/EGL rendering limitation already disclosed for the previous
  Sprint's screenshot attempts (no DRI3 device, `LIBGL_ALWAYS_SOFTWARE=1`
  did not help) still applies here and was not re-attempted, since even a
  successful Linux run would render an unimplemented-platform error, not
  the game.

## Conclusion

The mobile app is now a ~50-line WebView shell around the real, already
playable, already Solver-integrated web cube game — honoring both halves
of the user's directive: it's a real game, and the Solver work is
preserved as the in-game help feature it was always meant to be, not
discarded. `docs/FLUTTER_DECISION_REVISION.md` has been marked partially
superseded (its Flutter-vs-native choice stands; its native-Dart-screens
architecture does not) rather than deleted, per this project's
supersession convention.
