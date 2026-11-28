import SwiftUI
import WebKit

// The manuscript has its own formatting and completion actions above the keyboard.
private final class ManuscriptWebView: WKWebView {
    private let emptyAccessory = UIView(frame: .zero)
    override var inputAccessoryView: UIView? { emptyAccessory }
}

/// TextKit handles ordinary paragraphs and emphasis in place. Use the desktop
/// Markdown dialect for structural content that a single text run cannot lay out.
struct ManuscriptPreview: UIViewRepresentable {
    struct Block: Equatable {
        let key: String
        let source: String
        let editable: Bool
    }
    let title: String
    let blocks: [Block]
    let scrolls: Bool
    let margins: EdgeInsets
    let readOnly: Bool
    let editing: Bool
    struct Focus { let key: String; let offset: Int }
    let focus: Focus?
    let commands: Commands
    let edit: () -> Void
    let change: (String?, String) -> Void
    let updateUndo: (Bool, UIView, @escaping () -> Void) -> Void
    let toggleTask: (String, Int) -> Void
    @Binding var inTable: Bool
    @Binding var height: CGFloat

    static func needed(for text: String) -> Bool {
        text.range(of: #"(?m)(^\s{0,3}(?:[-*+]\s|\d+[.)]\s|\x60{3,}|~{3,}|#{4,6}\s|>\s?|[-*_]{3,}\s*$)|\||\$|\\[\[(]|https?://|www\.|\]\(|^ {4}\S|\n(?:=+|-+)\s*(?:\n|$))"#,
                   options: .regularExpression) != nil
    }

    private static let completedMath = try! NSRegularExpression(pattern:
        #"(?s)(?:\$\$.+?\$\$|(?<![\\$])\$[^\n$]+?\$|\\\(.+?\\\)|\\\[.+?\\\])"#)

    static func hasCompletedMath(in source: String, before offset: Int) -> Bool {
        let text = source as NSString
        guard offset > 0, offset <= text.length, source.contains("$") || source.contains("\\") else { return false }
        let last = text.substring(with: NSRange(location: offset - 1, length: 1))
        guard last.rangeOfCharacter(from: .whitespacesAndNewlines) != nil else { return false }
        return completedMath.firstMatch(in: source, range: NSRange(location: 0, length: offset - 1)) != nil
    }

    static let script = Bundle.main.url(forResource: "manuscript-reader", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }

    struct Equation: Identifiable {
        let id: Int
        let key: String
        let before: String
        let after: String
        var latex: String
        var mathML: String
        var focusRequest = 0
    }

    @Observable final class Commands {
        var equation: Equation?
        var selection = ManuscriptFormatSelection()
        var panelOpen = false

        @ObservationIgnored weak var web: WKWebView?

        func beginEditing(at target: Focus?) {
            guard let web else { return }
            if target != nil { web.becomeFirstResponder() }
            let script = target == nil ? "window.focusManuscriptEnd()" : "window.focusManuscriptAt(key, offset)"
            let arguments: [String: Any] = target.map { ["key": $0.key, "offset": $0.offset] } ?? [:]
            web.callAsyncJavaScript(script, arguments: arguments, in: nil, in: .page, completionHandler: nil)
        }

        func updateEquation(_ equation: Equation, latex: String) {
            guard self.equation?.id == equation.id else { return }
            self.equation?.latex = latex
            web?.callAsyncJavaScript("return window.updateManuscriptEquation(id, latex)",
                                     arguments: ["id": equation.id, "latex": latex], in: nil, in: .page) { [weak self] result in
                guard self?.equation?.id == equation.id, case .success(let value) = result,
                      let mathML = value as? String else { return }
                self?.equation?.mathML = mathML
            }
        }

        func revealEquation(_ id: Int, above dockTop: CGFloat) {
            guard let web else { return }
            web.evaluateJavaScript("document.querySelector('[data-active-equation]')?.getBoundingClientRect().bottom") { [weak self, weak web] result, _ in
                guard let web, let window = web.window, self?.equation?.id == id, let bottom = result as? CGFloat else { return }
                let distance = web.convert(CGPoint(x: 0, y: bottom * web.scrollView.zoomScale), to: window).y + 8 - dockTop
                guard distance > 1 else { return }
                var view: UIView? = web.scrollView
                while let current = view {
                    if let scroll = current as? UIScrollView, scroll.isScrollEnabled {
                        let limit = scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom
                        let next = min(limit, scroll.contentOffset.y + distance)
                        if next > scroll.contentOffset.y { scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: next), animated: false) }
                        return
                    }
                    view = current.superview
                }
            }
        }

