import UIKit

enum ManuscriptTypography {
    typealias Attributes = [NSAttributedString.Key: Any]

    static let columnWidth: CGFloat = 620
    static let gutter: CGFloat = 24
    static let railGutter: CGFloat = 12
    static let topInset: CGFloat = 8
    static let bottomInset: CGFloat = 24

    // Line heights are relative to the run's font; block gaps scale with the body font.
    static let bodyLineHeight: CGFloat = 26 / Size.body.rawValue
    static let headingLineHeight: CGFloat = 1.35
    static let paragraphGap: CGFloat = 12 / Size.body.rawValue
    static let titleGap: CGFloat = 18 / Size.body.rawValue
    static let sectionGap: CGFloat = 24 / Size.body.rawValue

    // Relative to the standard 17 pt body, including accessibility sizes.
    enum Size: CGFloat {
        case title = 23, heading = 20, subheading = 18, minorHeading = 16, body = 17

        var scale: CGFloat { rawValue / Size.body.rawValue }

        func font(_ traits: UITraitCollection) -> UIFont {
            let body = UIFont.preferredFont(forTextStyle: .body, compatibleWith: traits)
            if self == .body { return body }
            return UIFont.systemFont(ofSize: body.pointSize * scale, weight: self == .title ? .bold : .semibold)
        }
    }

    static func attributes(size: Size, traits: UITraitCollection, separatesParagraphs: Bool = true) -> Attributes {
        let font = size.font(traits)
        let bodySize = font.pointSize / size.scale
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = font.pointSize * (size == .body ? bodyLineHeight : headingLineHeight)
        if separatesParagraphs {
            paragraph.paragraphSpacing = bodySize * (size == .title ? titleGap : paragraphGap)
        }
        if size != .title && size != .body {
            paragraph.paragraphSpacingBefore = bodySize * (sectionGap - paragraphGap)
        }
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
                let prefix = title || literal ? nil : ["###### ", "##### ", "#### ", "### ", "## ", "# ", "> "]
                    .first(where: line.hasPrefix)
                let size: Size = switch prefix {
                case "# ": .heading
                case "## ": .subheading
                case "### ", "#### ", "##### ", "###### ": .minorHeading
                default: title ? .title : .body
                }
                var base = attributes(size: size, traits: traits, separatesParagraphs: !literal && !line.isEmpty)
                if literal {
                    let size = (base[.font] as! UIFont).pointSize
                    base[.font] = UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
                    base[.backgroundColor] = UIColor.secondarySystemFill
                }
                storage.setAttributes(base, range: NSRange(location: start, length: end - start))
                if !title && !literal && contentEnd > start {
                    styleMarkdown(storage, text: line, prefix: prefix, start: start, base: base, editingSource: editingSource)
                }
            }
            start = end
        } while start <= NSMaxRange(range)
    }

    // Keep the original Markdown and UTF-16 offsets for native input, selection,
    // undo and sync. Presentation attributes are identical before and after focus.
    private static func styleMarkdown(_ storage: NSTextStorage, text: String, prefix: String?, start: Int, base: Attributes, editingSource: Bool) {
        var content = text[...]
        let font = base[.font] as! UIFont
        var color = UIColor.label
        if let prefix {
            content = content.dropFirst(prefix.count)
            if prefix == "> " { color = .secondaryLabel }
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
