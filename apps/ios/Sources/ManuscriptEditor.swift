import SwiftUI
import WebKit

enum ManuscriptCaret: Equatable {
    case title, end
    case position(block: String, offset: Int)
}

struct ManuscriptEditor: View {
    @Binding var draft: Manuscript
    let textRail: EdgeInsets
    let horizontalToolbar: Bool
    let editing: Bool
    let readOnly: Bool
    let caret: ManuscriptCaret?
    let children: [Manuscript]
    let openChild: (Manuscript) -> Void
    let beginEditing: (ManuscriptCaret) -> Void
    let finishEditing: () -> Void
    let toggleTask: (String, Int) -> Void
    let editingChanged: (_ input: UITextView, _ began: Bool) -> Void
    let richUndo: (Bool, UIView, @escaping () -> Void) -> Void
    let richLayout: Bool
    @State private var keyboardVisible = false
    @State private var formatBarHeight: CGFloat = 0
    @State private var inTable = false
    @State private var richFocus: ManuscriptPreview.Focus?
    @State private var commands = ManuscriptPreview.Commands()
    @State private var previewHeight: CGFloat = 100
    @State private var blockFields = NSMapTable<NSString, UITextView>.strongToWeakObjects()

    private func focusBlock(_ id: String, atEnd: Bool) {
        guard let field = blockFields.object(forKey: id as NSString) else { return }
        field.becomeFirstResponder()
        field.selectedRange = NSRange(location: atEnd ? field.textStorage.length : 0, length: 0)
        field.scrollRangeToVisible(field.selectedRange)
    }

    // Keep desktop block IDs and read-only attachments intact. Only a Markdown
    // block directly after the title can share the title's native text storage.
    private var firstBody: Binding<String>? {
        if !draft.usesBlockEditor { return $draft.body }
        return draft.parts.first?.editable == true ? $draft.parts[0].text : nil
    }

    private var previewBlocks: [ManuscriptPreview.Block] {
        guard richLayout || richFocus != nil, ManuscriptPreview.script != nil else { return [] }
        if !draft.usesBlockEditor {
            return [.init(key: "", source: draft.body, editable: true)]
        }
        return draft.parts.enumerated().map { index, part in
            .init(key: index == 0 && part.editable ? "" : part.id, source: part.text, editable: part.editable)
        }
    }

    private func change(_ key: String?, _ source: String) {
        if let key {
            if key.isEmpty { firstBody?.wrappedValue = source }
            else if let index = draft.parts.firstIndex(where: { $0.id == key && $0.editable }) {
                draft.parts[index].text = source
            }
        } else { draft.title = source }
    }

    private func preview(_ blocks: [ManuscriptPreview.Block], scrolls: Bool, margins: EdgeInsets) -> some View {
        ManuscriptPreview(title: draft.title, blocks: blocks, scrolls: scrolls, margins: margins, readOnly: readOnly,
                          editing: editing, focus: richFocus, commands: commands,
                          edit: { if !editing { beginEditing(.end) } },
                          change: change, updateUndo: richUndo,
                          toggleTask: toggleTask, inTable: $inTable, height: $previewHeight)
            .frame(height: scrolls ? nil : previewHeight)
            .frame(maxHeight: scrolls ? .infinity : nil)
    }