        @ObservationIgnored private var pendingFormats: [ManuscriptFormat] = []

        @MainActor func format(_ format: ManuscriptFormat) {
            pendingFormats.append(format)
            guard pendingFormats.count == 1 else { return }
            Task { @MainActor in
                while let next = pendingFormats.first {
                    if let web { await apply(next, in: web) }
                    pendingFormats.removeFirst()
                }
            }
        }

        @MainActor private func apply(_ format: ManuscriptFormat, in web: WKWebView) async {
            guard let selection = try? await web.callAsyncJavaScript("return window.manuscriptBodySelection(format)",
                      arguments: ["format": format.rawValue], in: nil, contentWorld: .page) as? [String: Any],
                  let source = selection["source"] as? String, let key = selection["key"] as? String,
                  let start = selection["location"] as? Int, let length = selection["length"] as? Int,
                  start >= 0, length >= 0, start <= source.utf16.count, length <= source.utf16.count - start,
                  let change = format.change(in: source as NSString, selection: NSRange(location: start, length: length))
            else { return }
            let next = (source as NSString).replacingCharacters(in: change.range, with: change.text)
            let from = change.range.location + change.selection.location
            _ = try? await web.callAsyncJavaScript("window.applyManuscriptFormat(base,source,from,to,key)",
                arguments: ["key": key, "base": source, "source": next, "from": from, "to": from + change.selection.length],
                in: nil, contentWorld: .page)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        // Honor the fixed scale for focus while allowing an explicit pinch gesture.
        config.ignoresViewportScaleLimits = true
        let scripts = config.userContentController
        scripts.add(context.coordinator, name: "manuscript")
        if let script = Self.script {
            scripts.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let web = ManuscriptWebView(frame: .zero, configuration: config)
        commands.web = web
        web.scrollView.keyboardDismissMode = .interactive
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.isScrollEnabled = scrolls
        web.accessibilityIdentifier = "markdownPreview"
        context.coordinator.loadPage(web)
        return web
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "manuscript")
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        // The transparent page sits over SwiftUI's canvas, so WebKit cannot infer its contrast.
        web.scrollView.indicatorStyle = context.environment.colorScheme == .dark ? .white : .black
        context.coordinator.preview = self
        context.coordinator.update(web, active: context.environment.scenePhase == .active)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var preview: ManuscriptPreview
        private var margins: EdgeInsets?
        private var ready = false
        private var active = false
        private var needsReload = false
        private var navigation: WKNavigation?
        private var backgroundOffset: CGFloat?
        private var restoreOffset: CGFloat?
        private var title: String?
        private var displayed: [Block] = []
        private var locked = false
        private var taskChanged = false
        private var wasEditing = false
        init(_ preview: ManuscriptPreview) { self.preview = preview }

        func loadPage(_ web: WKWebView) {
            ready = false
            needsReload = false
            title = nil
            margins = nil
            wasEditing = false
            navigation = web.loadHTMLString(ManuscriptPreview.page(scrolls: preview.scrolls, margins: preview.margins), baseURL: nil)
        }

        func update(_ web: WKWebView, active: Bool) {
            let resumed = active && !self.active
            if self.active && !active && ready { backgroundOffset = web.scrollView.contentOffset.y }
            self.active = active
            if active && needsReload {
                loadPage(web)
            } else if resumed && ready {
                // WebKit may resume with an empty page even when the native manuscript is unchanged.
                let checkedNavigation = navigation
                web.evaluateJavaScript("!!document.querySelector('#page > #title')") { [weak self, weak web] result, _ in
                    guard let self, let web, self.active, self.ready, self.navigation === checkedNavigation else { return }
                    if result as? Bool == true {
                        self.backgroundOffset = nil
                    } else {
                        self.recover(web)
                    }
                }
            }
            render(web)
        }

        private func recover(_ web: WKWebView) {
            preview.commands.equation = nil
            restoreOffset = backgroundOffset ?? restoreOffset ?? web.scrollView.contentOffset.y
            backgroundOffset = nil
            navigation = nil
            ready = false
            needsReload = true
            if active { loadPage(web) }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            recover(webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let navigation, navigation === self.navigation else { return }
            ready = true
            render(webView)
        }
        func render(_ web: WKWebView) {
            guard ready else { return }
            if margins != preview.margins {
                margins = preview.margins
                web.callAsyncJavaScript("""
                    const page = document.getElementById("page");
                    page.style.setProperty("--left", left + "px");
                    page.style.setProperty("--right", right + "px");
                    page.style.setProperty("--top", above + "px");
                    page.style.setProperty("--bottom", below + "px");
                    document.documentElement.style.scrollPaddingBottom = below + "px";
                    """, arguments: ["left": preview.margins.leading, "right": preview.margins.trailing,
                                      "above": preview.margins.top, "below": preview.margins.bottom],
                    in: nil, in: .page, completionHandler: nil)
            }
            let began = preview.editing && !wasEditing
            let ended = !preview.editing && wasEditing
            wasEditing = preview.editing
            // During input WebKit owns the live DOM and sends draft changes to Swift.
            // Feeding a draft back on each keystroke would break selection and IME.
            if preview.editing && title != nil && !preview.readOnly && !taskChanged {
                if began {
                    preview.commands.beginEditing(at: preview.focus)
                }
                return
            }
            guard taskChanged || ended || title != preview.title || displayed != preview.blocks || locked != preview.readOnly else { return }
            taskChanged = false
            title = preview.title
            displayed = preview.blocks
            locked = preview.readOnly
            let currentNavigation = navigation
            let offset = restoreOffset
            web.callAsyncJavaScript("""
                if (ended) window.endManuscriptEditing();
                window.showManuscript(title, blocks, readOnly);
                if (panelOpen) window.setManuscriptFormatPanel(true);
                if (restoreScroll) window.scrollTo(0, offset);
                """, arguments: ["ended": ended, "panelOpen": preview.commands.panelOpen && preview.editing, "restoreScroll": offset != nil, "offset": offset ?? 0,
                "title": preview.title, "readOnly": preview.readOnly,
                "blocks": preview.blocks.map { ["key": $0.key, "source": $0.source, "editable": $0.editable] as [String: Any] }
            ], in: nil, in: .page) { [weak self] result in
                guard let self, self.navigation === currentNavigation, case .success = result else { return }
                self.restoreOffset = nil
                guard began, self.preview.editing else { return }
                self.preview.commands.beginEditing(at: self.preview.focus)
            }
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let data = message.body as? [String: Any], let type = data["type"] as? String, let key = data["key"] as? String else { return }
            switch type {
            case "height":
                if !preview.scrolls, let h = data["value"] as? Double, h.isFinite, h >= 0 { preview.height = ceil(h) }
            case "formatSelection":
                if let offsets = data["value"] as? [Int], offsets.count == 2 {
                    preview.commands.selection = .init(key: key, range: NSRange(location: offsets[0], length: offsets[1]))
                }
            case "tableCell":
                preview.inTable = data["value"] as? Bool == true
            case "equation":
                guard !preview.readOnly, let data = data["value"] as? [String: Any],
                      let id = data["id"] as? Int, let latex = data["latex"] as? String,
                      let before = data["before"] as? String, let after = data["after"] as? String else { return }
                preview.commands.equation = Equation(id: id, key: key, before: before, after: after, latex: latex, mathML: data["mathML"] as? String ?? "")
            case "focusEquation":
                if let id = data["value"] as? Int, id == preview.commands.equation?.id { preview.commands.equation?.focusRequest += 1 }
            case "closeEquation":
                if let id = data["value"] as? Int, id == preview.commands.equation?.id { preview.commands.equation = nil }
            case "edit":
                if !preview.readOnly { preview.edit() }
            case "title", "body":
                if !preview.readOnly, let source = data["value"] as? String {
                    preview.change(type == "title" ? nil : key, source)
                }
            case "undo":
                if let enabled = data["value"] as? Bool, let web = message.webView {
                    preview.updateUndo(enabled, web) { [weak web] in web?.evaluateJavaScript("document.execCommand('undo')") }
                }
            case "task":
                if !preview.readOnly, let offset = data["value"] as? Int {
                    taskChanged = true
                    preview.toggleTask(key, offset)
                }
            case "link":
                if let href = data["value"] as? String, let url = URL(string: href),
                   ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url) }
            default: break
            }
        }
    }

    static func page(scrolls: Bool, margins: EdgeInsets) -> String {
        """
    <!doctype html><html lang="\(AppLanguage.current.rawValue)"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>
    :root{color-scheme:light dark;font:-apple-system-body;-webkit-text-size-adjust:100%;color:CanvasText}
    *{box-sizing:border-box}body{margin:0}
    #page{--left:\(margins.leading)px;--right:\(margins.trailing)px;padding-inline:var(--left) var(--right);
      display:flow-root;overflow-wrap:anywhere;line-height:\(ManuscriptTypography.bodyLineHeight)}
    body.standalone #page{--top:\(margins.top)px;--bottom:\(margins.bottom)px;
      padding-block:calc(var(--top) + \(ManuscriptTypography.topInset)px) calc(var(--bottom) + \(ManuscriptTypography.bottomInset)px)}
    #title{font-size:\(ManuscriptTypography.Size.title.scale)rem;line-height:\(ManuscriptTypography.headingLineHeight);font-weight:700;margin:0 0 \(ManuscriptTypography.titleGap)rem}
    h1,h2,h3,h4,h5,h6{line-height:\(ManuscriptTypography.headingLineHeight);font-weight:600;margin:\(ManuscriptTypography.sectionGap)rem 0 \(ManuscriptTypography.paragraphGap)rem}
    h1{font-size:\(ManuscriptTypography.Size.heading.scale)rem}h2{font-size:\(ManuscriptTypography.Size.subheading.scale)rem}
    h3,h4,h5,h6{font-size:\(ManuscriptTypography.Size.minorHeading.scale)rem}
    article>:first-child{margin-top:0}
    aside{color:GrayText}article+article,aside+article,article+aside{margin-top:.75em}
    p,ul,ol,blockquote,pre,.nomi-math-block{margin:0 0 \(ManuscriptTypography.paragraphGap)rem}
    article>:last-child{margin-bottom:0}
    ul,ol{padding-inline-start:1.45em}li>p{margin:.2em 0}li>ul,li>ol{margin:0}
    li::marker{color:-apple-system-secondary-label}.task-list-item{list-style:none}
    ::highlight(format-selection){background-color:color-mix(in srgb, CanvasText 22%, transparent)}
    [hidden]{display:none!important}.source-field{outline:none;white-space:pre-wrap;overflow-wrap:anywhere;min-width:1px}
    .source-field:empty::before{content:"\u{200b}"}
    .editing-equation>:not(.equation-preview){display:none!important}
    .task-list-item,.task-list-item>p:first-child{position:relative;min-block-size:1lh}
    .task-list-item input[type=checkbox]{position:absolute;inset-inline-end:calc(100% + .4em);inset-block-start:.5lh;
      translate:0 -50%;margin:0;font:inherit;inline-size:max(16px,1em);block-size:max(16px,1em)}
    a{color:LinkText}
    code,pre{font-family:ui-monospace,monospace;background:rgba(128,128,128,.14);border-radius:4px}
    code{font-size:.91em;padding:.06em .22em}pre{padding:.75em;overflow:auto}pre code{background:transparent;padding:0}
    blockquote{margin-inline:0;border-inline-start:2px solid rgba(128,128,128,.42);padding-inline-start:.75em;color:-apple-system-secondary-label}
    .table-scroll{overflow-x:auto;margin:.5em calc(-1 * var(--right)) .85em calc(-1 * var(--left));
      padding:24px calc(var(--right) + 2px) 2px calc(var(--left) + 24px)}
    table{border-collapse:collapse;width:100%;margin:0}
    th,td{position:relative;border:1px solid rgba(128,128,128,.4);padding:.35em .65em;min-width:5em;height:2.2em}
    .cell-content,.table-scroll .source-field{display:block;min-height:1.4em}
    .table-handle,.table-actions button{appearance:none;border:0;color:CanvasText;font:inherit;cursor:pointer;touch-action:manipulation}
    .table-handle{position:absolute;background:transparent;color:GrayText;font:bold 13px system-ui;letter-spacing:1px;z-index:1}
    .table-handle.row{right:100%;top:0;width:24px;height:100%;writing-mode:vertical-rl}
    .table-handle.column{bottom:100%;left:0;height:24px;width:100%}
    .table-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:.5em}
    .table-actions button{padding:.5em .65em;border-radius:8px;background:rgba(128,128,128,.16)}
    .table-actions button:disabled{opacity:.35}
    [data-start][role=button]{cursor:pointer}[data-start][role=button] math{pointer-events:none}
    math[display=block]{overflow-x:auto} .nomi-math-block{overflow:auto;padding-block:.15em;margin-block-start:\(ManuscriptTypography.paragraphGap)rem}
    [data-active-equation]{background:color-mix(in srgb,CanvasText 16%,transparent);border-radius:.25em}
    [data-formula][data-active-equation]{box-shadow:0 0 0 .12em color-mix(in srgb,CanvasText 16%,transparent)}
    .nomi-math-block math{margin-inline:0 auto}.nomi-math-block[data-math-align=center] math{margin-inline:auto}
    .nomi-math-block[data-math-align=right] math{margin-inline:auto 0} hr{border:0;border-top:1px solid rgba(128,128,128,.28);margin:1em 0}
    </style></head><body class="\(scrolls ? "standalone" : "embedded")"><main id="page"></main></body></html>
    """
    }
}
