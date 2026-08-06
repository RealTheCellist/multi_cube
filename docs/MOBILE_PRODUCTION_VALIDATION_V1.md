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

## STEP 2~8

미착수. 실제 기기 또는 에뮬레이터에 APK를 설치해 에셋 로드, 렌더링,
게임플레이, 제스처, 솔버 연동, 성능, Desktop 대비 리그레션을 확인해야
한다. 사용자 로컬 환경에서 진행 예정.
