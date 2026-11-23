import SwiftUI
import WebKit

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
    let readOnly: Bool
    let edit: (String, Int) -> Void
    let toggleTask: (String, Int) -> Void
    @Binding var height: CGFloat

    static func needed(for text: String) -> Bool {
        text.range(of: #"(?m)(^\s{0,3}(?:[-*+]\s|\d+[.)]\s|\x60{3,}|~{3,}|#{4,6}\s|>\s?|[-*_]{3,}\s*$)|\||\$|\\[\[(]|https?://|www\.|\]\(|^ {4}\S|\n(?:=+|-+)\s*(?:\n|$))"#,
                   options: .regularExpression) != nil
    }

    static let script = Bundle.main.url(forResource: "manuscript-reader", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let scripts = config.userContentController
        scripts.add(context.coordinator, name: "manuscript")
        if let script = Self.script {
            scripts.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.isScrollEnabled = scrolls
        web.accessibilityIdentifier = "markdownPreview"
        web.loadHTMLString(Self.page, baseURL: nil)
        return web
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "manuscript")
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.preview = self
        context.coordinator.render(web)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var preview: ManuscriptPreview
        var ready = false
        private var title: String?
        private var displayed: [Block] = []
        private var locked = false
        init(_ preview: ManuscriptPreview) { self.preview = preview }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            render(webView)
        }
        func render(_ web: WKWebView) {
            guard ready, title != preview.title || displayed != preview.blocks || locked != preview.readOnly else { return }
            title = preview.title
            displayed = preview.blocks
            locked = preview.readOnly
            web.callAsyncJavaScript("window.showManuscript(title, blocks, readOnly)", arguments: [
                "title": preview.title, "readOnly": preview.readOnly,
                "blocks": preview.blocks.map { ["key": $0.key, "source": $0.source, "editable": $0.editable] as [String: Any] }
            ], in: nil, in: .page, completionHandler: nil)
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let data = message.body as? [String: Any], let type = data["type"] as? String, let key = data["key"] as? String else { return }
            switch type {
            case "height":
                if !preview.scrolls, let h = data["value"] as? Double, h.isFinite, h >= 0 { preview.height = ceil(h) }
            case "edit":
                if !preview.readOnly, let offset = data["value"] as? Int { preview.edit(key, offset) }
            case "task":
                if !preview.readOnly, let offset = data["value"] as? Int { preview.toggleTask(key, offset) }
            case "link":
                if let href = data["value"] as? String, let url = URL(string: href),
                   ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url) }
            default: break
            }
        }
    }

    private static let page = """
    <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>
    :root{color-scheme:light dark;font:-apple-system-body;color:CanvasText}*{box-sizing:border-box}body{margin:0}
    #page{display:flow-root;overflow-wrap:anywhere}#title{font:-apple-system-title1;font-weight:700;margin:0 0 .45em}
    h1,h2,h3,h4,h5,h6{line-height:1.25;margin:.85em 0 .4em}article>:first-child{margin-top:0}
    aside{color:GrayText}article+article,aside+article,article+aside{margin-top:.75em}
    p,ul,ol,blockquote,table,pre{margin:.5em 0 .85em}article{line-height:1.55}
    ul,ol{padding-inline-start:1.55em}li>p{margin:.25em 0}.task-list-item{list-style:none}
    input[type=checkbox]{margin-inline-start:-1.35em}a{color:LinkText}
    code,pre{font-family:ui-monospace,monospace;background:rgba(128,128,128,.14);border-radius:4px}
    code{padding:.08em .22em}pre{padding:.75em;overflow:auto}pre code{background:transparent;padding:0}
    blockquote{margin-inline:0;border-inline-start:3px solid GrayText;padding-inline-start:.8em;color:GrayText}
    table{display:block;overflow:auto;border-collapse:collapse}th,td{border:1px solid rgba(128,128,128,.4);padding:.35em .65em;text-align:start}
    math[display=block]{overflow-x:auto} .nomi-math-block{overflow:auto}
    .nomi-math-block math{margin-inline:0 auto}.nomi-math-block[data-math-align=center] math{margin-inline:auto}
    .nomi-math-block[data-math-align=right] math{margin-inline:auto 0} hr{border:0;border-top:1px solid GrayText}
    </style></head><body><main id="page"></main></body></html>
    """
}