    private func document(in geometry: GeometryProxy, topOverlap: CGFloat = 0, bottomOverlap: CGFloat = 0) -> some View {
        // The inset rail already includes space between its edge and the floating buttons.
        let leading = textRail.leading + (textRail.leading > 0 ? ManuscriptTypography.railGutter : ManuscriptTypography.gutter)
        let trailing = textRail.trailing + (textRail.trailing > 0 ? ManuscriptTypography.railGutter : ManuscriptTypography.gutter)
        let extra = max(0, (geometry.size.width - leading - trailing - ManuscriptTypography.columnWidth) / 2)
        let margins = EdgeInsets(top: 0, leading: leading + extra, bottom: 0, trailing: trailing + extra)
        var scrollMargins = margins
        scrollMargins.top = topOverlap
        scrollMargins.bottom = bottomOverlap
        let firstID = draft.parts.first?.editable == true ? draft.parts.first?.id : nil
        let targetPart = caret == .end ? draft.parts.last(where: \.editable)?.id : nil
        let targetKey = if case let .position(block, _) = caret { block }
                        else { targetPart == firstID ? "" : targetPart ?? "" }
        let firstFocused = targetKey.isEmpty
        let otherBlocks = draft.parts.filter { $0.editable && $0.id != firstID }.map(\.id)
        let scrollDocument = draft.usesBlockEditor || !children.isEmpty
        let rendered = previewBlocks
        let first = ManuscriptText(title: $draft.title, bodyText: firstBody,
                                   editing: editing, readOnly: readOnly, caret: firstFocused ? caret : nil,
                                   formatCommands: commands, blockKey: "", editingChanged: editingChanged, scrolls: !scrollDocument, margins: scrollMargins,
                                   register: { blockFields.setObject($0, forKey: "") },
                                   crossBoundary: {
                                       if let next = otherBlocks.first { focusBlock(next, atEnd: false) }
                                   },
                                   renderRichContent: { richFocus = .init(key: "", offset: $0) })
        return Group {
            if scrollDocument {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !rendered.isEmpty {
                            preview(rendered, scrolls: false, margins: margins)
                        } else {
                            first
                            ForEach($draft.parts) { $part in
                                if part.id != firstID {
                                    if part.editable {
                                        ManuscriptText(title: nil, bodyText: $part.text,
                                                       editing: editing, readOnly: readOnly, caret: part.id == targetKey ? caret : nil,
                                                       formatCommands: commands, blockKey: part.id, editingChanged: editingChanged, scrolls: false, margins: margins,
                                                       register: { blockFields.setObject($0, forKey: part.id as NSString) },
                                                       crossBoundary: {
                                                           let previous = otherBlocks.prefix { $0 != part.id }.last
                                                           focusBlock(previous ?? "", atEnd: true)
                                                       }, renderRichContent: { richFocus = .init(key: part.id, offset: $0) })
                                    } else {
                                        Text(part.text).foregroundStyle(.secondary).padding(margins)
                                    }
                                }
                            }
                        }
                        if !children.isEmpty {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("子文稿")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                                    .accessibilityAddTraits(.isHeader)
                                ForEach(children) { child in
                                    Button { openChild(child) } label: {
                                        HStack {
                                            Label(child.title, systemImage: "doc.text")
                                            Spacer()
                                            Image(systemName: "chevron.right").foregroundStyle(.secondary)
                                        }
                                        .frame(minHeight: 44).contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("childDocument")
                                }
                            }
                            .padding(margins)
                        }
                        Color.clear.frame(maxWidth: .infinity, minHeight: max(52, bottomOverlap))
                            .contentShape(Rectangle()).onTapGesture {
                                if editing && !rendered.isEmpty { commands.beginEditing(at: nil) }
                                else if editing { focusBlock(otherBlocks.last ?? "", atEnd: true) }
                                else if !readOnly { beginEditing(.end) }
                            }.accessibilityHidden(true)
                    }
                    .padding(.top, ManuscriptTypography.topInset + topOverlap)
                    .padding(.bottom, bottomOverlap)
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .top)
                }
                .contentMargins(.horizontal, 0, for: .scrollContent)
                .scrollDismissesKeyboard(.interactively)
                .scrollBounceBehavior(.always, axes: .vertical)
            } else if !rendered.isEmpty { preview(rendered, scrolls: true, margins: scrollMargins) }
            else { first }
        }
    }

    private var scrollUnderlayEdges: Edge.Set {
        var edges: Edge.Set = horizontalToolbar ? .top : []
        if !editing { edges.insert(.bottom) }
        return edges
    }

    var body: some View {
        GeometryReader { safeArea in
            GeometryReader { viewport in
                let safe = safeArea.frame(in: .global)
                let full = viewport.frame(in: .global)
                document(in: viewport, topOverlap: max(0, safe.minY - full.minY),
                         bottomOverlap: max(editing ? formatBarHeight : 72, full.maxY - safe.maxY))
            }
            .ignoresSafeArea(.container, edges: scrollUnderlayEdges)
        }
        .background {
            // Compare the keyboard-avoiding viewport with the same window's unobstructed layout.
            GeometryReader { available in
                Color.clear
                    .onGeometryChange(for: Bool.self) { full in
                        full.frame(in: .global).maxY > available.frame(in: .global).maxY + 1
                    } action: { keyboardVisible = $0 }
                    .ignoresSafeArea(.keyboard, edges: .bottom)
            }
        }
        .onChange(of: editing) { _, now in
            if !now {
                richFocus = nil
                inTable = false
                formatBarHeight = 0
                commands.panelOpen = false
                commands.selection = .init()
            }
        }
        .overlay(alignment: .bottom) {
            if editing, !readOnly, let equation = commands.equation {
                EquationInput(latex: Binding(
                    get: { commands.equation?.latex ?? equation.latex },
                    set: { latex in
                        guard commands.equation?.id == equation.id else { return }
                        change(equation.key, equation.before + latex + equation.after)
                        commands.updateEquation(equation, latex: latex)
                    }), mathML: equation.mathML, focusRequest: equation.focusRequest, finish: finishEditing)
                    .id(equation.id)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { dockTop in
                        commands.revealEquation(equation.id, above: dockTop)
                    }
                    .padding(.horizontal, 8)
                    .padding(textRail)
                    .padding(.bottom, 6)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { formatBarHeight = $0 }
                    .onDisappear { formatBarHeight = 0 }
            } else if editing && (keyboardVisible || commands.panelOpen) && !readOnly && (firstBody != nil || draft.parts.contains(where: \.editable)) {
                let selection = commands.selection
                let body = selection.key.isEmpty ? firstBody?.wrappedValue : draft.parts.first { $0.id == selection.key }?.text
                let bar = ManuscriptFormatBar(inTable: inTable, selection: selection,
                                    styles: ManuscriptFormat.selectedStyles(in: body ?? "", range: selection.range),
                                    panelOpen: Binding(get: { commands.panelOpen }, set: { open in
                                        commands.panelOpen = open
                                        commands.web?.callAsyncJavaScript("window.setManuscriptFormatPanel(open)",
                                            arguments: ["open": open], in: nil, in: .page, completionHandler: nil)
                                    })) { format in
                    if !previewBlocks.isEmpty { commands.format(format) }
                    else if let field = blockFields.objectEnumerator()?.allObjects.compactMap({ $0 as? ManuscriptInput }).first(where: \.isFirstResponder) {
                        field.format?(format)
                    }
                }
                if commands.panelOpen {
                    Color.clear.preference(key: ManuscriptPanelPreference.self,
                                           value: ManuscriptPanelDock(bar: bar, height: $formatBarHeight))
                        .allowsHitTesting(false)
                } else {
                    bar.padding(.horizontal, 8)
                        .padding(textRail)
                        .padding(.bottom, 6)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { formatBarHeight = $0 }
                        .onDisappear { if !commands.panelOpen { formatBarHeight = 0 } }
                }
            }
        }
        .ignoresSafeArea(.container, edges: editing ? [] : .bottom)
    }
}

