import XCTest
@testable import NomiMobile

final class AppLanguageTests: XCTestCase {
    func testChineseScriptsAndRegionsUseSimplifiedChinese() {
        for tag in ["zh", "zh-Hans", "zh-CN", "zh-SG", "zh-Hant", "zh-TW", "zh-HK", "zh-MO"] {
            XCTAssertEqual(AppLanguage(preferredLanguage: tag), .simplifiedChinese, tag)
        }
    }

    func testOtherLanguagesAndMissingPreferenceUseEnglish() {
        for tag in ["en-GB", "ja-JP", "fr-CN", "ar", nil] {
            XCTAssertEqual(AppLanguage(preferredLanguage: tag), .english, tag ?? "nil")
        }
    }
}
