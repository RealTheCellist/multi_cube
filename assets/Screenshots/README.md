# App Store Screenshots — Spec (STEP4)

**Status: spec only.** App Store screenshots must be captured from a real
running build on a real device or Simulator — this Sprint's environment has
neither (no Xcode, no macOS, no iOS Simulator; see
docs/IOS_DEPLOYMENT_GUIDE.md's own disclosed limitation). Capturing them is
listed as a concrete, mechanical step in
docs/APP_STORE_SUBMISSION_GUIDE.md's checklist, to run once STEP1 of
docs/IOS_DEPLOYMENT_GUIDE.md (open the SDK + app source in Xcode on macOS)
is done.

## Required sizes (App Store Connect, 2026 requirements)

| Device class | Resolution | Required |
|---|---|---|
| 6.9" (iPhone 16 Pro Max class) | 1320 x 2868 | Yes |
| 6.5" (iPhone 14 Plus class, still accepted) | 1284 x 2778 | If no 6.9" device available |
| iPad Pro 13" (if iPad support is claimed) | 2064 x 2752 | Only if iPad is a supported destination |

## Suggested shot list (5, matching the STEP3 flow)

1. Home screen
2. Cube Input screen (fixture picker)
3. Solve screen mid-progress
4. Solution List screen (summary + tasks)
5. Playback screen (step navigation)
