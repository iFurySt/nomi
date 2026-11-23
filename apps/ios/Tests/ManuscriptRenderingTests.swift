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
        config.userContentController.add(DiscardReaderMessages(), name: "manuscript")
        let script = try XCTUnwrap(ManuscriptPreview.script)
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 500, height: 800), configuration: config)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive }) ?? UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = try XCTUnwrap(scene.windows.first(where: \.isKeyWindow) ?? scene.windows.first)
        window.addSubview(web)
        defer { web.removeFromSuperview() }
        let loaded = expectation(description: "offline reader")
        let observer = web.observe(\.isLoading, options: [.new]) { _, change in
            if change.newValue == false { loaded.fulfill() }
        }
        defer { observer.invalidate() }
        web.loadHTMLString(ManuscriptPreview.page, baseURL: nil)
        await fulfillment(of: [loaded], timeout: 45)
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
        let behavior = try await web.callAsyncJavaScript(#"""
            const source = "温度 $\\tau$ 改变分布。\n\n$$p_i=1$$\n\n- [ ] 记录结果";
            const blocks = [{key:"",source,editable:true}];
            window.showManuscript("观察",blocks,false);
            const heading = document.querySelector("#title");
            const box = document.querySelector("input");
            const first = document.querySelector("[data-formula]");
            const last = document.querySelector("li span[data-start]");
            const metrics = () => [heading, box, first].flatMap(e => {
              const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height];
            });
            const before = JSON.stringify(metrics());
            last.click();
            const field = document.querySelector(".source-field");
            const steady = before === JSON.stringify(metrics()) && field?.textContent === "记录结果";
            field.textContent = "记录新结果";
            field.dispatchEvent(new Event("input"));
            first.click();
            const formula = document.querySelector('.source-field[aria-label="LaTeX"]');
            const correctLatex = formula?.textContent === "\\tau";
            formula.textContent = "T";
            formula.dispatchEvent(new Event("input"));
            const changed = window.manuscriptSelection().source;
            window.endManuscriptEditing();
            window.showManuscript("观察",[{...blocks[0],source:changed}],true);
            document.querySelector("[data-formula]").click();
            return [steady, correctLatex, changed === source.replace("\\tau","T").replace("记录结果","记录新结果"),
              document.querySelectorAll("math").length === 2, !document.querySelector(".source-field")];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(behavior as? [Bool], Array(repeating: true, count: 5))
        let display = try await web.callAsyncJavaScript(#"""
            const source = "前言🌱\n\n\\[\n\\frac{1}{2}\n\\]\n\n结尾";
            window.showManuscript("测试", [{key:"block",source,editable:true}], false);
            document.querySelector(".nomi-math-block").click();
            const field = document.querySelector('.source-field[aria-label="LaTeX"]');
            const raw = field.textContent;
            field.textContent = raw.replace("{2}", "{3}");
            field.dispatchEvent(new Event("input"));
            const selection = window.manuscriptSelection();
            document.querySelector("#title").click();
            return [raw.trim() === "\\frac{1}{2}", selection.key === "block",
              selection.source === source.replace("{2}", "{3}"),
              document.querySelector("math mfrac")?.textContent.includes("3")];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(display as? [Bool], Array(repeating: true, count: 4))
    }
}

private final class DiscardReaderMessages: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {}
}
