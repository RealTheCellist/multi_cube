// swift-tools-version:5.9
//
// NOTE (disclosed limitation -- see docs/IOS_DEPLOYMENT_GUIDE.md): this
// package has NOT been compiled or run in this Sprint's environment. This
// container has no Swift toolchain and no Xcode (`which swift` /
// `which xcodebuild` both resolve to nothing here -- Linux, no macOS). This
// file and every .swift file under Sources/ are written to be correct by
// inspection and by matching the JSON contract that
// solver_sdk/bridge/PolyPuzzleSolverBridge.ts and its smoke test (which DID
// run for real) already verified, but `swift build` has never actually been
// invoked against this package. A macOS machine with Xcode 15+ is required
// to do that verification -- it is the first step of
// docs/IOS_DEPLOYMENT_GUIDE.md.
import PackageDescription

let package = Package(
  name: "PolyPuzzleSolverSDK",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "PolyPuzzleSolverSDK", targets: ["PolyPuzzleSolverSDK"])
  ],
  targets: [
    .target(
      name: "PolyPuzzleSolverSDK",
      resources: [.copy("Resources/PolyPuzzleSolverBridge.bundle.js")]
    ),
    .testTarget(
      name: "PolyPuzzleSolverSDKTests",
      dependencies: ["PolyPuzzleSolverSDK"],
      resources: [.copy("Fixtures/solved5x5.json")]
    ),
  ]
)
