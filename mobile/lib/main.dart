import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show AssetManifest, rootBundle;
import 'package:path_provider/path_provider.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_static/shelf_static.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

// This app is a thin native shell around the real cube game
// (src/App.tsx + src/CubeView.tsx + src/customCube/, this repo), built by
// `npx vite build --base ./` and bundled verbatim into assets/webapp/. The
// game already has the 3D cube (2x2/3x3/4x4 via cubing.js, 5x5 via the
// custom Three.js renderer), swipe-to-turn, scramble, timer, and a
// solver-backed "next move" hint button (handleSolve in App.tsx) -- none of
// that is reimplemented here. See docs/MOBILE_WEBVIEW_PIVOT.md.
void main() {
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

  @override
  void initState() {
    super.initState();
    _startAndLoad();
  }

  @override
  void dispose() {
    _localServer?.close(force: true);
    super.dispose();
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

    if (WebViewPlatform.instance is AndroidWebViewPlatform) {
      AndroidWebViewController.enableDebugging(true);
    }
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
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
      )
      ..loadRequest(Uri.parse('http://127.0.0.1:${server.port}/index.html'));

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
    // No AppBar/chrome -- the web app is the whole screen, matching how it
    // already looks and behaves on the deployed GitHub Pages site.
    final controller = _controller;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: controller == null ? const SizedBox.shrink() : WebViewWidget(controller: controller),
      ),
    );
  }
}
