# Mobile Gameplay Validation Sprint v1

## 배경 및 범위 재정의

원래 작업지시서는 Production WebView Shell(Flutter `webview_flutter`, `mobile/`)이 실제
Android/iOS 기기·에뮬레이터·시뮬레이터에서 데스크톱과 동등한 플레이 경험을 제공하는지
검증하는 것을 목적으로 했다. 이 Sprint는 **새 기능을 개발하지 않으며, 목적은 게임
플레이 품질(UX) Validation**이다.

### 환경 제약과 재정의

이 실행 환경에는 실제 Android/iOS 기기, 에뮬레이터, 시뮬레이터가 없다. 사용자 지시에
따라 다음을 실제로 시도했다:

- **Flutter SDK 설치**: 성공 (`/opt/flutter_setup/flutter`, 3.35.5).
- **Android SDK(cmdline-tools) 설치**: 실패 — `dl.google.com`이 이 세션의 네트워크
  정책(egress policy)에 의해 명시적으로 차단됨(403). 프록시 진단
  (`$HTTPS_PROXY/__agentproxy/status`)에서 `"connect_rejected ... policy denial"`로
  확인. 정책 우회를 시도하지 않고 사용자에게 보고했다.
- **하드웨어 가상화**: `/dev/kvm` 없음, CPU에 `vmx`/`svm` 플래그 없음 — 설령 Android
  SDK를 받더라도 에뮬레이터는 비가속 소프트웨어 QEMU로만 동작해 사실상 사용 불가.
- **iOS 빌드**: macOS + Xcode가 필요해 이 Linux 컨테이너에서는 원천적으로 불가능.

이에 따라 검증 범위를 **웹앱 기준으로 축소 재정의**했다: WebView가 실제로 로드하는
프로덕션 웹 번들(`mobile/assets/webapp/`, `npx vite build --base ./`로 생성된
상대경로 빌드)을 Playwright의 모바일 뷰포트(390×844, deviceScaleFactor 3,
`isMobile`/`hasTouch`, Android Chrome UA)로 직접 로드·조작하여 검증했다. **진짜
네이티브 WebView/WKWebView 고유 동작(실제 기기 GPU 드라이버, 배터리/발열 스로틀링,
OS 레벨 권한 처리 등)은 이 환경에서 원천적으로 검증 불가능**하며, 이는 아래 "알려진
한계"에 명시한다.

### 번들 갱신

기존 `mobile/assets/webapp/`는 2026-08-01 스냅샷(카메라 Yaw 보정, LOW_CONFIDENCE_MARGIN
게이트 등 이번 세션의 모든 프로덕션 수정 이전)으로 오래되어 있었다. `npx vite build
--base ./`로 최신 프로덕션 코드를 다시 빌드해 번들을 갱신했다(코드 자체는 전혀
수정하지 않음 — 순수 빌드 산출물 교체).

## STEP1 — WebView 로드-동등성 검증

갱신된 번들을 정적 서버로 서빙, 모바일 뷰포트+터치 에뮬레이션 Chromium으로 로드.

```
loadTimeMs: 12824
canvasCount: 1
webglContextAcquired: true
consoleErrors: ["Failed to load resource: net::ERR_CONNECTION_RESET"]  (Google Fonts, 세션 네트워크 정책 차단 — 앱 기능과 무관)
pageErrors: []
```

캔버스 렌더링과 WebGL 컨텍스트 획득 모두 성공. 유일한 콘솔 에러는 외부 Google Fonts
요청이 이 세션의 egress 정책으로 차단된 것으로, 실제 기기(인터넷 연결 있음)에서는
발생하지 않을 것으로 예상되며 발생하더라도 폰트 폴백만 될 뿐 기능에는 영향 없다.

## STEP2 — Asset Validation

2×2 사이즈로 전환 후 스크램블+"솔브"(힌트)를 실행해 cubing.js의 동적 청크
(search-worker, twips WASM, puzzle-geometry, puzzles-dynamic-*, search-dynamic-solve-*)를
모두 실제로 로드시켰다.

```
totalLocalRequests: 24
byExtension: {"html":1,"css":1,"js":21,"svg":1}
failedLocalRequests: []
```

JS/CSS/SVG/WASM(twips_wasm)/Worker(search-worker-entry) 전 항목 200 OK, 실패 0건.
상대경로(`--base ./`) 빌드가 WebView의 asset 로딩 방식과 동일하게 정상 동작함을
확인했다.

