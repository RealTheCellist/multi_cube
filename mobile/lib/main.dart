import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show AssetManifest, rootBundle;
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_static/shelf_static.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'ad_banner.dart';
import 'ad_config.dart';

// This app is a thin native shell around the real cube game
// (src/App.tsx + src/CubeView.tsx + src/customCube/, this repo), built by
// `npx vite build --base ./` and bundled verbatim into assets/webapp/. The
// game already has the 3D cube (2x2/3x3/4x4 via cubing.js, 5x5 via the
// custom Three.js renderer), swipe-to-turn, scramble, timer, and a
// solver-backed "next move" hint button (handleSolve in App.tsx) -- none of
// that is reimplemented here. See docs/MOBILE_WEBVIEW_PIVOT.md. AdMob (a
// banner above the WebView, plus a rewarded ad the web content can request
// via a JavaScript channel to grant an extra daily-mission hint) is the one
// piece of native surface this shell actually owns -- see ad_config.dart,
// ad_banner.dart, and this file's PolyPuzzleAds channel.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MobileAds.instance.initialize();
  runApp(const PolyPuzzleCubeApp());
}

class PolyPuzzleCubeApp extends StatelessWidget {
  const PolyPuzzleCubeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(debugShowCheckedModeBanner: false, home: CubeGameWebView());
  }
}

class CubeGameWebView extends StatefulWidget {
  const CubeGameWebView({super.key});

  @override
  State<CubeGameWebView> createState() => _CubeGameWebViewState();
}

class _CubeGameWebViewState extends State<CubeGameWebView> {
  WebViewController? _controller;
  HttpServer? _localServer;
  RewardedAd? _rewardedAd;

  @override
  void initState() {
    super.initState();
    _startAndLoad();
    // Loaded eagerly (not on first request) so it's usually already sitting
    // ready by the time the player actually exhausts their mission hints and
    // taps the ad button -- RewardedAd.load() itself typically takes a
    // second or more.
    _loadRewardedAd();
  }

  @override
  void dispose() {
    _localServer?.close(force: true);
    _rewardedAd?.dispose();
    super.dispose();
  }

