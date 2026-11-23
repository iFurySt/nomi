import XCTest
import WebKit
@testable import NomiMobile

final class ManuscriptRenderingTests: XCTestCase {
    func testFormattingKeepsSelectedUnicodeAndCombinesMarks() throws {
        let source = "前言🌱 **重点**" as NSString
        let selected = source.range(of: "重点")
        let italic = try XCTUnwrap(ManuscriptFormat.italic.change(in: source, selection: selected))
        XCTAssertEqual(source.replacingCharacters(in: italic.range, with: italic.text), "前言🌱 ***重点***")
        let clear = try XCTUnwrap(ManuscriptFormat.clear.change(in: source, selection: selected))
        XCTAssertEqual(source.replacingCharacters(in: clear.range, with: clear.text), "前言🌱 重点")
        let link = try XCTUnwrap(ManuscriptFormat.link.change(in: source, selection: selected))
        XCTAssertEqual((link.text as NSString).substring(with: link.selection), "https://")
        let quote = try XCTUnwrap(ManuscriptFormat.quote.change(in: "- 第一\n2. 第二", selection: NSRange(location: 0, length: 9)))
        XCTAssertEqual(quote.text, "> 第一\n> 第二")
    }

    func testCheckboxEditsOnlyItsMarkdownBlock() {
        var note = Manuscript()
        note.usesBlockEditor = true
        note.parts = [CloudPart(id: "a", editable: false, text: "附件"),
                      CloudPart(id: "b", editable: true, text: "前言🌱\n1. [ ] 下一步")]
        XCTAssertFalse(note.toggleTask(in: "", at: 0))
        XCTAssertTrue(note.toggleTask(in: "b", at: "前言🌱\n".utf16.count))
        XCTAssertEqual(note.parts.map(\.text), ["附件", "前言🌱\n1. [x] 下一步"])
    }

    @MainActor func testOfflineMarkdownProducesSemanticContent() async throws {
        let config = WKWebViewConfiguration()
        let script = try XCTUnwrap(ManuscriptPreview.script)
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 500, height: 800), configuration: config)
        let loaded = expectation(description: "offline reader")
        let observer = web.observe(\.isLoading, options: [.new]) { _, change in
            if change.newValue == false { loaded.fulfill() }
        }
        defer { observer.invalidate() }
        web.loadHTMLString("<main id='page'></main>", baseURL: nil)
        await fulfillment(of: [loaded], timeout: 8)
        let markdown = """
        ## 主题 🌱
        - [x] **粗体**、*斜体*与~~旧文~~
        - [链接](https://example.com)

        | 表头 | B |
        | --- | --- |
        | 第一<br>第二 | $x^2$ |

        ```js
        const literal = '**raw**'
        ```
        """
        let value = try await web.callAsyncJavaScript("""
            window.showManuscript("测试", [{key:"", source:body, editable:true}, {key:"next",source:"子段",editable:true}], false);
            for (let i = 0; i < 40 && !document.querySelector('table'); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return ['h2','input:checked','strong','em','del','a[href]','td br','math msup','pre code','article[data-section="1"]']
                .filter(selector => !document.querySelector(selector));
            """, arguments: ["body": markdown], in: nil, contentWorld: .page)
        XCTAssertEqual(value as? [String], [])
    }
}