## STEP3 — Gameplay Validation

| 항목 | 결과 |
|---|---|
| 크기 선택(3×3) | PASS |
| 시작하기 | PASS |
| 스크램블 | PASS (상태 변경 확인, `hasScrambled` 플래그 설정) |
| 스와이프 회전 | PASS (moveCount 0→1, 시각적 회전 확인) |
| 리셋 | PASS (moveCount 0, `hasScrambled` 해제) |

**"솔브" 버튼 동작 확인(중요)**: 조사 중 "솔브"를 40회 눌러도 큐브가 풀리지 않는
현상을 발견했다. 코드(`customSolvePlayback.ts`의 `previewNextSolveMove`)를 직접 확인한
결과, 3×3에서도 이 버튼은 **다음 수를 미리보기만 하고(진행 애니메이션 → 원위치
애니메이션) 실제로 큐브 상태를 변경하지 않는 것이 의도된 동작**임을 확인했다(버그
아님). 이는 4×4/5×5의 툴팁 문구("3×3처럼 다음 수를 미리보기만 해요")와 정확히
일치하며, 사용자가 힌트를 본 뒤 직접 스와이프로 수행하는 것이 정상 플로우다.

**완성 감지(모달) 검증의 한계**: 완성 모달은 `hasScrambled` 플래그로 게이트되어
있어(App.tsx의 `handleSolvedChange`), 실제 스크램블 후 그 스크램블을 정확히
역산하는 스와이프 시퀀스를 재현해야 라이브로 트리거할 수 있다. 이는 이번 Sprint의
변경 금지 대상인 Gesture Axis Selection 로직을 별도로 재현해야 하는 작업이라 범위
밖으로 판단했다. 대신 다음 두 가지로 대체 확인했다: (1) 관련 코드
(`handleSolvedChange`/`hasScrambled` 게이팅/confetti 트리거)가 이번 세션 동안
**전혀 수정되지 않았음**(git diff 0건), (2) 이 메커니즘이 의존하는 하위 요소
(스크램블의 상태 변경, 리셋의 상태 초기화, 스와이프의 상태 커밋)는 모두 위 표에서
모바일 뷰포트로 직접, 실측으로 검증됨. 데스크톱에서 이미 검증된 완성 플로우
(`GESTURE_FEEL_OPTIMIZATION_V1.md`)와 코드가 동일하므로 동등하다고 판단하며, 이
부분만은 "재도출"이 아니라 "코드 불변 + 하위 요소 실측"으로 대체했음을 명시한다.

## STEP4 — Gesture Regression Check (Tremor 모델)

`AXISMAP_PROBE` 임시 계측(항상 그래왔듯 사용 후 즉시 되돌림, `git diff --exit-code`로
0건 확인)을 다시 붙여 모바일 전용 빌드(`--base ./`)를 만들고, 모바일 뷰포트+터치
에뮬레이션으로 기존 Camera Sprint와 동일한 지점에서 재측정했다.

| 위치 | 방향 | 데스크톱 기준선(Camera Sprint) | 모바일 뷰포트(이번 Sprint) |
|---|---|---|---|
| Top face (0.55,0.35) | H(0°) | 24.0% | **24.0%** |
| Top face (0.55,0.35) | V(90°) | 18.0% | **18.0%** |
| Right face (0.85,0.55) | H(0°) | 38.0% | **38.0%** |
| Right face (0.85,0.55) | V(90°) | 44.0% | **44.0%** |
| Front face (0.4,0.6) | H/V | 0.0%/0.0% | **0.0%/0.0%** |

**전 항목 완전히 일치**(N=50/방향, tremor 진폭 4px 동일 모델). 모바일 뷰포트·터치
이벤트 에뮬레이션 하에서도 LOW_CONFIDENCE_MARGIN Gate + Camera(Yaw −5°) 조합의
효과가 그대로 유지됨을 확인했다 — **회귀 없음**.

## STEP5 — Performance Validation

```
idleFPS: 22.8 (52 frames / 2.28s)
activeRotationFPS: 22.7 (199 frames / 8.77s, 연속 스와이프 중)
memory: usedJSHeapMB=9.0, totalJSHeapMB=10.2
consoleErrors: (Google Fonts 차단 1건 제외 없음)
pageErrors: []
```

