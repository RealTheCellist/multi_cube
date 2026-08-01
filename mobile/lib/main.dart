import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

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
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..loadFlutterAsset('assets/webapp/index.html');
  }

  @override
  Widget build(BuildContext context) {
    // No AppBar/chrome -- the web app is the whole screen, matching how it
    // already looks and behaves on the deployed GitHub Pages site.
    return Scaffold(body: SafeArea(child: WebViewWidget(controller: _controller)));
  }
}
