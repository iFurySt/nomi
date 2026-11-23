import UIKit

enum ManuscriptTypography {
    typealias Attributes = [NSAttributedString.Key: Any]

    static func attributes(title: Bool, traits: UITraitCollection) -> Attributes {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 3
        paragraph.paragraphSpacing = title ? 8 : 3
        let base = UIFont.preferredFont(forTextStyle: title ? .title1 : .body, compatibleWith: traits)
        let font = title ? weighted(base, .traitBold) : base
        return [.font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph]
    }

    private static func weighted(_ font: UIFont, _ traits: UIFontDescriptor.SymbolicTraits) -> UIFont {
        let descriptor = font.fontDescriptor
        guard let styled = descriptor.withSymbolicTraits(descriptor.symbolicTraits.union(traits)) else { return font }
        return UIFont(descriptor: styled, size: font.pointSize)
    }

    static func apply(to storage: NSTextStorage, hasTitle: Bool, changed: NSRange?, traits: UITraitCollection, editingSource: Bool = false) {
        let source = storage.string as NSString
        guard source.length > 0 else { return }
        let all = NSRange(location: 0, length: source.length)
        let range = changed.map { source.lineRange(for: NSIntersectionRange($0, all)) } ?? all
        storage.beginEditing()
        defer { storage.endEditing() }
        let hasFences = storage.string.contains("```") || storage.string.contains("~~~") || storage.string.contains("$$")
        var fence: String?
        var start = hasFences ? 0 : range.location
        // Include the following paragraph when inserting or removing a newline.
        repeat {
            guard start < source.length else { break }
            var end = 0, contentEnd = 0
            source.getLineStart(nil, end: &end, contentsEnd: &contentEnd, for: NSRange(location: start, length: 0))
            let title = hasTitle && start == 0
            let line = source.substring(with: NSRange(location: start, length: contentEnd - start))
            let trimmed = line.drop(while: { $0 == " " })
            var literal = fence != nil
            if hasFences && !title {
                if let delimiter = fence {
                    let endMarker = trimmed.trimmingCharacters(in: .whitespaces)
                    if endMarker.hasPrefix(delimiter) && endMarker.allSatisfy({ $0 == delimiter.first }) { fence = nil }
                } else if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") || trimmed == "$$" {
                    fence = String(trimmed.prefix(while: { $0 == trimmed.first }))
                    literal = true
                }
            }
            if end > range.location {
                var base = attributes(title: title, traits: traits)
                if literal {
                    let size = (base[.font] as! UIFont).pointSize
                    base[.font] = UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
                    base[.backgroundColor] = UIColor.secondarySystemFill
                }
                storage.setAttributes(base, range: NSRange(location: start, length: end - start))
                if !title && !literal && contentEnd > start {
                    styleMarkdown(storage, text: line, start: start, base: base, traits: traits, editingSource: editingSource)
                }
            }
            start = end
        } while start <= NSMaxRange(range)
    }

    // Keep the original Markdown and UTF-16 offsets for native input, selection,
    // undo and sync. Presentation attributes are identical before and after focus.
    private static func styleMarkdown(_ storage: NSTextStorage, text: String, start: Int, base: Attributes, traits: UITraitCollection, editingSource: Bool) {
        var content = text[...]
        var font = base[.font] as! UIFont
        var color = UIColor.label
        if let prefix = ["###### ", "##### ", "#### ", "### ", "## ", "# ", "> "].first(where: { content.hasPrefix($0) }) {
            content = content.dropFirst(prefix.count)
            if prefix == "> " { color = .secondaryLabel }
            else { font = weighted(UIFont.preferredFont(forTextStyle: prefix.count >= 4 ? .headline : (prefix == "# " ? .title1 : .title2), compatibleWith: traits), .traitBold) }
            conceal(storage, NSRange(location: start, length: prefix.count))
        }
        let offset = start + text[..<content.startIndex].utf16.count
        let span = NSRange(location: offset, length: content.utf16.count)
        storage.addAttributes([.font: font, .foregroundColor: color], range: span)
        guard content.rangeOfCharacter(from: CharacterSet(charactersIn: "*_`[~\\")) != nil else { return }
        // The link command selects the URL for replacement. Keep its destination visible while typing.
        if editingSource && content.contains("](") { return }
        let raw = String(content)
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace,
                                                              appliesSourcePositionAttributes: true)
        guard let parsed = try? AttributedString(markdown: raw, options: options) else { return }
        var cursor = offset
        for run in parsed.runs {
            guard let position = run.markdownSourcePosition, let indices = Range<String.Index>(position, in: raw) else { return }
            let local = NSRange(indices, in: raw)
            let range = NSRange(location: offset + local.location, length: local.length)
            guard range.location >= cursor else { return }
            conceal(storage, NSRange(location: cursor, length: range.location - cursor))
            let intent = run.inlinePresentationIntent ?? []
            var styled = intent.contains(.code) ? UIFont.monospacedSystemFont(ofSize: font.pointSize, weight: .regular) : font
            if intent.contains(.stronglyEmphasized) { styled = weighted(styled, .traitBold) }
            if intent.contains(.emphasized) { styled = weighted(styled, .traitItalic) }
            storage.addAttribute(.font, value: styled, range: range)
            if let link = run.link { storage.addAttribute(.link, value: link, range: range) }
            if intent.contains(.strikethrough) { storage.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range) }
            cursor = NSMaxRange(range)
        }
        conceal(storage, NSRange(location: cursor, length: NSMaxRange(span) - cursor))
    }

    private static func conceal(_ storage: NSTextStorage, _ range: NSRange) {
        if range.length > 0 {
            storage.addAttributes([.font: UIFont.systemFont(ofSize: 0.01), .foregroundColor: UIColor.clear], range: range)
        }
    }
}
