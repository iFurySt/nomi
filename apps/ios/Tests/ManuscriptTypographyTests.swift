import UIKit
import XCTest
@testable import NomiMobile

final class ManuscriptTypographyTests: XCTestCase {
    func testMixedScriptMarkdownKeepsSourceAndStylesAcrossEdits() throws {
        let source = "散步 Walk 🌱\n## 第一段\n这是 **粗体** 和 *italic*。\n末段"
        let traits = UITraitCollection(preferredContentSizeCategory: .extraLarge)
        let storage = NSTextStorage(string: source)
        ManuscriptTypography.apply(to: storage, hasTitle: true, changed: nil, traits: traits)
        func font(_ text: String) throws -> UIFont {
            let range = (storage.string as NSString).range(of: text)
            return try XCTUnwrap(storage.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont)
        }
        XCTAssertEqual(storage.string, source)
        XCTAssertTrue(try font("散步").fontDescriptor.symbolicTraits.contains(.traitBold))
        XCTAssertTrue(try font("粗体").fontDescriptor.symbolicTraits.contains(.traitBold))
        XCTAssertTrue(try font("italic").fontDescriptor.symbolicTraits.contains(.traitItalic))
        XCTAssertGreaterThan(try font("第一段").pointSize, try font("末段").pointSize)
        let range = (storage.string as NSString).range(of: "粗体")
        storage.replaceCharacters(in: range, with: "新内容")
        ManuscriptTypography.apply(to: storage, hasTitle: true, changed: NSRange(location: range.location, length: 3), traits: traits)
        let reopened = NSTextStorage(string: storage.string)
        ManuscriptTypography.apply(to: reopened, hasTitle: true, changed: nil, traits: traits)
        XCTAssertTrue(storage.isEqual(to: reopened))
    }
}
