import UIKit
import XCTest

final class FoldedToolbarTests: XCTestCase {
    @MainActor func testToolbarFollowsSceneRotation() async throws {
        func activeScene() -> UIWindowScene? {
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first {
                $0.activationState == .foregroundActive && $0.keyWindow != nil
            }
        }
        let foreground = NSPredicate { _, _ in activeScene() != nil }
        await fulfillment(of: [XCTNSPredicateExpectation(predicate: foreground, object: nil)], timeout: 20)
        guard #available(iOS 27.1, *), let scene = activeScene(),
              let window = scene.keyWindow, window.bounds.size == CGSize(width: 466, height: 678) else {
            throw XCTSkip("需要折叠的 Duo 外屏")
        }
        defer { scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) }

        // Request a scene rotation directly: simulated device rotation can target the inactive inner display.
        for (orientation, mask) in [(UIInterfaceOrientation.landscapeLeft, UIInterfaceOrientationMask.landscapeLeft),
                                    (.landscapeRight, .landscapeRight), (.portrait, .portrait)] {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask))
            let positioned = NSPredicate { _, _ in
                guard scene.effectiveGeometry.interfaceOrientation == orientation,
                      window.rootViewController?.transitionCoordinator == nil else { return false }
                let left = orientation == .landscapeRight
                let railX = left ? CGFloat(48) : window.bounds.width - 48
                return self.hasToolbarControl(in: window, centeredAt: railX, window: window)
            }
            let settled = XCTNSPredicateExpectation(predicate: positioned, object: nil)
            settled.expectationDescription = "操作栏在方向 \(orientation.rawValue) 完成布局"
            await fulfillment(of: [settled], timeout: 10)
        }
    }

    @MainActor private func hasToolbarControl(in view: UIView, centeredAt x: CGFloat, window: UIWindow) -> Bool {
        guard !view.isHidden, view.alpha > 0 else { return false }
        if view is UIControl, abs(view.convert(view.bounds, to: window).midX - x) < 2 {
            return true
        }
        return view.subviews.contains { hasToolbarControl(in: $0, centeredAt: x, window: window) }
    }
}