private struct EquationInput: View {
    @Binding var latex: String
    let mathML: String
    let focusRequest: Int
    let finish: () -> Void
    @FocusState private var focused: Bool
    @ScaledMetric(relativeTo: .body) private var previewHeight: CGFloat = 58

    var body: some View {
        VStack(spacing: 0) {
            EquationPreview(mathML: mathML, fallback: mathML.isEmpty ? latex : "")
                .frame(height: min(previewHeight, 96))
                .accessibilityIdentifier("equationPreview")
            Divider().padding(.horizontal, 12)
            HStack(spacing: 8) {
                TextField("LaTeX", text: $latex, axis: .vertical)
                    .accessibilityLabel(Text(verbatim: "LaTeX"))
                    .accessibilityIdentifier("equationSource")
                    .font(.system(.body, design: .monospaced))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .lineLimit(1...3)
                    .focused($focused)
                Button(action: finish) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color(uiColor: .systemBackground))
                        .frame(width: 32, height: 32)
                        .background(.primary, in: Circle())
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("完成编辑"))
                .accessibilityIdentifier("finishEquation")
            }
            .padding(.leading, 14)
            .padding(.trailing, 4)
        }
        .frame(maxWidth: 620)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .task(id: focusRequest) { focused = true }
    }
}

// The reader supplies its last successfully typeset MathML to both views.
// Replacing only the preview contents keeps the native source field focused.
private struct EquationPreview: UIViewRepresentable {
    let mathML: String
    let fallback: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.navigationDelegate = context.coordinator
        context.coordinator.load(web)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        let coordinator = context.coordinator
        guard coordinator.mathML != mathML || coordinator.fallback != fallback else { return }
        coordinator.mathML = mathML
        coordinator.fallback = fallback
        coordinator.render(web)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var mathML = ""
        var fallback = ""
        private var ready = false

        func load(_ web: WKWebView) {
            ready = false
            web.loadHTMLString("""
                <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'">
                <style>:root{color-scheme:light dark;font:-apple-system-body;color:CanvasText}
                body{margin:0}main{box-sizing:border-box;display:grid;place-items:center;width:max-content;
                min-width:100%;min-height:100vh;padding:4px 12px;font-size:1.15rem}</style><main></main>
                """, baseURL: nil)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            render(webView)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { load(webView) }

        func render(_ web: WKWebView) {
            guard ready else { return }
            web.callAsyncJavaScript("""
                const preview = document.querySelector("main");
                if (markup) preview.innerHTML = markup;
                else preview.textContent = fallback;
                """, arguments: ["markup": mathML, "fallback": fallback], in: nil, in: .page, completionHandler: nil)
        }
    }
}