**중요한 한계**: 이 헤드리스 컨테이너는 실제 GPU가 없어 Chromium이 소프트웨어 WebGL
렌더링(SwiftShader 계열 폴백, "Automatic fallback to software WebGL" 경고 확인)으로
동작한다. 따라서 위 FPS 수치는 **실제 모바일 기기의 GPU 가속 성능을 대표하지
않는다** — 실기기에서는 이보다 훨씬 높은 FPS가 기대된다. 이 측정의 의미는 절대
FPS가 아니라 "idle 대비 활성 회전 중 FPS 저하가 없다"(22.8 → 22.7, 사실상 동일)와
"JS 힙 사용량이 매우 작다(9MB)"는 상대적 신호로 한정한다. 크래시·JS 에러 없음.

## STEP6 — Solver Integration / Hint UX Validation

"막힘(stuck) → 힌트 → 다음 수 확인 → 계속 플레이" 흐름을 모바일 뷰포트+터치로 검증.

```
hint text during preview: "다음 수 미리보기 재생 중..."
solve button disabled during preview: true
hint text after preview: ""
moveCount before/after post-hint swipe: 0 -> 1 (changed: true)
second hint press completed OK, button re-enabled: true
pageErrors: []
```

힌트 프리뷰 중 버튼이 올바르게 비활성화되고, 프리뷰 종료 후 재활성화되며, 힌트 직후
사용자가 직접 수행한 스와이프가 정상적으로 상태에 반영된다(moveCount 0→1). 힌트를
반복 사용해도 멈추거나 잠기는 현상 없음. **PASS**.

## STEP7 — Long Session Validation (≥20분)

무작위 방향 스와이프를 기본 동작으로 하고, 25회마다 스크램블, 40회마다 "솔브"(힌트),
60회마다 리셋을 섞어 21분간 연속 시뮬레이션했다(1분 간격으로 메모리/FPS 샘플링).

```
totalDurationMin: 21.0
totalActions: 665
crashed: false
totalPageErrors: 0
totalConsoleErrors: 1 (Google Fonts 차단, 세션 시작부터 고정 1건 — 누적 증가 없음)
memorySamples(MB): [10.7,10.1,9.2,9.0,11.9,10.4,9.7,9.1,12.2,11.2,10.5,9.8,11.9,11.7,10.5,9.4,12.6,11.3,11.1,9.7]
```

**메모리**: 9.0~12.6MB 사이에서 등락하며 뚜렷한 증가 추세 없음 — 21분간 665회 액션
동안 메모리 누수 징후 없음(첫 샘플 10.7MB, 마지막 샘플 9.7MB로 사실상 시작점과
동일한 수준).

**FPS**: 21.7~23.9 사이로 안정적(1분 단위 idle+active 혼합 샘플), 세션 초반(1분,
22.7)과 종반(20분, 21.9)이 거의 동일해 시간 경과에 따른 성능 저하 없음.

**크래시/에러**: 21분·665회 액션 동안 `page.on('crash')` 미발생, JS `pageerror`
0건. 콘솔 에러는 세션 내내 동일하게 1건(외부 폰트 차단, 첫 로드 시 1회성)으로 액션
반복에 따라 증가하지 않음.

**세션 종료 후 제스처 드리프트 체크**: 21분 세션 종료 직후 리셋 후 일반 스와이프를
수행 — moveCount 0→1 정상 반영, 장시간 세션 이후에도 제스처 인식이 정상 작동함을
확인.

## 판정

| 기준 | 결과 |
|---|---|
| Level 1: WebView(웹 번들) 로드/렌더/에셋 정상 | ✅ 통과 (STEP1/2) |
| Level 2: 핵심 게임플레이 동작(회전/스크램블/리셋/힌트) 정상 | ✅ 통과 (STEP3/6) |
| Level 3: 제스처/성능 회귀 없음 + 장시간 안정성 | ✅ 통과 (STEP4/5/7 — 21분·665액션 무크래시, 메모리 누수 없음, FPS 저하 없음) |

**실패 조건 점검**: 제스처 오인식률 악화 없음(전 지점 데스크톱과 완전 일치) / 크래시
없음(21분 세션 포함) / JS 에러 없음(외부 폰트 차단 제외) / 성능 저하 없음(idle 대비
활성 회전 FPS 동일, 장시간 세션에서도 FPS·메모리 안정) — 어느 실패 조건도 발동하지
않음.

