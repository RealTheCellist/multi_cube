# release/

Holds build artifacts from STEP5 (App Store Packaging) — `.xcarchive` /
`.ipa` outputs. Empty in this Sprint: producing either requires `xcodebuild
archive` on macOS with a signing identity and provisioning profile, none of
which exist in this Sprint's Linux container. See
`docs/IOS_DEPLOYMENT_GUIDE.md` for the exact commands to run once a macOS
+ Xcode environment is available.
