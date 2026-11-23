import SwiftUI

enum ManuscriptCaret: Equatable {
    case title, end
    case position(block: String, offset: Int)
}

struct ManuscriptEditor: View {
    @Binding var draft: Manuscript
    let editing: Bool
    let readOnly: Bool
    let caret: ManuscriptCaret?
    let children: [Manuscript]
    let openChild: (Manuscript) -> Void
    let beginEditing: (ManuscriptCaret, ManuscriptFormat?) -> Void
    let initialFormat: ManuscriptFormat?
    let toggleTask: (String, Int) -> Void
    let editingChanged: (UITextView) -> Void
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
        guard !editing, ManuscriptPreview.script != nil else { return [] }
        if !draft.usesBlockEditor {
            return ManuscriptPreview.needed(for: draft.body) ? [.init(key: "", source: draft.body, editable: true)] : []
        }
        guard draft.parts.contains(where: { $0.editable && ManuscriptPreview.needed(for: $0.text) }) else { return [] }
        return draft.parts.enumerated().map { index, part in
            .init(key: index == 0 && part.editable ? "" : part.id, source: part.text, editable: part.editable)
        }
    }

    private func preview(_ blocks: [ManuscriptPreview.Block], scrolls: Bool) -> some View {
        ManuscriptPreview(title: draft.title, blocks: blocks, scrolls: scrolls, readOnly: readOnly,
                          edit: { beginEditing(.position(block: $0, offset: $1), nil) },
                          toggleTask: toggleTask, height: $previewHeight)
            .frame(height: scrolls ? nil : previewHeight)
            .frame(maxHeight: scrolls ? .infinity : nil)
    }

    var body: some View {
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
                                   editingChanged: editingChanged, scrolls: !scrollDocument,
                                   register: { blockFields.setObject($0, forKey: "") },
                                   crossBoundary: {
                                       if let next = otherBlocks.first { focusBlock(next, atEnd: false) }
                                   }, initialFormat: initialFormat)
        Group {
            if scrollDocument {
                GeometryReader { geometry in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            if !rendered.isEmpty {
                                preview(rendered, scrolls: false)
                            } else {
                                first
                                ForEach($draft.parts) { $part in
                                    if part.id != firstID {
                                        if part.editable {
                                            ManuscriptText(title: nil, bodyText: $part.text,
                                                           editing: editing, readOnly: readOnly, caret: part.id == targetKey ? caret : nil,
                                                           editingChanged: editingChanged, scrolls: false,
                                                           register: { blockFields.setObject($0, forKey: part.id as NSString) },
                                                           crossBoundary: {
                                                               let previous = otherBlocks.prefix { $0 != part.id }.last
                                                               focusBlock(previous ?? "", atEnd: true)
                                                           }, initialFormat: initialFormat)
                                        } else {
                                            Text(part.text).foregroundStyle(.secondary)
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
                            }
                            Color.clear.frame(maxWidth: .infinity, minHeight: 52)
                                .contentShape(Rectangle()).onTapGesture {
                                    if editing { focusBlock(otherBlocks.last ?? "", atEnd: true) }
                                    else if !readOnly { beginEditing(.end, nil) }
                                }.accessibilityHidden(true)
                        }.frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .topLeading)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .scrollBounceBehavior(.always, axes: .vertical)
                }
            } else if !rendered.isEmpty { preview(rendered, scrolls: true) }
            else { first }
        }
        .frame(maxWidth: 660)
        .padding(.horizontal, 24).padding(.top, 24)
        .frame(maxWidth: .infinity)
        .safeAreaInset(edge: .bottom, alignment: editing ? .trailing : .leading, spacing: 6) {
            if !readOnly && (firstBody != nil || !otherBlocks.isEmpty) {
                ManuscriptFormatBar(editing: editing) { format in
                    if let field = blockFields.objectEnumerator()?.allObjects.compactMap({ $0 as? ManuscriptInput }).first(where: \.isFirstResponder) {
                        field.format?(format)
                    } else if !editing {
                        beginEditing(.end, format)
                    }
                }
                .padding(.leading, 16).padding(.trailing, editing ? 16 : 72)
                .padding(.bottom, editing ? 6 : 26)
            }
        }
        .ignoresSafeArea(.container, edges: editing ? [] : .bottom)
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
    let editingChanged: (UITextView) -> Void
    let scrolls: Bool
    let register: (UITextView) -> Void
    let crossBoundary: () -> Void

    var initialFormat: ManuscriptFormat?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = ManuscriptInput()
        register(view)
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.isScrollEnabled = scrolls
        if scrolls {
            view.alwaysBounceVertical = true
            view.keyboardDismissMode = .interactive
        }
        view.adjustsFontForContentSizeCategory = true
        view.textColor = .label
        view.font = UIFont.preferredFont(forTextStyle: .body)
        view.accessibilityLabel = title == nil ? "正文块" : "文稿"
        view.delegate = context.coordinator
        view.format = { [weak view, weak coordinator = context.coordinator] format in
            if let view { coordinator?.apply(format, to: view) }
        }
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        let coordinator = context.coordinator
        coordinator.editor = self
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
        if editing && !coordinator.wasEditing, let caret {
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
                if let initialFormat { coordinator.apply(initialFormat, to: view) }
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
            guard let change = format.change(in: source.substring(from: start) as NSString, selection: bodyRange),
                  let lower = view.position(from: view.beginningOfDocument, offset: start + change.range.location),
                  let upper = view.position(from: lower, offset: change.range.length),
                  let range = view.textRange(from: lower, to: upper) else { return }
            let prefix = needsSeparator ? "\n" : ""
            view.replace(range, withText: prefix + change.text)
            view.selectedRange = NSRange(location: start + change.range.location + prefix.utf16.count + change.selection.location,
                                         length: change.selection.length)
            view.scrollRangeToVisible(view.selectedRange)
        }

        func textViewShouldBeginEditing(_ textView: UITextView) -> Bool { !editor.readOnly }

        func textViewDidBeginEditing(_ textView: UITextView) { editor.editingChanged(textView) }

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
            editor.editingChanged(view)
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
            let inTitle = editor.title != nil && view.selectedRange.location <= source.range(of: "\n").location
            view.typingAttributes = ManuscriptTypography.attributes(title: inTitle, traits: view.traitCollection)
        }
    }
}
