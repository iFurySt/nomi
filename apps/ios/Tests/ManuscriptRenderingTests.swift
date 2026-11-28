import XCTest
import WebKit
import SwiftUI
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

    @MainActor func testRepeatableInlineStyles() throws {
        let word = "排版🌱"
        var text = word
        var range = NSRange(location: 0, length: word.utf16.count)
        func toggle(_ style: ManuscriptFormat) throws {
            let change = try XCTUnwrap(style.change(in: text as NSString, selection: range))
            text = (text as NSString).replacingCharacters(in: change.range, with: change.text)
            range = NSRange(location: change.range.location + change.selection.location, length: change.selection.length)
            XCTAssertEqual((text as NSString).substring(with: range), word)
        }
        try toggle(.bold)
        try toggle(.underline)
        try toggle(.italic)
        XCTAssertEqual(ManuscriptFormat.selectedStyles(in: text, range: range), [.bold, .underline, .italic, .paragraph])
        let storage = NSTextStorage(string: text)
        ManuscriptTypography.apply(to: storage, hasTitle: false, changed: nil, traits: UITraitCollection())
        XCTAssertEqual(storage.attribute(.underlineStyle, at: range.location, effectiveRange: nil) as? Int, 1)
        try toggle(.underline)
        XCTAssertEqual(text, "***" + word + "***")
        try toggle(.bold)
        try toggle(.italic)
        XCTAssertEqual(text, word)
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

    @MainActor func testScreenCapturePreservesInputAndSelection() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive }))
        let previousKeyWindow = scene.keyWindow
        let window = UIWindow(windowScene: scene)
        let controller = UIViewController()
        window.rootViewController = controller
        let editor = UITextView()
        let otherInput = UITextField()
        controller.view.addSubview(editor)
        controller.view.addSubview(otherInput)
        window.makeKeyAndVisible()
        defer { window.isHidden = true; previousKeyWindow?.makeKey() }
        editor.text = "选中这里继续输入"
        let range = NSRange(location: 2, length: 2)
        let session = ManuscriptKeyboardSession()
        XCTAssertTrue(editor.becomeFirstResponder())
        editor.selectedRange = range
        session.observe(editor)
        for captureBeforeBlur in [true, false] {
            if captureBeforeBlur { session.didCaptureScreen() }
            session.willHide()
            XCTAssertTrue(editor.resignFirstResponder())
            XCTAssertFalse(session.consumeDismissal())
            if !captureBeforeBlur { session.didCaptureScreen() }
            session.restoreCapturedInput()
            XCTAssertTrue(editor.isFirstResponder)
            XCTAssertEqual(editor.selectedRange, range)
        }
        session.didCaptureScreen()
        XCTAssertTrue(otherInput.becomeFirstResponder())
        session.restoreCapturedInput()
        XCTAssertTrue(otherInput.isFirstResponder)
    }

    @MainActor func testReaderIndicatorFollowsWindowAppearanceWhileOpen() async throws {
        let commands = ManuscriptPreview.Commands()
        let preview = ManuscriptPreview(title: "Reader", blocks: [
            .init(key: "body", source: String(repeating: "- item\n", count: 100), editable: true)
        ], scrolls: true, margins: EdgeInsets(), readOnly: true, editing: false,
           focus: nil, commands: commands, edit: {}, change: { _, _ in }, updateUndo: { _, _, _ in },
           toggleTask: { _, _ in }, inTable: .constant(false), height: .constant(0))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive }))
        let window = UIWindow(windowScene: scene)
        window.overrideUserInterfaceStyle = .dark
        window.rootViewController = UIHostingController(rootView: preview)
        window.isHidden = false
        defer { window.isHidden = true }

        let scrollable = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard let web = commands.web else { return false }
            return !web.isLoading && web.scrollView.contentSize.height > web.bounds.height
        }, object: nil)
        await fulfillment(of: [scrollable], timeout: 20)
        let scroll = try XCTUnwrap(commands.web?.scrollView)
        let appearances: [(UIUserInterfaceStyle, UIScrollView.IndicatorStyle)] = [
            (.dark, .white), (.light, .black), (.dark, .white)
        ]
        for (appearance, indicator) in appearances {
            window.overrideUserInterfaceStyle = appearance
            let updated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                scroll.traitCollection.userInterfaceStyle == appearance && scroll.indicatorStyle == indicator
            }, object: nil)
            await fulfillment(of: [updated], timeout: 5)
        }
    }

    @MainActor func testResumeRestoresMissingMarkdownAndPreservesHealthyPage() async throws {
        let commands = ManuscriptPreview.Commands()
        func preview(_ item: String) -> ManuscriptPreview {
            ManuscriptPreview(title: "同一篇文稿", blocks: [
                .init(key: "body", source: "- [x] " + item + String(repeating: "\n- 后续段落", count: 100), editable: true)
            ], scrolls: true, margins: EdgeInsets(), readOnly: false, editing: false, focus: nil,
               commands: commands, edit: {}, change: { _, _ in }, updateUndo: { _, _, _ in },
               toggleTask: { _, _ in }, inTable: .constant(false), height: .constant(0))
        }
        let coordinator = preview("原有清单").makeCoordinator()
        let config = WKWebViewConfiguration()
        config.userContentController.add(coordinator, name: "manuscript")
        config.userContentController.addUserScript(WKUserScript(source: try XCTUnwrap(ManuscriptPreview.script),
            injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 400), configuration: config)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = try XCTUnwrap(scene.windows.first(where: \.isKeyWindow) ?? scene.windows.first)
        window.addSubview(web)
        defer { web.removeFromSuperview() }
        web.navigationDelegate = coordinator
        commands.web = web
        func waitForPage(_ condition: String) async throws {
            let deadline = ContinuousClock.now + .seconds(12)
            while ContinuousClock.now < deadline {
                if (try? await web.evaluateJavaScript(condition)) as? Bool == true { return }
                try await Task.sleep(for: .milliseconds(50))
            }
            let state = try await web.evaluateJavaScript("[document.querySelector('li')?.textContent, window.scrollY]")
            XCTFail("Expected \(condition), got \(state) at native offset \(web.scrollView.contentOffset.y)")
        }

        coordinator.loadPage(web)
        coordinator.update(web, active: true)
        try await waitForPage("document.querySelector('li')?.textContent.includes('原有清单')")
        _ = try await web.evaluateJavaScript("window.originalTitle = document.querySelector('#title'); true")
        web.scrollView.setContentOffset(CGPoint(x: 0, y: 300), animated: false)
        try await waitForPage("window.scrollY === 300")
        coordinator.update(web, active: false)
        coordinator.update(web, active: true)
        // Drain the foreground DOM probe before checking that the live page survived.
        _ = try await web.evaluateJavaScript("true")
        try await waitForPage("window.originalTitle === document.querySelector('#title') && window.scrollY === 300")

        coordinator.update(web, active: false)
        coordinator.webViewWebContentProcessDidTerminate(web)
        coordinator.preview = preview("最新草稿")
        coordinator.update(web, active: true)
        try await waitForPage("document.querySelector('li')?.textContent.includes('最新草稿') && !!document.querySelector('input:checked') && window.scrollY === 300")

        coordinator.update(web, active: false)
        _ = try await web.evaluateJavaScript("document.querySelector('#page').replaceChildren()")
        coordinator.update(web, active: true)
        try await waitForPage("document.querySelector('#title')?.textContent === '同一篇文稿' && !!document.querySelector('input:checked')")
    }

    @MainActor func testOfflineMarkdownProducesSemanticContent() async throws {
        let config = WKWebViewConfiguration()
        config.userContentController.add(DiscardReaderMessages(), name: "manuscript")
        let script = try XCTUnwrap(ManuscriptPreview.script)
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 500, height: 800), configuration: config)
        web.scrollView.contentInsetAdjustmentBehavior = .never
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
        web.loadHTMLString(ManuscriptPreview.page(scrolls: true, margins: EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 104)), baseURL: nil)
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
            const correctLatex = first.hasAttribute("data-active-equation") && first.querySelector("math") && !first.hidden;
            window.updateManuscriptEquation(1, "T");
            const changed = window.manuscriptSelection().source;
            window.endManuscriptEditing();
            window.showManuscript("观察",[{...blocks[0],source:changed}],true);
            document.querySelector("[data-formula]").click();
            return [steady, correctLatex, changed === source.replace("\\tau","T").replace("记录结果","记录新结果"),
              document.querySelectorAll("math").length === 2, !document.querySelector(".source-field")];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(behavior as? [Bool], Array(repeating: true, count: 5))
        let softBreak = try await web.callAsyncJavaScript(#"""
            const source = "- 滤杯、滤纸和分享壶\n  手冲壶与电子秤\n  - 先将电子秤归零";
            window.showManuscript("手冲", [{key:"list", source, editable:true}], false);
            const runs = [...document.querySelectorAll("li span[data-start]")];
            const tap = runs.find(run => run.textContent === "手冲壶与电子秤");
            if (!tap) return [];
            const box = tap.getBoundingClientRect();
            getSelection().setBaseAndExtent(tap.firstChild, 0, tap.firstChild, 3);
            tap.click();
            const field = document.querySelector(".source-field");
            const selected = window.manuscriptSelection();
            if (!field || !selected) return [];
            const sameLine = field.getBoundingClientRect().top === box.top;
            document.execCommand("insertText", false, "细口壶");
            const edited = window.manuscriptSelection().source;
            return [sameLine, selected.location === source.indexOf("手冲壶"), selected.length === 3,
              edited === source.replace("手冲壶", "细口壶")];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(softBreak as? [Bool], Array(repeating: true, count: 4))
        let panel = try await web.callAsyncJavaScript(#"""
            const source = "first word\n\n- second word";
            window.showManuscript("Format", [{key:"note", source, editable:true}], false);
            window.focusManuscriptAt("note", 0);
            let text = document.activeElement.firstChild;
            getSelection().setBaseAndExtent(text, 0, text, 5);
            window.setManuscriptFormatPanel(true);
            const initial = window.manuscriptBodySelection("bold");
            const first = source.replace("first", "**first**");
            window.applyManuscriptFormat(source, first, 2, 7, "note");
            const kept = getSelection().toString() === "first" && !!document.querySelector("strong");
            const second = document.querySelector("li span[data-start]").firstChild;
            const letters = document.createRange();
            letters.setStart(second, 1);
            letters.setEnd(second, 3);
            const rect = letters.getBoundingClientRect();
            second.parentElement.dispatchEvent(new MouseEvent("click", { bubbles: true,
              clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
            const next = window.manuscriptBodySelection("underline");
            const updated = first.replace("second", "<u>second</u>");
            const start = updated.indexOf("second");
            window.applyManuscriptFormat(first, updated, start, start + 6, "note");
            const underlined = document.querySelector("u")?.textContent === "second";
            const held = getSelection().toString() === "second" && !document.querySelector(".source-field");
            window.setManuscriptFormatPanel(false);
            return [initial.location === 0 && initial.length === 5, kept, next.location === first.indexOf("second"),
                    underlined, held, document.activeElement.matches(".source-field") && getSelection().toString() === "second"];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(panel as? [Bool], Array(repeating: true, count: 6))
        let numbered = try await web.callAsyncJavaScript(#"""
            const initial = "已有正文\n\n";
            window.showManuscript("列表", [{key:"sample",source:initial,editable:true}], false);
            window.focusManuscriptEnd();
            const next = initial + "1. ";
            window.applyManuscriptFormat(initial, next, next.length, next.length);
            const field = document.querySelector("ol li .source-field");
            if (!field) return false;
            field.textContent = "直接输入";
            field.dispatchEvent(new Event("input"));
            return window.manuscriptSelection().source === next + "直接输入";
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(numbered as? Bool, true)
        let table = try await web.callAsyncJavaScript(#"""
            const source = "前言🌱\n\n| A | B |\n| :--- | ---: |\n| a\\|b |  |\n\n结尾";
            window.showManuscript("表格", [{key:"sample",source,editable:true}], false);
            const at = source.indexOf("|  |") + 2;
            window.focusManuscriptAt("sample", at);
            const field = () => document.querySelector(".source-field");
            const cell = () => field()?.closest("th,td");
            const initial = cell()?.cellIndex === 1 && field().textContent === "";
            field().textContent = "水|粉";
            field().dispatchEvent(new Event("input"));
            function adjust(axis, index) {
              document.querySelector(".table-handle." + axis).click();
              document.querySelectorAll(".table-actions button")[index].click();
            }
            adjust("column", 0);
            const col = cell().cellIndex === 1 && document.querySelector("table").rows[0].cells.length === 3;
            adjust("row", 1);
            const row = cell().parentNode.rowIndex === 2 && document.querySelector("table").rows.length === 3;
            adjust("row", 2);
            adjust("column", 2);
            const result = window.manuscriptSelection().source;
            window.endManuscriptEditing();
            return [initial, col, row, result === source.replace("|  |", "| 水\\|粉 |"),
              !document.querySelector(".table-handle"), document.querySelector("tbody td").textContent === "a|b"];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(table as? [Bool], Array(repeating: true, count: 6))
        let display = try await web.callAsyncJavaScript(#"""
            const source = "前言🌱\n\n\\[\n\\frac{1}{2}\n\\]\n\n结尾";
            window.showManuscript("测试", [{key:"block",source,editable:true}], false);
            document.querySelector(".nomi-math-block").click();
            const raw = document.querySelector(".nomi-math-block annotation").textContent;
            const selected = document.querySelector(".nomi-math-block[aria-pressed=true]");
            const box = selected.getBoundingClientRect();
            const gapBefore = box.top - selected.previousElementSibling.getBoundingClientRect().bottom;
            const gapAfter = selected.nextElementSibling.getBoundingClientRect().top - box.bottom;
            const preview = window.updateManuscriptEquation(2, raw.replace("{2}", "{3}"));
            const incomplete = window.updateManuscriptEquation(2, String.fromCharCode(92) + "frac{");
            const held = selected.querySelector(".equation-preview mfrac")?.textContent.includes("3");
            window.updateManuscriptEquation(2, raw.replace("{2}", "{3}"));
            const selection = window.manuscriptSelection();
            document.querySelector("#title").click();
            return [raw.trim() === "\\frac{1}{2}", selection.key === "block",
              selection.source === source.replace("{2}", "{3}"),
              document.querySelector("math mfrac")?.textContent.includes("3"), preview.includes("<mfrac>"),
              !incomplete && held, gapBefore > 0 && Math.abs(gapBefore - gapAfter) < 1,
              !document.querySelector("[data-active-equation]")];
            """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(display as? [Bool], Array(repeating: true, count: 8))
        let taskOffsets = try await web.callAsyncJavaScript(#"""
            const source = "- [x] 称出咖啡豆\n- [ ] Weigh the beans\n  - [ ] " + "分段记录 ".repeat(30)
                + "\n\n- [ ] **Check** the result";
            window.showManuscript("Checklist", [{key:"tasks", source, editable:true}], false);
            const offsets = [];
            for (const size of [15, 22]) {
                document.documentElement.style.fontSize = size + "px";
                for (const item of document.querySelectorAll(".task-list-item")) {
                    const box = item.querySelector("input").getBoundingClientRect();
                    const text = item.querySelector("span[data-start]").firstChild;
                    const range = document.createRange();
                    range.setStart(text, 0);
                    range.setEnd(text, 1);
                    const first = range.getBoundingClientRect();
                    offsets.push((box.top + box.bottom - first.top - first.bottom) / 2);
                }
            }
            document.documentElement.style.removeProperty("font-size");
            return offsets;
            """#, arguments: [:], in: nil, contentWorld: .page)
        let offsets = try XCTUnwrap(taskOffsets as? [Double])
        XCTAssertEqual(offsets.count, 8)
        for offset in offsets { XCTAssertEqual(offset, 0, accuracy: 1) }
        // The text column can be narrower than WebKit's scroll viewport.
        web.frame = CGRect(x: 0, y: 0, width: ManuscriptTypography.columnWidth + 124, height: 480)
        let layout = try await web.callAsyncJavaScript("""
            window.showManuscript("Title", [{key:"", source:("# Heading\\n\\nText\\n\\n").repeat(60), editable:true}], true);
            await new Promise(resolve => requestAnimationFrame(resolve));
            const p = document.querySelector("p"), h = document.querySelector("p + h1");
            const size = node => parseFloat(getComputedStyle(node).fontSize);
            window.scrollTo(0, 180);
            return [p.clientWidth, document.documentElement.clientWidth, window.scrollY,
                    size(p), size(h), size(document.querySelector("#title")),
                    parseFloat(getComputedStyle(p).lineHeight), parseFloat(getComputedStyle(h).marginTop)];
            """, arguments: [:], in: nil, contentWorld: .page) as? [Double]
        let metrics = try XCTUnwrap(layout)
        XCTAssertEqual(metrics[0], Double(ManuscriptTypography.columnWidth), accuracy: 1)
        let insets = web.scrollView.adjustedContentInset
        XCTAssertEqual(metrics[1], web.bounds.width - insets.left - insets.right, accuracy: 1)
        XCTAssertGreaterThan(metrics[2], 0)
        XCTAssertEqual(metrics[3], Double(ManuscriptTypography.Size.body.font(web.traitCollection).pointSize), accuracy: 1)
        XCTAssertEqual(metrics[4] / metrics[3], ManuscriptTypography.Size.heading.scale, accuracy: 0.02)
        XCTAssertEqual(metrics[5] / metrics[3], ManuscriptTypography.Size.title.scale, accuracy: 0.02)
        XCTAssertEqual(metrics[6] / metrics[3], ManuscriptTypography.bodyLineHeight, accuracy: 0.01)
        XCTAssertEqual(metrics[7] / metrics[3], ManuscriptTypography.sectionGap, accuracy: 0.01)
        // A wide table shares the outer viewport, while prose and the first cell clear the rail.
        let overflow = try await web.callAsyncJavaScript("""
            const row = Array(14).fill("column").join("|");
            window.showManuscript("Title", [{key:"", source:"Prose\\n\\n|" + row + "|\\n|" +
                Array(14).fill("---").join("|") + "|\\n|" + row + "|", editable:true}], false);
            const strip = document.querySelector(".table-scroll");
            const right = node => node.getBoundingClientRect().right;
            strip.scrollLeft = 100;
            return [right(document.querySelector("p")), right(strip), strip.scrollLeft, window.scrollX];
            """, arguments: [:], in: nil, contentWorld: .page) as? [Double]
        let edges = try XCTUnwrap(overflow)
        XCTAssertEqual(edges[0], web.bounds.width - 104, accuracy: 1)
        XCTAssertEqual(edges[1], web.bounds.width, accuracy: 1)
        XCTAssertGreaterThan(edges[2], 0)
        XCTAssertEqual(edges[3], 0)

    }
}

private final class DiscardReaderMessages: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {}
}
