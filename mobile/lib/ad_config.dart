import 'package:flutter/foundation.dart';

/// AdMob ad unit IDs. Real (production) ad unit IDs only ever get requested
/// in release builds -- debug/profile builds request Google's own official
/// test ad units instead, so ordinary manual testing during development
/// (which involves loading/showing/clicking ads over and over) can never
/// register as invalid traffic against the real units. AdMob accounts can
/// be suspended for exactly that, so this split isn't optional polish.
///
/// The AdMob *app* ID (AndroidManifest.xml's
/// com.google.android.gms.ads.APPLICATION_ID) is NOT split this way -- it's
/// only used to initialize the SDK, not to request a specific ad, so the
/// real one is fine everywhere.
class AdConfig {
  AdConfig._();

  static const _prodBannerAdUnitId = 'ca-app-pub-8255207928404210/6136645424';
  static const _prodRewardedAdUnitId = 'ca-app-pub-8255207928404210/2285030327';

  // Google's own published test ad units:
  // https://developers.google.com/admob/android/test-ads
  static const _testBannerAdUnitId = 'ca-app-pub-3940256099942544/6300978111';
  static const _testRewardedAdUnitId = 'ca-app-pub-3940256099942544/5224354917';

  static String get bannerAdUnitId => kReleaseMode ? _prodBannerAdUnitId : _testBannerAdUnitId;
  static String get rewardedAdUnitId => kReleaseMode ? _prodRewardedAdUnitId : _testRewardedAdUnitId;
}
