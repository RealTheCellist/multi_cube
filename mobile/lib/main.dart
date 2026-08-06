import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
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
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    // Lets `chrome://inspect` on the desktop attach to this WebView (Android
    // only -- no-op on iOS) so console/network/rendering can be inspected
    // directly, not just via debugPrint below.
    if (WebViewPlatform.instance is AndroidWebViewPlatform) {
      AndroidWebViewController.enableDebugging(true);
    }
    _controller = WebViewController()
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
      ..loadFlutterAsset('assets/webapp/index.html');
  }

  @override
  Widget build(BuildContext context) {
    // No AppBar/chrome -- the web app is the whole screen, matching how it
    // already looks and behaves on the deployed GitHub Pages site.
    return Scaffold(body: SafeArea(child: WebViewWidget(controller: _controller)));
  }
}
