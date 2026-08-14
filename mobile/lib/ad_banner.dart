import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_config.dart';

/// A persistent banner pinned above the WebView in native Flutter layout
/// (see main.dart's Scaffold) -- deliberately NOT inside the web content, so
/// it never overlaps the game's own UI and needs no bridge to the web side
/// at all. Shown across every screen of the app: home/missions/leaderboard/
/// game are all just different states of the one WebView, and there's no
/// cheap way to show/hide a native widget per-screen without adding a
/// screen-change bridge just for this -- a single always-on banner is
/// simpler and is what was actually asked for (top of home/leaderboard/game,
/// which in practice is "always").
class TopBannerAd extends StatefulWidget {
  const TopBannerAd({super.key});

  @override
  State<TopBannerAd> createState() => _TopBannerAdState();
}

class _TopBannerAdState extends State<TopBannerAd> {
  BannerAd? _bannerAd;
  bool _isLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadAd();
  }

  void _loadAd() {
    final bannerAd = BannerAd(
      adUnitId: AdConfig.bannerAdUnitId,
      size: AdSize.banner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          if (!mounted) {
            ad.dispose();
            return;
          }
          setState(() => _isLoaded = true);
        },
        // No retry -- a banner that fails to load just stays absent (the
        // SizedBox.shrink() below) rather than eating screen space with a
        // permanently-blank slot. The next screen navigation/app launch
        // gets a fresh attempt anyway.
        onAdFailedToLoad: (ad, error) {
          ad.dispose();
        },
      ),
    );
    _bannerAd = bannerAd;
    bannerAd.load();
  }

  @override
  void dispose() {
    _bannerAd?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ad = _bannerAd;
    if (!_isLoaded || ad == null) return const SizedBox.shrink();
    return Container(
      alignment: Alignment.center,
      width: double.infinity,
      color: Colors.black,
      child: SizedBox(width: ad.size.width.toDouble(), height: ad.size.height.toDouble(), child: AdWidget(ad: ad)),
    );
  }
}
