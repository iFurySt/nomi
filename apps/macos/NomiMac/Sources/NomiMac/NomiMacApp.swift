import AppKit
import SwiftUI

@main
@MainActor
final class NomiMacApp: NSObject, NSApplicationDelegate {
    private static var appDelegate: NomiMacApp?
    private var window: NSWindow?

    static func main() {
        let app = NSApplication.shared
        let delegate = NomiMacApp()
        appDelegate = delegate
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.finishLaunching()
        delegate.openMainWindow()
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        openMainWindow()
    }

    private func openMainWindow() {
        guard window == nil else { return }

        let contentView = ContentView()
            .frame(minWidth: 960, minHeight: 640)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1024, height: 718),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Nomi"
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        window.contentView = NSHostingView(rootView: contentView)
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
