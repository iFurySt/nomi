import SwiftUI

enum AppAppearance: String, CaseIterable {
    static let key = "appAppearance"
    case system, light, dark

    var label: LocalizedStringKey {
        switch self {
        case .system: "跟随系统"
        case .light: "浅色"
        case .dark: "深色"
        }
    }

    var style: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

// Apply the choice to this scene, including presented sheets and UIKit editors.
struct WindowAppearance: UIViewRepresentable {
    let appearance: AppAppearance

    final class Observer: UIView {
        var style = UIUserInterfaceStyle.unspecified {
            didSet { window?.overrideUserInterfaceStyle = style }
        }
        override func didMoveToWindow() {
            super.didMoveToWindow()
            window?.overrideUserInterfaceStyle = style
        }
    }

    func makeUIView(context: Context) -> Observer { Observer() }

    func updateUIView(_ view: Observer, context: Context) {
        if view.style != appearance.style { view.style = appearance.style }
    }
}

struct GeneralSettings: View {
    @AppStorage(AppAppearance.key) private var appearance = AppAppearance.system
    @Environment(\.openURL) private var openURL
    @Environment(\.locale) private var locale

    var body: some View {
        List {
            Section {
                Picker("外观", selection: $appearance) {
                    ForEach(AppAppearance.allCases, id: \.self) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("appearancePicker")
            }
            Section {
                Button {
                    openURL(URL(string: UIApplication.openSettingsURLString)!)
                } label: {
                    HStack {
                        Text("App 语言")
                        Spacer()
                        let language = AppLanguage.current.rawValue
                        Text(locale.localizedString(forIdentifier: language) ?? language)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.forward")
                            .font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                }
                .accessibilityIdentifier("appLanguage")
            }
        }
        .navigationTitle("通用")
        .navigationBarTitleDisplayMode(.inline)
    }
}
