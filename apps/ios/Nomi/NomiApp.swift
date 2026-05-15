import SwiftUI

@main
struct NomiApp: App {
    @AppStorage(AppLanguage.storageKey) private var languagePreference = AppLanguage.detected.rawValue

    init() {
        if ProcessInfo.processInfo.environment["NOMI_RESET_LANGUAGE_PREFERENCE"] == "1" {
            UserDefaults.standard.removeObject(forKey: AppLanguage.storageKey)
        }
        let storedLanguage = UserDefaults.standard.string(forKey: AppLanguage.storageKey)
        if storedLanguage == nil || AppLanguage(rawValue: storedLanguage ?? "") == nil {
            UserDefaults.standard.set(AppLanguage.detected.rawValue, forKey: AppLanguage.storageKey)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.locale, AppLanguage.value(for: languagePreference).resolvedLocale)
        }
    }
}
