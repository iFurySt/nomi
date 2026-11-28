import SwiftUI

/// Reject vertical scrolling and text gestures outside the opening edge before a pan begins.
struct SidebarPan: UIGestureRecognizerRepresentable {
    let isOpen: Bool
    let columnWidth: CGFloat?
    let onDrag: (CGFloat) -> Void
    let onRelease: (CGFloat, CGFloat, Bool) -> Void

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var isOpen = false
        var columnWidth: CGFloat?

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            guard abs(velocity.x) > abs(velocity.y) * 1.3 else { return false }
            let start = pan.location(in: pan.view).x - pan.translation(in: pan.view).x
            guard isOpen else { return start <= 32 && velocity.x > 0 }
            guard velocity.x < 0 else { return false }
            if let columnWidth { return start <= columnWidth + 16 }
            return true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            otherGestureRecognizer is UIPanGestureRecognizer
        }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.maximumNumberOfTouches = 1
        pan.delegate = context.coordinator
        return pan
    }

    func updateUIGestureRecognizer(_ pan: UIPanGestureRecognizer, context: Context) {
        context.coordinator.isOpen = isOpen
        context.coordinator.columnWidth = columnWidth
    }

    func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
        let distance = pan.translation(in: pan.view).x
        switch pan.state {
        case .began, .changed: onDrag(distance)
        case .ended: onRelease(distance, pan.velocity(in: pan.view).x, false)
        case .cancelled, .failed: onRelease(distance, 0, true)
        default: break
        }
    }
}
