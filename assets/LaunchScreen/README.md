# Launch Screen — Spec (STEP4)

**Status: spec only** (same reasoning as `assets/AppIcon/README.md`).

## Requirements

- SwiftUI `LaunchScreen` via Xcode's storyboard-free launch screen
  (`UILaunchScreen` Info.plist key pointing at a single centered image +
  background color) — no animation, per Apple's own guidance that launch
  screens must look instantaneous, not be a splash animation.
- Background color: match `App Name`/Accent Color decision in
  docs/IOS_PRODUCT_ARCHITECTURE.md §Apple Product Identity.
- Centered content: the same App Icon glyph (not the full icon with
  corners/shadow), sized ~120x120pt.

## Where the real file goes

`ios/PolyPuzzleCube/Assets.xcassets/LaunchImage.imageset/` +
`ios/PolyPuzzleCube/Info.plist`'s `UILaunchScreen` dictionary, once an Xcode
project exists (docs/IOS_DEPLOYMENT_GUIDE.md STEP1).