private final class ManuscriptInput: UITextView {
    var format: ((ManuscriptFormat) -> Void)?
    var backFromStart: (() -> Void)?

    override func deleteBackward() {
        if let backFromStart, selectedRange == NSRange(location: 0, length: 0), markedTextRange == nil {
            backFromStart()
        } else { super.deleteBackward() }
    }
}

private struct ManuscriptText: UIViewRepresentable {
    var title: Binding<String>?
    var bodyText: Binding<String>?
    let editing: Bool
    let readOnly: Bool
    let caret: ManuscriptCaret?
    let formatCommands: ManuscriptPreview.Commands
    let blockKey: String
    let editingChanged: (_ input: UITextView, _ began: Bool) -> Void
    let scrolls: Bool
    let margins: EdgeInsets
    let register: (UITextView) -> Void
    let crossBoundary: () -> Void

    let renderRichContent: (Int) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = ManuscriptInput()
        register(view)
        view.backgroundColor = .clear
        view.contentInsetAdjustmentBehavior = .never
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.isScrollEnabled = scrolls
        if scrolls {
            view.alwaysBounceVertical = true
            view.keyboardDismissMode = .interactive
        }
        view.adjustsFontForContentSizeCategory = true
        view.textColor = .label
        view.font = ManuscriptTypography.Size.body.font(view.traitCollection)
        view.accessibilityLabel = title == nil ? AppLanguage.text("正文块") : AppLanguage.text("文稿")
        view.delegate = context.coordinator
        view.format = { [weak view, weak coordinator = context.coordinator] format in
            if let view { coordinator?.apply(format, to: view) }
        }
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        let insets = UIEdgeInsets(top: scrolls ? ManuscriptTypography.topInset + margins.top : 0, left: margins.leading,
                                  bottom: scrolls ? ManuscriptTypography.bottomInset : 0, right: margins.trailing)
        if view.textContainerInset != insets { view.textContainerInset = insets }
        // Keep the caret reachable above floating controls while text scrolls behind them.
        let clearance = scrolls ? margins.bottom : 0
        if view.contentInset.bottom != clearance { view.contentInset.bottom = clearance }
        let coordinator = context.coordinator
        coordinator.editor = self
        if let field = view as? ManuscriptInput {
            let suppressKeyboard = editing && formatCommands.panelOpen
            if (field.inputView != nil) != suppressKeyboard {
                field.inputView = suppressKeyboard ? UIView(frame: .zero) : nil
                if field.isFirstResponder { field.reloadInputViews() }
            }
        }
        view.isEditable = !readOnly
        (view as? ManuscriptInput)?.backFromStart = title == nil ? crossBoundary : nil
        view.accessibilityIdentifier = title == nil ? "blockText" : (editing ? "manuscriptText" : "manuscriptReader")
        if !editing && view.isFirstResponder { view.resignFirstResponder() }

        // A tapped manuscript keeps its text storage, layout and selection.
        // Reload only on first display or when the saved document actually changes.
        if !coordinator.loaded || !editing {
            let heading = title?.wrappedValue ?? ""
            let body = bodyText?.wrappedValue ?? ""
            let separator = title != nil && bodyText != nil && (!editing || !body.isEmpty || caret == .end)
            let source = heading + (separator ? "\n" : "") + body
            if !coordinator.loaded || view.text != source {
                view.text = source
                coordinator.style(view)
            }
            coordinator.loaded = true
        }
        if coordinator.contentSize != view.traitCollection.preferredContentSizeCategory {
            coordinator.contentSize = view.traitCollection.preferredContentSizeCategory
            coordinator.style(view)
        }
        if editing && !coordinator.wasEditing, !view.isFirstResponder, let caret {
            DispatchQueue.main.async {
                guard view.window != nil, coordinator.editor.editing else { return }
                view.becomeFirstResponder()
                let offset: Int
                switch caret {
                case .title: offset = 0
                case .end: offset = view.textStorage.length
                case let .position(_, position): offset = min(max(0, position), view.textStorage.length)
                }
                view.selectedRange = NSRange(location: offset, length: 0)
                view.scrollRangeToVisible(view.selectedRange)
            }
        }
        coordinator.wasEditing = editing
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard !scrolls, let width = proposal.width else { return nil }
        return uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var editor: ManuscriptText
        var wasEditing = false
        var loaded = false
        var contentSize: UIContentSizeCategory?
        var replacement: NSRange?
        var changedFence = false

