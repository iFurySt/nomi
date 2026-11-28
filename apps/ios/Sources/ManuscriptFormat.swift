import SwiftUI

enum ManuscriptFormat: String, CaseIterable {
    case bold, italic, underline, strike, code, link, clear, math
    case paragraph, heading1, heading2, heading3, bullets, numbers, task, quote, fence, divider, table, equation

    var presentation: (label: String, symbol: String) {
        switch self {
        case .bold: ("粗体", "bold")
        case .italic: ("斜体", "italic")
        case .underline: ("下划线", "underline")
        case .strike: ("删除线", "strikethrough")
        case .code: ("行内代码", "chevron.left.forwardslash.chevron.right")
        case .link: ("链接", "link")
        case .clear: ("清除格式", "eraser")
        case .math: ("行内公式", "function")
        case .paragraph: ("正文", "textformat")
        case .heading1: ("大标题", "textformat.size")
        case .heading2: ("章节标题", "textformat.size")
        case .heading3: ("小标题", "textformat.size")
        case .bullets: ("项目列表", "list.bullet")
        case .numbers: ("编号列表", "list.number")
        case .task: ("待办事项", "checklist")
        case .quote: ("引用", "text.quote")
        case .fence: ("代码块", "curlybraces")
        case .divider: ("分割线", "minus")
        case .table: ("表格", "tablecells")
        case .equation: ("公式块", "sum")
        }
    }

    static let textStyles: [Self] = [.bold, .italic, .underline, .strike]

    private var delimiters: (String, String)? {
        switch self {
        case .bold: ("**", "**")
        case .italic: ("*", "*")
        case .underline: ("<u>", "</u>")
        case .strike: ("~~", "~~")
        default: nil
        }
    }

    // Walk outwards so toggling B after I or U removes just the bold pair.
    private static func wrappers(in body: NSString, around selection: NSRange) -> [(style: Self, range: NSRange)] {
        var found: [(style: Self, range: NSRange)] = []
        var inner = selection
        while let style = textStyles.first(where: { style in
            guard let (open, close) = style.delimiters else { return false }
            let start = inner.location - open.utf16.count
            let end = NSMaxRange(inner)
            return start >= 0 && end + close.utf16.count <= body.length &&
                body.substring(with: NSRange(location: start, length: open.utf16.count)) == open &&
                body.substring(with: NSRange(location: end, length: close.utf16.count)) == close
        }), let (open, close) = style.delimiters {
            inner = NSRange(location: inner.location - open.utf16.count,
                            length: inner.length + open.utf16.count + close.utf16.count)
            found.append((style, inner))
        }
        return found
    }

    static func selectedStyles(in body: String, range: NSRange) -> Set<Self> {
        guard range.location != NSNotFound, NSMaxRange(range) <= body.utf16.count else { return [] }
        let source = body as NSString
        let line = source.substring(with: source.lineRange(for: NSRange(location: range.location, length: 0)))
        let headings: [(String, Self)] = [("# ", .heading1), ("## ", .heading2), ("### ", .heading3)]
        var styles = Set(wrappers(in: source, around: range).map(\.style))
        styles.insert(headings.first { line.hasPrefix($0.0) }?.1 ?? .paragraph)
        return styles
    }

    struct Change {
        let range: NSRange
        let text: String
        let selection: NSRange // UTF-16 range within the replacement
    }