  void _loadRewardedAd() {
    RewardedAd.load(
      adUnitId: AdConfig.rewardedAdUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) => _rewardedAd = ad,
        // No retry loop -- the next _loadRewardedAd() call (either the next
        // failed-show fallback below, or simply the next JS request finding
        // _rewardedAd null and asking again) is enough; a background retry
        // loop here would just burn requests while the player isn't even
        // looking at the ad button.
        onAdFailedToLoad: (error) => _rewardedAd = null,
      ),
    );
  }

  // Called from the PolyPuzzleAds JavaScript channel (registered in
  // _startAndLoad) -- see src/nativeAds.ts on the web side for the other
  // half of this contract (window.__onRewardedAdEarned /
  // window.__onRewardedAdUnavailable).
  void _showRewardedAd() {
    final ad = _rewardedAd;
    final controller = _controller;
    if (ad == null || controller == null) {
      controller?.runJavaScriptReturningResult(
        'window.__onRewardedAdUnavailable && window.__onRewardedAdUnavailable();',
      );
      // Try to have one ready for the player's next attempt, whether this
      // was "still loading" or a load actually failed.
      _loadRewardedAd();
      return;
    }
    _rewardedAd = null; // consumed -- a fresh one loads once this one closes.
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        _loadRewardedAd();
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        ad.dispose();
        controller.runJavaScriptReturningResult(
          'window.__onRewardedAdUnavailable && window.__onRewardedAdUnavailable();',
        );
        _loadRewardedAd();
      },
    );
    ad.show(
      onUserEarnedReward: (ad, reward) {
        controller.runJavaScriptReturningResult(
          'window.__onRewardedAdEarned && window.__onRewardedAdEarned();',
        );
      },
    );
  }

  // loadFlutterAsset() would serve local files over file://, which has an
  // opaque ("null") origin -- and Chromium refuses any CORS-mode fetch
  // against file://. The built app's <script type="module"> entry and its
  // code-split dynamic import() chunks are unconditionally CORS-mode
  // requests per spec, so that path renders a black screen with every
  // JS/CSS chunk "blocked by CORS policy". Serving the same, unmodified
  // build over a local http://127.0.0.1 origin instead makes every request
  // same-origin, which sidesteps the restriction entirely.
  Future<void> _startAndLoad() async {
    final docRoot = await _extractWebapp();
    final handler = createStaticHandler(docRoot.path, defaultDocument: 'index.html');
    final server = await shelf_io.serve(handler, InternetAddress.loopbackIPv4, 0);
    _localServer = server;

    // Remote debugging (chrome://inspect) and the console/navigation
    // debugPrint hooks below were only ever needed to diagnose the
    // black-screen bug -- keeping enableDebugging() on in release builds
    // leaves the DevTools protocol bridge attached permanently, which adds
    // real input-latency overhead. Debug builds only.
    if (kDebugMode && WebViewPlatform.instance is AndroidWebViewPlatform) {
      AndroidWebViewController.enableDebugging(true);
    }
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      // The web content's side of this contract is src/nativeAds.ts:
      // window.PolyPuzzleAds.postMessage('requestRewardedAd') calls in here,
      // and _showRewardedAd() above calls back into
      // window.__onRewardedAdEarned / window.__onRewardedAdUnavailable once
      // the ad actually resolves.
      ..addJavaScriptChannel(
        'PolyPuzzleAds',
        onMessageReceived: (message) {
          if (message.message == 'requestRewardedAd') _showRewardedAd();
        },
      );
    if (kDebugMode) {
      controller
        ..setOnConsoleMessage((message) {
          debugPrint('[WebView console] ${message.level.name}: ${message.message}');
        })
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (url) => debugPrint('[WebView] page started: $url'),
            onPageFinished: (url) => debugPrint('[WebView] page finished: $url'),
            onWebResourceError: (error) => debugPrint(
              '[WebView] resource error: ${error.errorCode} ${error.description} '
              '(url=${error.url}, mainFrame=${error.isForMainFrame})',
            ),
          ),
        );
    }
    controller.loadRequest(Uri.parse('http://127.0.0.1:${server.port}/index.html'));

    if (!mounted) return;
    setState(() => _controller = controller);
  }

  // Flutter assets live packed inside the APK, not as real files on disk,
  // so they can't be served directly -- copy assets/webapp/** out into a
  // real directory shelf_static can serve from. Re-extracted on every
  // launch (cheap, a few MB) so there's no stale-copy risk across updates.
  Future<Directory> _extractWebapp() async {
    // AssetManifest.json is no longer bundled by current Flutter's build
    // system (only the binary AssetManifest.bin) -- AssetManifest.
    // loadFromAssetBundle() is the supported way to read either format.
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    final assetKeys = manifest.listAssets().where((key) => key.startsWith('assets/webapp/'));

    final tempDir = await getTemporaryDirectory();
    final docRoot = Directory('${tempDir.path}/webapp');
    if (docRoot.existsSync()) {
      docRoot.deleteSync(recursive: true);
    }
    docRoot.createSync(recursive: true);

    for (final key in assetKeys) {
      final relativePath = key.substring('assets/webapp/'.length);
      final outFile = File('${docRoot.path}/$relativePath');
      await outFile.parent.create(recursive: true);
      final data = await rootBundle.load(key);
      await outFile.writeAsBytes(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
    }

    return docRoot;
  }

  @override
  Widget build(BuildContext context) {
    // No AppBar/chrome otherwise -- the web app is still the whole rest of
    // the screen, matching how it already looks and behaves on the deployed
    // GitHub Pages site. The banner sits in native Flutter layout above the
    // WebView (not injected into the page), so it can never overlap the
    // game's own UI.
    final controller = _controller;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            const TopBannerAd(),
            Expanded(child: controller == null ? const SizedBox.shrink() : WebViewWidget(controller: controller)),
          ],
        ),
      ),
    );
  }
}