## 최종 Decision: **A — 웹 번들 기준 게임플레이 품질 검증 통과, 모바일 번들 갱신
채택**

이번 Sprint의 재정의된 범위(WebView가 실제로 로드하는 프로덕션 웹 번들을 모바일
뷰포트·터치 에뮬레이션으로 검증) 내에서 Level 1/2/3 전 기준을 통과했다:

- 로드/렌더/에셋(WASM·Worker 포함) 전부 정상
- 핵심 게임플레이(회전/스크램블/리셋/힌트) 전부 정상
- 제스처 오인식률이 데스크톱 Camera Sprint 기준선과 **소수점까지 완전히 일치**
  (Top 24.0%/18.0%, Right 38.0%/44.0%, Front 0.0%/0.0%) — 모바일 뷰포트·터치
  에뮬레이션 전환에 따른 회귀 전혀 없음
- 21분·665액션 장시간 세션에서 크래시/에러/메모리 누수/FPS 저하 없음

`mobile/assets/webapp/`의 오래된(8/1일자) 빌드 산출물을 최신 프로덕션 코드(Camera
Yaw −5°, LOW_CONFIDENCE_MARGIN Gate, GFO 등 이번 세션의 모든 수정 포함) 기준으로
갱신했다. Solver/Primitive/Scheduler/Budget/Gesture Axis Selection/
LOW_CONFIDENCE_MARGIN Gate/Camera/Three.js/cubing.js 로직은 전혀 수정하지 않았다.

**단, 이 Decision A는 "웹 번들 계층"에 한정된다.** "알려진 한계"에 정리한 진짜
네이티브 WebView 고유 동작(실기기 GPU, 배터리/발열, 실제 터치 디지타이저, OS 권한)은
이 환경에서 검증할 수 없었으므로, 작업지시서가 원래 의도한 "Release Candidate 단계
전환" 판단은 **사용자가 dl.google.com 등 네트워크 정책을 조정해 실제 Android
기기/에뮬레이터에서 최소 1회 육안 확인을 거친 뒤에 내리는 것을 권장**한다. 이번
Sprint는 그 전 단계인 "웹 번들 자체는 결함이 없다"는 것을 최대한 엄밀하게 확인하는
역할을 수행했다.

## 알려진 한계 (구조적으로 검증 불가능한 항목)

- **진짜 네이티브 WebView/WKWebView 고유 동작**: 실제 Android WebView 엔진 버전별
  차이, iOS WKWebView의 JS 엔진 특성, 네이티브 스크롤/바운스 인터랙션과의 충돌 여부.
- **실제 기기 GPU 드라이버 성능**: 이 환경은 소프트웨어 렌더링만 가능해 절대 FPS는
  대표성이 없음(STEP5 참고).
- **실제 터치 디지타이저 특성**: 정전식 터치스크린의 실제 감도/디바운스는 Playwright의
  합성 포인터 이벤트와 다를 수 있음(다만 tremor 모델은 이미 손 떨림 노이즈를
  시뮬레이션해 이 차이를 부분적으로 흡수하도록 설계됨).
- **배터리/발열 스로틀링**: 장시간 세션에서의 실제 기기 발열에 따른 성능 저하는
  측정 불가.
- **OS 레벨 권한/설정**: 실제 Android/iOS 권한 다이얼로그, 네트워크 연결 상태 전환
  등은 시뮬레이션하지 못함.
- **완성 모달(축하) 라이브 트리거**: STEP3에서 설명한 대로, 실제 스크램블 역산
  스와이프 시퀀스로 완성 상태까지 도달시키는 것은 Gesture Axis Selection 로직
  재현이 필요해 범위 밖으로 두었다 — 코드 불변 확인 + 하위 요소 실측으로 대체.

## 변경 범위

이 Sprint에서 실제로 변경한 프로덕션 파일은 `mobile/assets/webapp/`(빌드 산출물
갱신)뿐이다. Production Solver, Primitive, Scheduler, Budget, Gesture Axis
Selection, LOW_CONFIDENCE_MARGIN Gate, Camera(Yaw −5°), Three.js Logic, cubing.js
Logic은 전혀 수정하지 않았다. 진단용으로 `customSwipeControls.ts`에 추가한
AXISMAP_PROBE 계측은 측정 직후 완전히 되돌렸다(`git diff --exit-code` 0건 확인).