        func apply(_ format: ManuscriptFormat, to view: UITextView) {
            guard !editor.readOnly, editor.bodyText != nil, view.isFirstResponder else { return }
            view.unmarkText()
            let source = view.textStorage.string as NSString
            let separator = source.range(of: "\n")
            let needsSeparator = editor.title != nil && separator.location == NSNotFound
            let start = editor.title == nil ? 0 : (needsSeparator ? source.length : NSMaxRange(separator))
            let selection = view.selectedRange
            let from = max(start, selection.location)
            let bodyRange = NSRange(location: from - start, length: max(0, NSMaxRange(selection) - from))
            let body = source.substring(from: start) as NSString
            guard let change = format.change(in: body, selection: bodyRange) else { return }
            if format == .table || format == .divider {
                // The rich surface takes ownership immediately. A keyboard
                // replacement here can smart-substitute the GFM separator.
                editor.bodyText?.wrappedValue = body.replacingCharacters(in: change.range, with: change.text)
                editor.renderRichContent(change.range.location + change.selection.location)
                return
            }
            guard let lower = view.position(from: view.beginningOfDocument, offset: start + change.range.location),
                  let upper = view.position(from: lower, offset: change.range.length),
                  let range = view.textRange(from: lower, to: upper) else { return }
            let prefix = needsSeparator ? "\n" : ""
            view.replace(range, withText: prefix + change.text)
            view.selectedRange = NSRange(location: start + change.range.location + prefix.utf16.count + change.selection.location,
                                         length: change.selection.length)
            view.scrollRangeToVisible(view.selectedRange)
        }

        func textViewShouldBeginEditing(_ textView: UITextView) -> Bool { !editor.readOnly }

        func textViewDidBeginEditing(_ textView: UITextView) { editor.editingChanged(textView, true) }

        init(_ editor: ManuscriptText) { self.editor = editor }

        func textViewDidChange(_ view: UITextView) {
            let text = view.text ?? ""
            if let title = editor.title {
                let lines = text.split(maxSplits: 1, omittingEmptySubsequences: false, whereSeparator: \.isNewline)
                title.wrappedValue = lines.first.map(String.init) ?? ""
                editor.bodyText?.wrappedValue = lines.count > 1 ? String(lines[1]) : ""
            } else { editor.bodyText?.wrappedValue = text }
            if view.markedTextRange == nil { style(view, changed: changedFence ? nil : replacement) }
            replacement = nil
            editor.editingChanged(view, false)
            // Complete the native composition before moving a newly written
            // formula to the rich surface. Preserve the caret in the Markdown.
            if view.markedTextRange == nil, let body = editor.bodyText?.wrappedValue,
               let cursor = view.selectedTextRange, cursor.isEmpty {
                let offset = view.selectedRange.location - (editor.title.map { $0.wrappedValue.utf16.count + 1 } ?? 0)
                if ManuscriptPreview.hasCompletedMath(in: body, before: offset) {
                    editor.renderRichContent(offset)
                }
            }
        }

        func textView(_ view: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            let previousLine = (view.textStorage.string as NSString).lineRange(for: range)
            let previous = (view.textStorage.string as NSString).substring(with: previousLine)
            changedFence = [previous, text].contains { $0.contains("```") || $0.contains("~~~") || $0.contains("$$") } ||
                text.contains(where: { "`~$".contains($0) })
            replacement = NSRange(location: range.location, length: text.utf16.count)
            guard editor.bodyText == nil && text.contains(where: \.isNewline) else { return true }
            if text == "\n" { editor.crossBoundary() }
            return false
        }

        func style(_ view: UITextView, changed: NSRange? = nil) {
            ManuscriptTypography.apply(to: view.textStorage, hasTitle: editor.title != nil,
                                       changed: changed, traits: view.traitCollection, editingSource: editor.editing)
            textViewDidChangeSelection(view)
        }

        func textViewDidChangeSelection(_ view: UITextView) {
            guard view.markedTextRange == nil else { return }
            let source = view.textStorage.string as NSString
            let separator = source.range(of: "\n")
            let inTitle = editor.title != nil && view.selectedRange.location <= separator.location
            if view.isFirstResponder {
                let start = editor.title == nil ? 0 : (inTitle ? view.selectedRange.location : NSMaxRange(separator))
                let range = NSRange(location: view.selectedRange.location - start, length: inTitle ? 0 : view.selectedRange.length)
                let selection = ManuscriptFormatSelection(key: editor.blockKey, range: range)
                if editor.formatCommands.selection != selection { editor.formatCommands.selection = selection }
            }
            view.typingAttributes = ManuscriptTypography.attributes(size: inTitle ? .title : .body, traits: view.traitCollection)
        }
    }
}
