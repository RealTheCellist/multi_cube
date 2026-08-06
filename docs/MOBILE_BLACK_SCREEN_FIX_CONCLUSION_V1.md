# 모바일 검은 화면 버그 수정 — 결과 보고

## 무엇을 했나

Mobile Production Validation Sprint v1의 STEP 2(Asset/Rendering
Validation)에서, 사용자가 실기(Samsung SM N981N, Android)에 릴리즈
APK를 설치한 직후 "검은 화면만 나옴"을 보고했다. 이 대화는 그 원인을
실기 로그로 규명하고 수정한 전 과정이다.

### 원인

`mobile/lib/main.dart`가 `WebViewController.loadFlutterAsset()`로
빌드된 웹앱을 `file://` 스킴으로 서빙하고 있었다. Chromium은 `file://`
페이지에 오리진을 `null`(opaque)로 부여하고, 그 오리진에서 나가는
CORS 모드 요청을 전부 거부한다. 그런데 웹앱 빌드(`npx vite build`)의
`<script type="module">` 진입점과 코드분할된 `dynamic import()` 청크는
HTML/JS 스펙상 무조건 CORS 모드 요청이다 — 이 두 조건이 겹치면서
모든 JS/CSS 청크가 `blocked by CORS policy`로 막혀 페이지가 아예
그려지지 않았다. 이 인과관계는 추측이 아니라, 사용자가 `flutter run`
디버그 모드로 재현했을 때 터미널에 그대로 찍힌 실기 로그로 확정했다.

### 시도했다가 폐기한 접근

모바일 전용 Vite 설정으로 ES 모듈을 아예 쓰지 않는 단일 IIFE
번들(`format: 'iife'`)을 만들어보려 했다. 원격 세션에서 직접
`vite build --config vite.config.mobile.ts`를 실행해 검증한 결과,
cubing.js 내부 솔버 워커 코드가 top-level `await`를 사용하고 있어
IIFE로 묶을 수 없다는 게 확인되어 폐기했다. 이 시도는 커밋되지
않았다 — 프로덕션 웹 빌드(`vite.config.ts`, GitHub Pages 배포에도
쓰임)는 건드리지 않는다는 프로젝트 원칙을 지키기 위해서였다.

### 실제 적용한 수정

웹 빌드는 전혀 건드리지 않고, 모바일 앱이 그 빌드를 "로드하는 방식"만
바꿨다: 앱 시작 시 `assets/webapp/`를 실제 디렉터리로 복사한 뒤
`shelf` + `shelf_static`으로 로컬 `http://127.0.0.1` 서버를 띄우고
그 주소를 로드한다. 같은 오리진에서 서빙되므로 CORS 제한이 적용되지
않는다.

이 변경을 실기에서 검증하는 과정에서 순차적으로 드러난 3개의 추가
결함도 같은 라운드에서 발견·수정했다:

1. **`AssetManifest.json` 로드 실패** — 현재 Flutter 빌드 시스템은
   바이너리 `AssetManifest.bin`만 번들하고 JSON은 더 이상 만들지
   않는다. `AssetManifest.loadFromAssetBundle()` API로 교체.
2. **`net::ERR_CLEARTEXT_NOT_PERMITTED`** — Android가 API 28부터
   평문 HTTP를 기본 차단한다. 기기 전체에 cleartext를 허용하는 대신
   `127.0.0.1`/`localhost`에만 한정한 `network_security_config.xml`을
   추가해 예외 범위를 최소화했다.
3. **XML 주석 문법 오류** — 그 `network_security_config.xml`의 주석
   본문에 `--`가 포함되어 있었는데, XML 주석 문법상 `--`는 여닫는
   delimiter로만 허용된다. Gradle 리소스 파서가 이를 거부해 빌드
   자체가 실패했다. 주석에서 `--` 제거로 해결.

## 실제 수치/과정 (실기 로그 기반)

| 라운드 | 실기 결과 |
|---|---|
| 1차 (`loadFlutterAsset`) | 검은 화면. 로그: 모든 JS/CSS 청크가 `blocked by CORS policy` |
| 2차 (로컬 서버 도입, `AssetManifest.json` 그대로) | 앱 크래시. 로그: `Unable to load asset: AssetManifest.json` |
| 3차 (`AssetManifest.loadFromAssetBundle()`로 교체) | 아이콘 화면에서 진행 안 됨 → 로그 재확인 결과 2차와 동일 크래시(사용자가 이전 로그를 재전송한 것으로 확인) |
| 4차 (재빌드, 새 포트로 서버 기동 확인) | `net::ERR_CLEARTEXT_NOT_PERMITTED` |
| 5차 (`network_security_config.xml` 추가) | Gradle 빌드 자체가 실패 (`[Fatal Error]` XML 주석 파싱 오류) |
| 6차 (XML 주석 수정) | **사용자 확인: "실기 화면 떴어"** |

## 성공/실패 판정

- **STEP 1 (Build Validation)**: 성공 (이전 라운드에서 확정, 이번
  대화 범위 밖).
- **STEP 2 (Asset/Rendering Validation)**: **성공.** 실기에서 검은
  화면 없이 게임 화면이 렌더링됨을 사용자가 직접 확인.
- 프로덕션 코드(Solver/Primitive/Scheduler/Budget/Gesture
  Algorithm/Camera/Undo/Edge Gesture Proxy/Validation Framework,
  `vite.config.ts`)는 이번 수정 전 과정에서 단 한 줄도 건드리지
  않았다 — 모두 `mobile/` 디렉터리 내부(Dart 코드 + Android 매니페스트
  /리소스)와 `docs/` 문서만 변경.

## 결론

검은 화면 문제는 **해결 완료(Closed)**. `file://` 기반 WebView
로딩과 ES 모듈 프로덕션 빌드의 근본적 비호환성을 실기 로그로 규명하고,
프로덕션 웹 빌드를 바꾸지 않는 방식(로컬 HTTP 서버)으로 고쳤다.

**다음 단계**: Mobile Production Validation Sprint v1의 STEP 3~8
(게임플레이, 제스처, 솔버 연동, 성능, 장시간 세션, Desktop 대비
리그레션)은 아직 미착수. 화면이 뜬 것은 "로드된다"는 확인이지
"게임이 데스크톱과 동일하게 동작한다"는 확인은 아니므로, 사용자가
실기에서 스와이프/스크램블/솔버 힌트/사이즈 전환 등을 실제로
플레이해보고 이상 없는지 보고해주는 것이 다음 단계다.
