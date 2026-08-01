import Foundation
import PolyPuzzleSolverSDK

/// Owns "which move are we looking at" for the Playback screen's Step
/// Navigation feature -- pure index bookkeeping over `result.moveQueue`,
/// no cube-rendering logic (a 3D cube renderer is listed as a Known
/// Limitation in docs/IOS_PRODUCT_ARCHITECTURE.md, same reasoning as
/// SolverFixtureCubies: unverified in this Sprint's environment).
@MainActor
final class PlaybackViewModel: ObservableObject {
  let result: SolveResult
  @Published private(set) var currentIndex: Int = 0

  init(result: SolveResult) {
    self.result = result
  }

  var currentMove: SolverMove? {
    guard currentIndex < result.moveQueue.count else { return nil }
    return result.moveQueue[currentIndex]
  }

  var isAtStart: Bool { currentIndex == 0 }
  var isAtEnd: Bool { currentIndex >= result.moveQueue.count }

  func stepForward() {
    guard !isAtEnd else { return }
    currentIndex += 1
  }

  func stepBackward() {
    guard !isAtStart else { return }
    currentIndex -= 1
  }

  func reset() {
    currentIndex = 0
  }
}
