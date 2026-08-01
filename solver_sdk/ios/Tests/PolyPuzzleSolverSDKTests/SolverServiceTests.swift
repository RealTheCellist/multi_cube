import XCTest

@testable import PolyPuzzleSolverSDK

// NOT executed in this Sprint (no Swift toolchain in this container -- see
// Package.swift's own note). This mirrors the exact scenario
// solver_sdk/bridge/smokeTest.mjs already ran for real under Node: build a
// solved 5x5 cube's JSON representation, run it through SolverService,
// assert isFullySolved. Run with `swift test` on macOS as the first
// verification step in docs/IOS_DEPLOYMENT_GUIDE.md.
final class SolverServiceTests: XCTestCase {
  func testSolveAlreadySolvedCubeReturnsFullySolved() throws {
    let service = try SolverService()
    let cubies = SolverFixtures.solvedFiveByFiveCubies()
    let result = try service.solve(SolverRequest(cubies: cubies))
    XCTAssertTrue(result.isFullySolved)
    XCTAssertEqual(result.moveQueue.count, 0)
  }

  func testInvalidInputThrowsInvalidInputError() throws {
    let service = try SolverService()
    XCTAssertThrowsError(try service.solve(SolverRequest(cubies: []))) { error in
      guard case SolverError.invalidInput = error else {
        return XCTFail("expected .invalidInput, got \(error)")
      }
    }
  }
}