    private static let linePrefix = try! NSRegularExpression(pattern: #"^(?:#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )"#)

    private static let inlineLink = try! NSRegularExpression(pattern: #"\[((?:\\.|[^\]\n])*)\]\(((?:\\.|[^() \n]|\([^()\n]*\))+)\)"#)

    func change(in body: NSString, selection: NSRange) -> Change? {
        guard selection.location != NSNotFound, NSMaxRange(selection) <= body.length else { return nil }
        let selected = body.substring(with: selection)
        if self == .link || self == .clear {
            let line = body.lineRange(for: selection)
            let match = Self.inlineLink.matches(in: body as String, range: line).first {
                selection.location >= $0.range.location && NSMaxRange(selection) <= NSMaxRange($0.range)
            }
            if let match {
                let label = body.substring(with: match.range(at: 1))
                if self == .clear {
                    return Change(range: match.range, text: label, selection: NSRange(location: 0, length: label.utf16.count))
                }
                let href = match.range(at: 2)
                return Change(range: match.range, text: body.substring(with: match.range),
                              selection: NSRange(location: href.location - match.range.location, length: href.length))
            }
        }
        func wrap(_ marker: String, placeholder: String = "") -> Change {
            let width = marker.utf16.count
            let end = NSMaxRange(selection)
            let wrappedInBold = marker == "*" && selection.location >= 2 && end + 2 <= body.length &&
                body.substring(with: NSRange(location: selection.location - 2, length: 2)) == "**" &&
                body.substring(with: NSRange(location: end, length: 2)) == "**"
            let wrappedInBoth = wrappedInBold && selection.location >= 3 && end + 3 <= body.length &&
                body.substring(with: NSRange(location: selection.location - 3, length: 3)) == "***" &&
                body.substring(with: NSRange(location: end, length: 3)) == "***"
            if (!wrappedInBold || wrappedInBoth), selection.location >= width, end + width <= body.length,
               body.substring(with: NSRange(location: selection.location - width, length: width)) == marker,
               body.substring(with: NSRange(location: end, length: width)) == marker {
                return Change(range: NSRange(location: selection.location - width, length: selection.length + 2 * width),
                              text: selected, selection: NSRange(location: 0, length: selection.length))
            }
            if selection.length == 0, end + width <= body.length,
               body.substring(with: NSRange(location: end, length: width)) == marker {
                let line = body.lineRange(for: selection)
                let prefix = body.substring(with: NSRange(location: line.location, length: end - line.location))
                if prefix.components(separatedBy: marker).count.isMultiple(of: 2) {
                    return Change(range: NSRange(location: end, length: width), text: marker,
                                  selection: NSRange(location: width, length: 0))
                }
            }
            let content = selected.isEmpty ? placeholder : selected
            return Change(range: selection, text: marker + content + marker,
                          selection: NSRange(location: width, length: content.utf16.count))
        }
        switch self {
        case .bold, .italic, .underline, .strike:
            guard let (open, close) = delimiters else { return nil }
            if let wrapper = Self.wrappers(in: body, around: selection).first(where: { $0.style == self }) {
                let inner = NSRange(location: wrapper.range.location + open.utf16.count,
                                    length: wrapper.range.length - open.utf16.count - close.utf16.count)
                return Change(range: wrapper.range, text: body.substring(with: inner),
                              selection: NSRange(location: selection.location - inner.location, length: selection.length))
            }
            if selection.length == 0 && open == close { return wrap(open) }
            return Change(range: selection, text: open + selected + close,
                          selection: NSRange(location: open.utf16.count, length: selection.length))
        case .code:
            let longest = selected.split(whereSeparator: { $0 != "`" }).map(\.count).max() ?? 0
            return wrap(String(repeating: "`", count: longest + 1))
        case .math: return wrap("$", placeholder: "x")
        case .link:
            let url = URL(string: selected)
            let hasURL = ["http", "https", "mailto"].contains(url?.scheme?.lowercased() ?? "")
            let label = selected.isEmpty || hasURL ? AppLanguage.text("链接") : selected
            let escapedLabel = label.replacingOccurrences(of: "]", with: "\\]")
            let target = hasURL ? selected : "https://"
            return Change(range: selection, text: "[\(escapedLabel)](\(target))",
                          selection: hasURL ? NSRange(location: 1, length: label.utf16.count) :
                            NSRange(location: escapedLabel.utf16.count + 3, length: target.utf16.count))
        case .clear:
            if selection.length == 0 {
                let line = body.lineRange(for: selection)
                let value = body.substring(with: line).trimmingCharacters(in: .newlines)
                guard !value.isEmpty else { return nil }
                return change(in: body, selection: NSRange(location: line.location, length: value.utf16.count))
            }
            var range = Self.wrappers(in: body, around: selection).last?.range ?? selection
            // A native selection generally excludes the concealed opening and closing delimiters.
            for marker in ["***", "**", "~~", "__", "*", "_", "`", "$"] {
                let count = marker.utf16.count
                if range.location >= count, NSMaxRange(range) + count <= body.length,
                   body.substring(with: NSRange(location: range.location - count, length: count)) == marker,
                   body.substring(with: NSRange(location: NSMaxRange(range), length: count)) == marker {
                    range = NSRange(location: range.location - count, length: range.length + 2 * count)
                }
            }
            let parsed = try? AttributedString(markdown: selected, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
            let plain = parsed.map { String($0.characters) } ?? selected
            return Change(range: range, text: plain, selection: NSRange(location: 0, length: plain.utf16.count))
        case .fence, .equation, .table, .divider:
            let content: String
            let offset: Int
            let length: Int
            switch self {
            case .fence, .equation:
                let delimiter = self == .fence ? String(repeating: "`", count: max(3, (selected.split(whereSeparator: { $0 != "`" }).map(\.count).max() ?? 0) + 1)) : "$$"
                let value = selected.isEmpty ? (self == .fence ? "code" : "x") : selected
                content = delimiter + "\n" + value + "\n" + delimiter
                offset = delimiter.utf16.count + 1; length = value.utf16.count
            case .table:
                let value = selected.replacingOccurrences(of: "|", with: "\\|").replacingOccurrences(of: "\n", with: "<br>")
                content = "| \(value) |  |\n| --- | --- |\n|  |  |"; offset = 2; length = value.utf16.count
            default: content = "---"; offset = 3; length = 0
            }
            // A rule without a blank line can turn the preceding paragraph into a heading.
            let before = selection.location == 0 ? "" : "\n\n"
            let after = NSMaxRange(selection) == body.length ? "\n" : "\n\n"
            return Change(range: selection, text: before + content + after,
                          selection: NSRange(location: before.utf16.count + offset + (self == .divider ? 1 : 0), length: length))
        default:
            let line = body.lineRange(for: selection)
            var value = body.substring(with: line)
            let newline = value.hasSuffix("\n")
            if newline { value.removeLast() }
            let lines = value.components(separatedBy: "\n")
            var lower = selection.location - line.location
            var upper = NSMaxRange(selection) - line.location
            var originalEnd = 0
            let formatted = lines.enumerated().map { index, item in
                let prefix: String
                switch self {
                case .heading1: prefix = "# "; case .heading2: prefix = "## "; case .heading3: prefix = "### "
                case .bullets: prefix = "- "; case .numbers: prefix = "\(index + 1). "; case .task: prefix = "- [ ] "
                case .quote: prefix = "> "; default: prefix = ""
                }
                let rest = Self.linePrefix.stringByReplacingMatches(in: item, range: NSRange(location: 0, length: item.utf16.count), withTemplate: "")
                let removed = item.utf16.count - rest.utf16.count
                let delta = prefix.utf16.count - removed
                // Endpoints inside a replaced marker move to its content.
                func shift(_ endpoint: Int) -> Int {
                    let local = endpoint - originalEnd
                    return local < 0 ? 0 : (local < removed ? prefix.utf16.count - local : delta)
                }
                lower += shift(selection.location - line.location)
                upper += shift(NSMaxRange(selection) - line.location)
                originalEnd += item.utf16.count + 1
                return prefix + rest
            }.joined(separator: "\n")
            return Change(range: line, text: formatted + (newline ? "\n" : ""),
                          selection: NSRange(location: lower, length: upper - lower))
        }
    }
}

struct ManuscriptFormatSelection: Equatable {
    var key = ""
    var range = NSRange(location: 0, length: 0)
}

struct ManuscriptFormatBar: View {
    let inTable: Bool
    let selection: ManuscriptFormatSelection
    let styles: Set<ManuscriptFormat>
    @Binding var panelOpen: Bool
    let perform: (ManuscriptFormat) -> Void
    @State private var page: Int? = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum ButtonFace { case toolbar, segment, paragraph(Font) }

    private func action(_ format: ManuscriptFormat, face: ButtonFace = .toolbar, attachmentLink: Bool = false) -> some View {
        let selected = styles.contains(format)
        return Button { perform(format) } label: {
            Group {
                if case .paragraph(let font) = face {
                    Text(LocalizedStringKey(format.presentation.label))
                        .font(font).fixedSize()
                        .padding(.horizontal, 14)
                } else { Image(systemName: attachmentLink ? "paperclip" : format.presentation.symbol) }
            }
            .foregroundStyle(selected ? Color(uiColor: .systemBackground) : .primary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background {
                if selected {
                    switch face {
                    case .toolbar: Circle().fill(.primary).frame(maxWidth: 38, maxHeight: 38)
                    case .segment: Rectangle().fill(.primary)
                    case .paragraph: Capsule().fill(.primary).padding(3)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .disabled(inTable && format != .table)
        .accessibilityLabel(Text(LocalizedStringKey(attachmentLink ? "插入附件链接" : format.presentation.label)))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier(attachmentLink ? "attachLink" : "format-" + format.rawValue)
    }

    private func segments(_ formats: [ManuscriptFormat]) -> some View {
        HStack(spacing: 0) {
            ForEach(formats, id: \.self) { format in
                action(format, face: .segment)
                    .frame(minWidth: 44)
                    .overlay(alignment: .leading) {
                        if format != formats.first {
                            Rectangle().fill(Color(uiColor: .systemBackground).opacity(0.65))
                                .frame(width: 1).allowsHitTesting(false)
                        }
                    }
            }
        }
        .background(.quaternary)
        .clipShape(Capsule())
    }

    private func panelRow<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        ViewThatFits(in: .horizontal) {
            content()
            ScrollView(.horizontal) { content() }.scrollIndicators(.hidden)
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("格式").font(.title2.bold())
                Spacer()
                Button { panelOpen = false } label: {
                    Image(systemName: "xmark").font(.title3)
                        .frame(width: 44, height: 44)
                        .modifier(CircularGlass())
                }.accessibilityLabel("关闭").accessibilityIdentifier("closeFormatPanel")
            }
            panelRow {
                HStack(spacing: 0) {
                    action(.heading1, face: .paragraph(.title2.bold()))
                    action(.heading2, face: .paragraph(.title3.weight(.semibold)))
                    action(.heading3, face: .paragraph(.subheadline.weight(.semibold)))
                    action(.paragraph, face: .paragraph(.body))
                }
                .background(.quaternary, in: Capsule())
            }
            panelRow {
                HStack(spacing: 12) {
                    segments(ManuscriptFormat.textStyles)
                    segments([.code, .clear]).fixedSize(horizontal: true, vertical: false)
                }
            }
            panelRow {
                HStack(spacing: 12) {
                    segments([.bullets, .numbers, .task, .quote])
                    segments([.link, .fence, .divider, .math, .equation])
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 24)
    }

    private var toolbar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 0) {
                HStack(spacing: 0) {
                    Button { panelOpen = true } label: {
                        Text(verbatim: "Aa").font(.body.weight(.medium))
                            .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                    }
                    .disabled(inTable)
                    .accessibilityLabel("格式").accessibilityIdentifier("paragraphStyles")
                    action(.task)
                    action(.table)
                    action(.link, attachmentLink: true)
                    action(.numbers)
                    action(.bullets)
                }.containerRelativeFrame(.horizontal).id(0)
                HStack(spacing: 0) {
                    ForEach(ManuscriptFormat.textStyles + [.code, .link], id: \.self) { action($0) }
                }.containerRelativeFrame(.horizontal).id(1)
            }.scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .onChange(of: selection, initial: true) { previous, current in
            guard current.range.length > 0 || previous.range.length > 0 else { return }
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.24)) {
                page = current.range.length > 0 && !inTable ? 1 : 0
            }
        }
        .frame(maxWidth: 340).frame(height: 44)
        .clipShape(Capsule())
        .modifier(CapsuleGlass())
        .accessibilityIdentifier("manuscriptToolPages")
    }

    var body: some View {
        Group {
            if panelOpen {
                let content = ViewThatFits(in: .vertical) {
                    panel.fixedSize(horizontal: false, vertical: true)
                    ScrollView { panel }
                }
                .frame(maxWidth: .infinity)
                if #available(iOS 26.0, *) {
                    let shape = ConcentricRectangle(uniformTopCorners: .fixed(38),
                                                    bottomLeadingCorner: .concentric(minimum: .fixed(8)),
                                                    bottomTrailingCorner: .concentric(minimum: .fixed(8)))
                    content.glassEffect(.regular, in: shape)
                } else {
                    content.background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32))
                }
            } else { toolbar }
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}


// The panel belongs to the window, including the area below a pinned sidebar.
// Its controls still act on the selection in the document that supplied it.
struct ManuscriptPanelPreference: PreferenceKey {
    static var defaultValue: ManuscriptPanelDock? { nil }

    static func reduce(value: inout ManuscriptPanelDock?, nextValue: () -> ManuscriptPanelDock?) {
        value = nextValue() ?? value
    }
}

struct ManuscriptPanelDock: View {
    let bar: ManuscriptFormatBar
    @Binding var height: CGFloat

    var body: some View {
        bar.accessibilityElement(children: .contain)
            .accessibilityIdentifier("manuscriptFormatPanel")
            .padding([.horizontal, .bottom], 8)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .ignoresSafeArea(.container, edges: [.horizontal, .bottom])
    }
}
