# Mobile Production Validation Sprint v1

목적: WebView 기반 모바일 앱이 실제 모바일 환경에서 데스크톱 웹 버전과
기능적으로 동일하게 동작하는지 검증한다. 새 기능 개발 없음, Production
Solver/Primitive/Scheduler/Budget/Gesture Algorithm/Camera/Undo/Edge Gesture
Proxy/Validation Framework는 수정하지 않는다.

## STEP 1 — Build Validation

**환경**: 이 원격 세션에는 Android SDK가 없고(`dl.google.com`이 아웃바운드
프록시 정책으로 차단됨 — 우회 대상이 아니라 관리자에게 보고해야 하는
차단), iOS는 Xcode가 macOS 전용이라 이 환경에서는 구조적으로 항상 불가능.
사용자가 로컬(Windows, Android Studio 설치됨)에서 실행.

**로컬에서 첫 시도 시 두 가지 스캐폴딩 결함을 발견 → 원격 세션에서 수정,
커밋·푸시**:

1. `mobile/` Flutter 프로젝트에 `android/` 플랫폼 폴더 자체가 없었음
   (`linux/`만 존재) — `flutter create --platforms=android .`로 생성해
   추가. 이 과정에서 생성된, 이 앱과 무관한 스텁 `test/widget_test.dart`
   (존재하지 않는 `MyApp` 클래스를 참조하는 flutter 기본 카운터 앱 테스트)
   는 삭제.
2. 생성된 `android/app/build.gradle.kts`가 `kotlin { compilerOptions {...} }`
   블록은 갖고 있으면서 Kotlin Android 플러그인 자체를 `plugins {}`에
   적용하지 않아, Gradle이 `kotlin` 확장을 찾지 못하고
   `DependencyHandler.kotlin(module, version)` 오버로드로 잘못 해석 →
   "None of the following candidates is applicable" + "Unresolved
   reference 'compilerOptions'/'jvmTarget'"로 빌드 실패. `id("kotlin-android")`
   추가로 해결.

**결과**:
```
√ Built build\app\outputs\flutter-apk\app-release.apk (40.5MB)
```

**Android Build: 성공.** iOS는 이 환경/이 사용자 로컬(Windows)에서는
검증 불가 — Mac + Xcode 필요.

## STEP 2 — Asset/Rendering Validation

**증상**: 실기(Samsung SM N981N)에 설치 후 검은 화면만 표시, 게임이
전혀 렌더링되지 않음.

**진단 (실기 `flutter run` 로그로 확정)**: `loadFlutterAsset()`가 앱을
`file://`로 서빙 → Chromium은 `file://`에 오리진을 `null`(opaque)로
부여하고 CORS 모드 요청을 전면 거부. 빌드된 웹앱의
`<script type="module">`과 코드분할 `dynamic import()` 청크는 스펙상
무조건 CORS 모드 요청이라, 모든 JS/CSS 청크가 정확히
`blocked by CORS policy`로 막혀 페이지가 아예 그려지지 않았음. 검은
화면의 진짜 원인.

**시도했다가 폐기한 접근**: 모바일 전용 Vite 설정으로 ES 모듈 없는
단일 IIFE 번들을 시도. 원격 세션에서 직접 `vite build`로 재현 —
cubing.js 내부 솔버 워커가 top-level `await`를 쓰고 있어 IIFE로 묶을
수 없음이 확인되어 폐기 (production 웹 빌드는 건드리지 않는 것으로
확정).

**실제 적용한 수정 (웹 빌드는 전혀 건드리지 않음)**: `mobile/lib/main.dart`가
앱 시작 시 `assets/webapp/`를 실제 디렉터리로 복사한 뒤
`shelf`+`shelf_static`으로 로컬 `http://127.0.0.1` 서버를 띄우고 그
주소를 로드하도록 변경. 같은 오리진에서 서빙되므로 CORS 제한이
적용되지 않음.

이 변경 과정에서 실기 로그로 순차적으로 드러난 3개의 추가 결함, 모두
같은 라운드에서 수정:

1. `AssetManifest.json`을 직접 파싱하려 했으나 `Unable to load asset`
   예외 발생 — 현재 Flutter 빌드 시스템은 바이너리 `AssetManifest.bin`만
   번들하고 JSON은 더 이상 만들지 않음. `AssetManifest.loadFromAssetBundle()`
   API로 교체.
2. `net::ERR_CLEARTEXT_NOT_PERMITTED` — Android가 API 28부터 평문
   HTTP를 기본 차단. 기기 전체에 cleartext를 허용하는 대신
   `127.0.0.1`/`localhost`에만 한정한 `network_security_config.xml`
   추가.
3. 그 `network_security_config.xml`의 주석 안에 `--`가 포함되어
   XML 주석 문법 위반 → Gradle 리소스 파서가 빌드 자체를 거부.
   주석에서 `--` 제거.

**결과**: 사용자가 실기에서 확인 — "실기 화면 떴어". 검은 화면 문제
해결, 게임 화면이 실제로 렌더링됨.

**Asset/Rendering: 성공.**

## STEP 3~8

미착수. 게임플레이, 제스처, 솔버 연동, 성능, 장시간 세션, Desktop
대비 리그레션 확인이 남아있음. 사용자 로컬 환경에서 진행 예정.
