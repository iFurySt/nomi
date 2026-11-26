import Foundation

enum AppLanguage: String {
    case english = "en"
    case simplifiedChinese = "zh-Hans"

    init(preferredLanguage: String?) {
        let language = Locale.Language(identifier: preferredLanguage ?? "en")
        self = language.languageCode == .chinese ? .simplifiedChinese : .english
    }

    static let current = AppLanguage(preferredLanguage: Locale.preferredLanguages.first)
    var locale: Locale { Locale(identifier: rawValue) }

    // Resolve Foundation strings from the same translation as the SwiftUI environment.
    private static let strings = Bundle.main.url(forResource: current.rawValue, withExtension: "lproj")
        .flatMap(Bundle.init(url:)) ?? .main

    static func text(_ value: String.LocalizationValue) -> String {
        String(localized: value, bundle: strings, locale: current.locale)
    }
}
