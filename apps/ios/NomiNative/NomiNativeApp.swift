import SwiftUI

@main
struct NomiNativeApp: App {
    @AppStorage(AppLanguage.storageKey) private var languagePreference = AppLanguage.detected.rawValue

    init() {
        if ProcessInfo.processInfo.environment["NOMI_RESET_LANGUAGE_PREFERENCE"] == "1" {
            UserDefaults.standard.removeObject(forKey: AppLanguage.storageKey)
        }
        if UserDefaults.standard.object(forKey: AppLanguage.storageKey) == nil {
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
