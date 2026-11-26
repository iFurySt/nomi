import SwiftUI

enum ManuscriptFormat: String, CaseIterable {
    case bold, italic, strike, code, link, clear, math
    case paragraph, heading1, heading2, heading3, bullets, numbers, task, quote, fence, divider, table, equation

    var presentation: (label: String, symbol: String) {
        switch self {
        case .bold: ("粗体", "bold")
        case .italic: ("斜体", "italic")
        case .strike: ("删除线", "strikethrough")
        case .code: ("行内代码", "chevron.left.forwardslash.chevron.right")
        case .link: ("链接", "link")
        case .clear: ("清除格式", "eraser")
        case .math: ("行内公式", "function")
        case .paragraph: ("正文", "textformat")
        case .heading1: ("标题 1", "textformat.size")
        case .heading2: ("标题 2", "textformat.size")
        case .heading3: ("标题 3", "textformat.size")
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
        case .bold: return wrap("**")
        case .italic: return wrap("*")
        case .strike: return wrap("~~")
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
            var range = selection
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
            let formatted = lines.enumerated().map { index, item in
                let prefix: String
                switch self {
                case .heading1: prefix = "# "; case .heading2: prefix = "## "; case .heading3: prefix = "### "
                case .bullets: prefix = "- "; case .numbers: prefix = "\(index + 1). "; case .task: prefix = "- [ ] "
                case .quote: prefix = "> "; default: prefix = ""
                }
                let rest = Self.linePrefix.stringByReplacingMatches(in: item, range: NSRange(location: 0, length: item.utf16.count), withTemplate: "")
                return prefix + rest
            }.joined(separator: "\n")
            return Change(range: line, text: formatted + (newline ? "\n" : ""),
                          selection: NSRange(location: formatted.utf16.count, length: 0))
        }
    }
}

struct ManuscriptFormatBar: View {
    let editing: Bool
    let inTable: Bool
    let perform: (ManuscriptFormat) -> Void
    @State private var showsFormat = false

    private func action(_ format: ManuscriptFormat, text: Bool = false) -> some View {
        Button {
            showsFormat = false
            perform(format)
        } label: {
            Group {
                if text {
                    Text(LocalizedStringKey(format.presentation.label))
                        .font(.subheadline.weight(format == .paragraph ? .regular : .semibold))
                        .padding(.horizontal, 9)
                } else {
                    Image(systemName: format.presentation.symbol)
                }
            }
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .disabled(inTable && format != .table)
        .accessibilityLabel(Text(LocalizedStringKey(format.presentation.label)))
        .accessibilityIdentifier("format-" + format.rawValue)
    }

    private var palette: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("文字格式").font(.headline)
                Spacer()
                Button { showsFormat = false } label: {
                    Image(systemName: "xmark").frame(width: 44, height: 44)
                }.accessibilityLabel("关闭")
            }
            formatRow([.paragraph, .heading1, .heading2, .heading3], text: true)
            formatRow([.bold, .italic, .strike, .code, .link, .clear])
            formatRow([.quote, .fence, .divider, .math, .equation])
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
    }

    private func formatRow(_ formats: [ManuscriptFormat], text: Bool = false) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 0) {
                ForEach(formats, id: \.self) { action($0, text: text) }
            }
        }
        .scrollIndicators(.hidden)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if showsFormat { palette }
            HStack(spacing: 0) {
                Button { showsFormat.toggle() } label: {
                    Text(verbatim: "Aa")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .background(showsFormat ? Color.primary.opacity(0.10) : .clear, in: Circle())
                        .contentShape(Rectangle())
                }
                .disabled(inTable)
                .accessibilityLabel("文字格式").accessibilityIdentifier("paragraphStyles")
                ForEach([ManuscriptFormat.task, .table, .numbers, .bullets], id: \.self) { action($0) }
            }
            .padding(.horizontal, 4)
            .modifier(CapsuleGlass())
        }
        .frame(maxWidth: showsFormat ? 360 : 228, alignment: .leading)
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .onChange(of: editing) { _, _ in showsFormat = false }
    }
}
