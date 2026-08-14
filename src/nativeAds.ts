// Bridge to the Flutter shell's native AdMob rewarded ad (see
// mobile/lib/main.dart's PolyPuzzleAds JavaScriptChannel and
// mobile/lib/ad_banner.dart for the banner half, which needs nothing from
// this side -- it's pure native layout above the WebView). Only exists
// inside the wrapped mobile app: webview_flutter injects
// `window.PolyPuzzleAds` as part of setting up that channel, so plain web
// (GitHub Pages, `npm run dev`) never has it -- isRewardedAdAvailable() is
// how callers know to hide the "watch an ad" affordance there instead of
// showing a button that can never do anything.
interface PolyPuzzleAdsBridge {
  postMessage: (message: string) => void;
}

interface AdBridgeWindow {
  PolyPuzzleAds?: PolyPuzzleAdsBridge;
  __onRewardedAdEarned?: () => void;
  __onRewardedAdUnavailable?: () => void;
}

function bridgeWindow(): AdBridgeWindow {
  return window as unknown as AdBridgeWindow;
}

export function isRewardedAdAvailable(): boolean {
  return typeof bridgeWindow().PolyPuzzleAds?.postMessage === "function";
}

// Generous, but finite: the native side always calls back (ad shown and
// resolved, ad unavailable, or ad failed to show all reach one of the two
// callbacks -- see main.dart's _showRewardedAd), so this is only a safety
// net against some genuinely unexpected native-side failure ever leaving
// the caller hanging forever.
const REWARD_RESPONSE_TIMEOUT_MS = 20000;

/**
 * Requests the native rewarded ad and resolves once it's actually resolved
 * one way or the other: "earned" (the player watched it to completion, per
 * AdMob's own onUserEarnedReward -- see main.dart) or "unavailable" (no
 * bridge, no ad ready, or the ad failed to show). Never rejects.
 */
export function requestRewardedAd(): Promise<"earned" | "unavailable"> {
  return new Promise((resolve) => {
    const w = bridgeWindow();
    if (!w.PolyPuzzleAds) {
      resolve("unavailable");
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const settle = (result: "earned" | "unavailable") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete w.__onRewardedAdEarned;
      delete w.__onRewardedAdUnavailable;
      resolve(result);
    };

    w.__onRewardedAdEarned = () => settle("earned");
    w.__onRewardedAdUnavailable = () => settle("unavailable");
    timer = setTimeout(() => settle("unavailable"), REWARD_RESPONSE_TIMEOUT_MS);

    w.PolyPuzzleAds.postMessage("requestRewardedAd");
  });
}
