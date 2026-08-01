import SwiftUI

/// Owns the NavigationStack's path. Injected as an `@EnvironmentObject` so
/// any feature view can push/pop without each view needing a reference to
/// its parent -- the Navigation-layer piece the directive's iOS
/// Architecture STEP2 calls out explicitly (Navigation as its own concern,
/// separate from state management).
@MainActor
final class AppNavigator: ObservableObject {
  @Published var path: [AppRoute] = []

  func push(_ route: AppRoute) {
    path.append(route)
  }

  func popToRoot() {
    path.removeAll()
  }

  func pop() {
    guard !path.isEmpty else { return }
    path.removeLast()
  }
}
