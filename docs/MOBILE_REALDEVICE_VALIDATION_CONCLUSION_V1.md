# 모바일 실기 검증 라운드 — 결과 보고

## 무엇을 했나

Mobile Production Validation Sprint v1의 STEP 1~4를 실제 기기(Samsung
SM N981N)에서 사용자와 함께 라운드트립으로 검증하고, 그 과정에서
드러난 버그를 전부 수정했다. 새 기능 개발 없음 — Production
Solver/Primitive/Scheduler/Budget/Gesture Algorithm/Camera/Undo/Edge
Gesture Proxy/Validation Framework는 이번 라운드 내내 수정하지 않았고,
웹 빌드(`vite.config.ts`)도 손대지 않았다. 변경은 전부 `mobile/`
디렉터리(Dart 셸 코드, Android 매니페스트/리소스)와 `src/index.css`
(모바일 전용 브라우저 기본 동작 2건)로 국한됐다.

## 실제 진행 순서와 수치

| 순서 | 증상 (사용자 보고) | 원인 | 수정 |
|---|---|---|---|
| 1 | 검은 화면만 표시 | `loadFlutterAsset()`가 `file://`로 서빙 → Chromium이 `file://` 오리진에서 CORS 모드 요청(ES 모듈 `<script>`, `dynamic import()`)을 전면 거부 | `shelf`+`shelf_static`으로 로컬 `http://127.0.0.1` 서버 도입 |
| 2 | (수정 검증 중) `AssetManifest.json` 로드 크래시 | 현재 Flutter가 바이너리 `AssetManifest.bin`만 번들, JSON 미생성 | `AssetManifest.loadFromAssetBundle()` API로 교체 |
| 3 | (수정 검증 중) `ERR_CLEARTEXT_NOT_PERMITTED` | Android API 28+ 평문 HTTP 기본 차단 | `127.0.0.1`/`localhost` 한정 `network_security_config.xml` 추가 |
| 4 | (수정 검증 중) Gradle 빌드 자체 실패 | 내가 넣은 XML 주석 안에 `--` 포함 (XML 문법 위반) | 주석에서 `--` 제거 |
| 5 | "실기 화면 떴어" | — | **검은 화면 문제 해결 확인** |
| 6 | 실행취소·스와이프 개선분 다 빠짐 | 모바일 번들이 8/5 시점 고정, 이후 커밋(Undo, Camera, Edge Gesture Hit Expansion) 미반영 | 웹 빌드 재실행 후 번들 교체 (`git log`로 순서 확인: 4개 커밋 모두 번들보다 최신) |
| 7 | 반응 느림, 스와이프 안 먹힘 (릴리즈에서도 지속) | 진단용으로 넣은 `AndroidWebViewController.enableDebugging(true)`가 release에서도 무조건 켜져 DevTools 브릿지 상시 연결 | `kDebugMode`로 게이팅 |
| 8 | 버튼 터치 시 전체선택 | 텍스트 입력 없는 앱인데 `user-select: none` 누락 (데스크톱 마우스로는 재현 안 됨) | `src/index.css`에 `user-select`/`-webkit-touch-callout: none` |
| 9 | 버튼 주변 하이라이트 박스 | Chromium 기본 탭 피드백 오버레이 (선택 하이라이트와 별개) | `-webkit-tap-highlight-color: transparent` |
| 10 | "무브먼트도 자연스럽고 반응성도 괜찮네" | — | **성능/제스처 문제 해결 확인** |

**정정 사항 (투명성 목적으로 기록)**: 7번 진단 도중 "2x2/3x3/4x4는
cubing.js의 twisty-player를 쓴다"고 잘못 안내했다. 실제로는
`CubeView.tsx`가 전 사이즈에 동일하게 `CustomCubeScene` +
`customSwipeControls.ts`(프로덕션 제스처 코드)를 사용한다 — 이 코드에
임시 `[MOBILE_PROBE]` 진단 로그를 넣었으나, 7번 수정만으로 문제가
해결되어 로그를 받기 전에 진단이 끝났다. 임시 로그는 즉시
`git checkout`으로 원복했고, 되돌린 파일이 원복 이전 커밋과 diff 0줄
바이트 단위로 동일함을 확인했다.

## 성공/실패 판정

- **STEP 1 (Build)**: 성공.
- **STEP 2 (Asset/Rendering)**: 성공 — 검은 화면 완전 해결, 별도
  결론 문서(`MOBILE_BLACK_SCREEN_FIX_CONCLUSION_V1.md`)로 이미 보고.
- **STEP 3/4 (Performance/Gesture)**: 성공 — 사용자가 실기에서 자연스러운
  무브먼트와 정상 반응성을 직접 확인.
- **부가 (모바일 전용 UX)**: 전체선택·탭 하이라이트 박스 2건 모두 수정
  완료.
- **STEP 5~8 (솔버 힌트 UX / 장시간 세션 / Desktop 대비 정밀 리그레션
  감사)**: 미착수. 사용자 판단으로 이번 라운드는 여기서 종료 —
  "실기 테스트는 이정도면 충분한거 같아".

## 결론

이번 실기 검증 라운드는 **성공적으로 종료**. 원격 세션에서는 절대
드러나지 않는 클래스의 버그(WebView `file://` CORS, Android cleartext
정책, Flutter 디버그 인스트루먼트 오버헤드, 터치스크린 전용 브라우저
기본 동작)를 실제 기기 로그와 사용자 피드백만으로 순차적으로 규명·수정했고,
전 과정에서 프로덕션 웹 빌드와 솔버/제스처 알고리즘은 단 한 줄도
건드리지 않았다.

**다음 단계**: STEP 5~8은 사용자가 필요하다고 판단할 때 별도로
진행. 그 전까지는 이번 라운드에서 확정된 `mobile/` 셸 구현을 그대로
유지하는 것이 맞다.
