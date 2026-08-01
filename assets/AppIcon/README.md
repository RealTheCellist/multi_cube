# App Icon — Spec (STEP4)

**Status: spec only, not designed.** This Sprint ran in a Linux container
with no image-editing tooling and no designer input; producing an actual
1024x1024 icon here would mean fabricating a "final" visual asset with no
real design process behind it, which this project's own established
discipline (never fabricate a "real" deliverable) treats as worse than
leaving the gap explicit. What follows is the exact spec an actual icon
must satisfy so design work (human or a dedicated image-generation pass,
outside this session) can proceed directly to output.

## Requirements

- Single 1024x1024 px PNG, no alpha channel (App Store Connect rejects icons
  with transparency), no rounded corners baked in (iOS applies the mask).
- Xcode 15+ single-size app icon workflow: one 1024x1024 source in
  `Assets.xcassets/AppIcon.appiconset/`, Xcode generates all device sizes.
- Suggested concept (not mandatory): a stylized 5x5 cube face, consistent
  with the web app's own cube color palette (`FACE_COLORS` in
  `src/customCube/cubeState.ts` — U white / D yellow / L orange / R red /
  F green / B blue) so the icon reads as "the same cube" to a user who has
  used the web app.
- Must be legible at 60x60 (iPhone home screen small size) — avoid fine
  detail that only reads at 1024x1024.

## Where the real file goes

`ios/PolyPuzzleCube/Assets.xcassets/AppIcon.appiconset/icon-1024.png` once
produced, wired into `ios/Package.swift`'s or the Xcode project's asset
catalog (an Xcode project file — `.xcodeproj` — is itself something this
Sprint could not generate without Xcode; see docs/IOS_DEPLOYMENT_GUIDE.md
STEP1).
