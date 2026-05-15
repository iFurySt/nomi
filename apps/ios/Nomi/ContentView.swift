import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UIKit

enum AppLanguage: String, CaseIterable, Identifiable {
    case simplifiedChinese
    case traditionalChinese

    static let storageKey = "nomi.languagePreference"

    var id: String { rawValue }

    static var detected: AppLanguage {
        let preferred = Locale.preferredLanguages.first ?? Locale.autoupdatingCurrent.identifier
        let normalized = preferred.lowercased()
        if normalized.contains("hant") || normalized.contains("tw") || normalized.contains("hk") || normalized.contains("mo") {
            return .traditionalChinese
        }
        return .simplifiedChinese
    }

    static func value(for rawValue: String) -> AppLanguage {
        switch rawValue {
        case Self.simplifiedChinese.rawValue:
            .simplifiedChinese
        case Self.traditionalChinese.rawValue:
            .traditionalChinese
        default:
            Self.detected
        }
    }

    var resolvedLocale: Locale {
        switch self {
        case .simplifiedChinese:
            Locale(identifier: "zh-Hans")
        case .traditionalChinese:
            Locale(identifier: "zh-Hant")
        }
    }

    var displayName: String {
        switch self {
        case .simplifiedChinese: "简体中文"
        case .traditionalChinese: "繁體中文"
        }
    }

    var currentLanguageTitle: String {
        switch self {
        case .simplifiedChinese: "当前语言"
        case .traditionalChinese: "目前語言"
        }
    }
}

struct TimelineItem: Identifiable, Equatable {
    let id = UUID()
    let time: String
    let title: String
    let subtitle: String
    let detail: String
    let symbol: String
    let tint: Color
    let image: UIImage?
    let minutesAgo: Int
    let badge: String?
    let status: String
}

struct DailyMetric: Identifiable {
    let id: String
    let titleKey: LocalizedStringKey
    let value: String
    let detailKey: LocalizedStringKey
    let symbol: String
    let tint: Color
    let progress: Double?
}

enum UploadSource: String, CaseIterable, Identifiable {
    case camera
    case photos
    case files

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .camera: "camera.fill"
        case .photos: "photo.on.rectangle.angled"
        case .files: "doc.fill"
        }
    }

    var titleKey: LocalizedStringKey {
        switch self {
        case .camera: "upload.source.camera"
        case .photos: "upload.source.photos"
        case .files: "upload.source.files"
        }
    }

    var copyKey: LocalizedStringKey {
        switch self {
        case .camera: "upload.source.camera"
        case .photos: "upload.source.library"
        case .files: "upload.source.file"
        }
    }
}

struct ImageExtractionRequest: Encodable {
    let assetName: String
    let source: String
    let mimeType: String
    let imageBase64: String

    enum CodingKeys: String, CodingKey {
        case assetName = "asset_name"
        case source
        case mimeType = "mime_type"
        case imageBase64 = "image_base64"
    }
}

struct E2EUploadManifest: Decodable {
    let items: [E2EUploadItem]
}

struct E2EUploadItem: Decodable {
    let fileName: String
    let source: String
    let mimeType: String
}

private enum NomiRadii {
    static let panel: CGFloat = 28
    static let card: CGFloat = 18
    static let tile: CGFloat = 16
}

private enum NomiType {
    static let pageTitle: Font = .system(.title, design: .default, weight: .semibold)
    static let sectionTitle: Font = .system(.title3, design: .default, weight: .regular)
    static let cardTitle: Font = .system(.headline, design: .default, weight: .semibold)
    static let body: Font = .system(.body, design: .default, weight: .regular)
    static let bodyEmphasis: Font = .system(.body, design: .default, weight: .semibold)
    static let value: Font = .system(.title3, design: .default, weight: .semibold)
    static let caption: Font = .system(.caption, design: .default, weight: .medium)
    static let captionStrong: Font = .system(.caption, design: .default, weight: .semibold)
}

private enum NomiPalette {
    static let paper = Color(uiColor: .systemGroupedBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let surfaceLift = Color(uiColor: .systemBackground)
    static let fill = Color(uiColor: .tertiarySystemFill)
    static let ink = Color(uiColor: .label)
    static let muted = Color(uiColor: .secondaryLabel)
    static let quiet = Color(uiColor: .tertiaryLabel)
    static let hairline = Color(uiColor: .separator).opacity(0.36)
    static let shadow = Color.black
    static let metric = Color(uiColor: .label).opacity(0.68)
}

private struct NomiContentSurfaceModifier<SurfaceShape: Shape>: ViewModifier {
    let shape: SurfaceShape
    let fillOpacity: Double
    let strokeOpacity: Double
    let shadowOpacity: Double
    let shadowRadius: CGFloat
    let shadowY: CGFloat

    func body(content: Content) -> some View {
        content
            .background {
                shape
                    .fill(NomiPalette.surfaceLift.opacity(fillOpacity))
                    .overlay {
                        shape.stroke(NomiPalette.hairline.opacity(strokeOpacity), lineWidth: 1)
                    }
                    .shadow(
                        color: NomiPalette.shadow.opacity(shadowOpacity),
                        radius: shadowRadius,
                        y: shadowY
                    )
            }
    }
}

private struct NomiGlassSurfaceModifier<SurfaceShape: Shape>: ViewModifier {
    let shape: SurfaceShape
    let tint: Color
    let fillOpacity: Double
    let shadowOpacity: Double
    let shadowRadius: CGFloat
    let shadowX: CGFloat
    let shadowY: CGFloat

    func body(content: Content) -> some View {
        content
            .background {
                shape
                    .fill(NomiPalette.surface.opacity(fillOpacity))
                    .glassEffect(
                        .regular.tint(tint.opacity(0.08)),
                        in: shape
                    )
                    .shadow(
                        color: NomiPalette.shadow.opacity(shadowOpacity),
                        radius: shadowRadius,
                        x: shadowX,
                        y: shadowY
                    )
            }
    }
}

private extension View {
    func nomiContentSurface<SurfaceShape: Shape>(
        in shape: SurfaceShape,
        fillOpacity: Double = 0.68,
        strokeOpacity: Double = 1,
        shadowOpacity: Double = 0.07,
        shadowRadius: CGFloat = 22,
        shadowY: CGFloat = 14
    ) -> some View {
        modifier(
            NomiContentSurfaceModifier(
                shape: shape,
                fillOpacity: fillOpacity,
                strokeOpacity: strokeOpacity,
                shadowOpacity: shadowOpacity,
                shadowRadius: shadowRadius,
                shadowY: shadowY
            )
        )
    }

    func nomiGlassSurface<SurfaceShape: Shape>(
        in shape: SurfaceShape,
        tint: Color = NomiPalette.surface,
        fillOpacity: Double = 0.52,
        shadowOpacity: Double = 0.10,
        shadowRadius: CGFloat = 24,
        shadowX: CGFloat = 0,
        shadowY: CGFloat = 14
    ) -> some View {
        modifier(
            NomiGlassSurfaceModifier(
                shape: shape,
                tint: tint,
                fillOpacity: fillOpacity,
                shadowOpacity: shadowOpacity,
                shadowRadius: shadowRadius,
                shadowX: shadowX,
                shadowY: shadowY
            )
        )
    }
}

struct UploadResult {
    let item: TimelineItem
    let source: UploadSource
    let assetName: String
}

enum AppTab: Hashable {
    case today
    case me
    case add
}

struct ContentView: View {
    @State private var showUploadSheet = false
    @State private var showLanguageSheet = false
    @State private var showHero = false
    @State private var selectedTab: AppTab = .today
    @State private var lastContentTab: AppTab = .today
    @State private var timelineItems: [TimelineItem] = []

    var body: some View {
        ZStack {
            NomiBackground()

            TabView(selection: $selectedTab) {
                Tab(value: AppTab.today) {
                    NavigationStack {
                        HomeView(
                            items: timelineItems,
                            showHero: showHero,
                            onAdd: openUploadSheet
                        )
                        .navigationTitle("Nomi")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbarBackground(.hidden, for: .navigationBar)
                    }
                    .background {
                        NomiBackground()
                    }
                } label: {
                    Label("tab.today", systemImage: "sun.max")
                        .accessibilityIdentifier("bottom-today")
                }

                Tab(value: AppTab.me) {
                    NavigationStack {
                        MyView(onLanguage: {
                            showLanguageSheet = true
                        })
                        .navigationTitle("")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbarBackground(.hidden, for: .navigationBar)
                    }
                    .background {
                        NomiBackground()
                    }
                } label: {
                    Label("tab.me", systemImage: "person")
                        .accessibilityIdentifier("bottom-me")
                }

                Tab(value: AppTab.add, role: .search) {
                    Color.clear
                        .accessibilityHidden(true)
                } label: {
                    Label("nav.add", systemImage: "plus")
                        .accessibilityIdentifier("bottom-add")
                }
            }
            .tabBarMinimizeBehavior(.never)
            .background {
                NomiBackground()
            }
        }
        .tint(NomiPalette.ink)
        .onChange(of: selectedTab) { oldValue, newValue in
            handleTabChange(from: oldValue, to: newValue)
        }
        .sheet(isPresented: $showUploadSheet) {
            UploadSheet { result in
                withAnimation(.spring(duration: 0.55, bounce: 0.22)) {
                    timelineItems.insert(result.item, at: 0)
                }
                showUploadSheet = false
            }
            .presentationDetents([.fraction(0.72)])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showLanguageSheet) {
            LanguageSelectionSheet()
                .presentationDetents([.fraction(0.46)])
                .presentationDragIndicator(.visible)
        }
        .task {
            guard !showHero else { return }
            try? await Task.sleep(for: .milliseconds(140))
            withAnimation(.smooth(duration: 0.7)) {
                showHero = true
            }
            if ProcessInfo.processInfo.environment["NOMI_OPEN_UPLOAD"] == "1" {
                try? await Task.sleep(for: .milliseconds(450))
                openUploadSheet()
            }
            if ProcessInfo.processInfo.environment["NOMI_DISABLE_RECORD_SYNC"] != "1" {
                await loadSavedRecords()
            }
            if ProcessInfo.processInfo.environment["NOMI_E2E_AUTO_UPLOADS"] == "1" {
                await runE2EUploads()
            }
        }
    }

    private func handleTabChange(from oldValue: AppTab, to newValue: AppTab) {
        switch newValue {
        case .today, .me:
            UISelectionFeedbackGenerator().selectionChanged()
            lastContentTab = newValue
        case .add:
            openUploadSheet()
            selectedTab = oldValue == .add ? lastContentTab : oldValue
        }
    }

    private func openUploadSheet() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.bouncy(duration: 0.45)) {
            showUploadSheet = true
        }
    }

    private func loadSavedRecords() async {
        let savedItems = await RecordsClient.loadTimelineItems()
        guard !savedItems.isEmpty else { return }
        await MainActor.run {
            withAnimation(.spring(duration: 0.48, bounce: 0.18)) {
                timelineItems = savedItems
            }
        }
    }

    private func runE2EUploads() async {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let manifestURL = documentsURL.appendingPathComponent("nomi-e2e-uploads.json")
        let resultsURL = documentsURL.appendingPathComponent("nomi-e2e-results.log")
        try? "".write(to: resultsURL, atomically: true, encoding: .utf8)

        do {
            let manifestData = try Data(contentsOf: manifestURL)
            let manifest = try JSONDecoder().decode(E2EUploadManifest.self, from: manifestData)

            for item in manifest.items {
                guard let source = UploadSource(apiValue: item.source) else {
                    writeE2EResult("NOMI_E2E_UPLOAD_RESULT skipped invalid-source \(item.fileName) \(item.source)", to: resultsURL)
                    continue
                }

                let fileURL = documentsURL.appendingPathComponent(item.fileName)
                let imageData = try Data(contentsOf: fileURL)
                guard let image = UIImage(data: imageData) else {
                    writeE2EResult("NOMI_E2E_UPLOAD_RESULT skipped invalid-image \(item.fileName)", to: resultsURL)
                    continue
                }
                _ = image

                let timelineItem = try await RecordsClient.uploadImage(
                    data: imageData,
                    assetName: item.fileName,
                    source: source,
                    mimeType: item.mimeType
                )

                await MainActor.run {
                    timelineItems.insert(timelineItem, at: 0)
                    writeE2EResult(
                        "NOMI_E2E_UPLOAD_RESULT accepted \(source.apiValue) \(item.fileName) \(timelineItem.status) \(timelineItem.title)",
                        to: resultsURL
                    )
                }
            }
        } catch {
            writeE2EResult("NOMI_E2E_UPLOAD_RESULT failed \(error.localizedDescription)", to: resultsURL)
        }
    }

    private func writeE2EResult(_ line: String, to url: URL) {
        print(line)
        let data = Data((line + "\n").utf8)
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: url)
        }
    }
}

struct MyView: View {
    let onLanguage: () -> Void

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 22) {
                    settingsSection(title: "me.section.mine") {
                        MySettingsRow(
                            symbol: "globe",
                            titleKey: "settings.language",
                            accessibilityIdentifier: "my-language-row",
                            action: onLanguage
                        )
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 44)
                .padding(.bottom, 126)
            }
            .accessibilityIdentifier("my-view")
        }
    }

    @ViewBuilder
    private func settingsSection<Content: View>(
        title: LocalizedStringKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(NomiType.sectionTitle)
                .foregroundStyle(NomiPalette.muted)

            VStack(spacing: 0) {
                content()
            }
            .background(
                NomiPalette.surfaceLift.opacity(0.92),
                in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.panel)), isUniform: true)
            )
            .overlay {
                ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.panel)), isUniform: true)
                    .stroke(NomiPalette.hairline, lineWidth: 1)
            }
            .shadow(color: NomiPalette.shadow.opacity(0.045), radius: 18, y: 10)
        }
    }
}

struct MySettingsRow: View {
    let symbol: String
    let titleKey: LocalizedStringKey
    var accessibilityIdentifier: String?
    var action: (() -> Void)?

    var body: some View {
        Button {
            action?()
        } label: {
            HStack(spacing: 20) {
                Image(systemName: symbol)
                    .font(.system(.title2, design: .default, weight: .regular))
                    .foregroundStyle(NomiPalette.ink.opacity(0.78))
                    .frame(width: 42, height: 54)

                Text(titleKey)
                    .font(NomiType.body)
                    .foregroundStyle(NomiPalette.muted)

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(.callout, design: .default, weight: .medium))
                    .foregroundStyle(NomiPalette.muted.opacity(0.86))
            }
            .frame(height: 58)
            .padding(.horizontal, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
        .accessibilityIdentifier(accessibilityIdentifier ?? "")
    }
}

struct LanguageSelectionSheet: View {
    @AppStorage(AppLanguage.storageKey) private var languagePreference = AppLanguage.detected.rawValue

    private var selectedLanguage: AppLanguage {
        AppLanguage.value(for: languagePreference)
    }

    var body: some View {
        VStack(spacing: 22) {
            Text(selectedLanguage.currentLanguageTitle)
                .font(NomiType.bodyEmphasis)
                .foregroundStyle(NomiPalette.muted)
                .padding(.top, 34)
                .accessibilityIdentifier("language-sheet")

            VStack(spacing: 14) {
                ForEach(AppLanguage.allCases) { language in
                    Button {
                        UISelectionFeedbackGenerator().selectionChanged()
                        withAnimation(.smooth(duration: 0.22)) {
                            languagePreference = language.rawValue
                        }
                    } label: {
                        HStack {
                            Text(language.displayName)
                                .font(NomiType.body)
                            Spacer(minLength: 0)
                            if selectedLanguage == language {
                                Image(systemName: "checkmark")
                                    .font(.system(.title3, design: .default, weight: .semibold))
                            }
                        }
                        .foregroundStyle(NomiPalette.ink.opacity(0.84))
                        .padding(.horizontal, 22)
                        .frame(height: 58)
                        .background(
                            NomiPalette.fill.opacity(selectedLanguage == language ? 0.78 : 0.52),
                            in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.card)), isUniform: true)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("language-\(language.rawValue)")
                }
            }
            .padding(.horizontal, 24)

            Spacer(minLength: 0)
        }
    }
}

struct HomeView: View {
    let items: [TimelineItem]
    let showHero: Bool
    let onAdd: () -> Void

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    OverviewCard(items: items)
                        .scaleEffect(showHero ? 1 : 0.96)
                        .opacity(showHero ? 1 : 0)
                        .blur(radius: showHero ? 0 : 12)

                    if items.isEmpty {
                        EmptyTimelineState()
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(alignment: .firstTextBaseline) {
                                Text("home.timeline")
                                    .font(NomiType.sectionTitle.weight(.semibold))
                                Spacer()
                                Text("\(items.count)")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.secondary)
                                    .contentTransition(.numericText())
                            }
                            .padding(.horizontal, 4)

                            LazyVStack(spacing: 0) {
                                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                    TimelineRow(
                                        item: item,
                                        index: index,
                                        isFirst: index == 0,
                                        isLast: index == items.count - 1
                                    )
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 104)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct OverviewCard: View {
    let items: [TimelineItem]

    private var metrics: [DailyMetric] {
        let calories = items.map { $0.caloriesKcal }.reduce(0, +)
        let protein = items.map { $0.proteinG }.reduce(0, +)
        let strength = items.filter { $0.symbol == "dumbbell" }.map(\.durationMin).reduce(0, +)
        let walk = items.filter { $0.symbol == "figure.walk" }.map(\.durationMin).reduce(0, +)
        let sitting = items.filter { $0.symbol == "chair" }.map(\.durationMin).reduce(0, +)
        let sleep = items.filter { $0.symbol == "moon" }.map(\.durationMin).reduce(0, +)

        return [
            DailyMetric(
                id: "calories",
                titleKey: "metric.calories",
                value: "\(calories)",
                detailKey: "metric.calories.left \(max(0, 2200 - calories))",
                symbol: "flame.fill",
                tint: NomiPalette.metric,
                progress: items.isEmpty ? 0 : min(Double(calories) / 2200, 1)
            ),
            DailyMetric(
                id: "protein",
                titleKey: "metric.protein",
                value: "\(protein)g",
                detailKey: "metric.protein.target",
                symbol: "circle.hexagongrid.fill",
                tint: NomiPalette.metric,
                progress: min(Double(protein) / 120, 1)
            ),
            DailyMetric(
                id: "strength",
                titleKey: "metric.strength",
                value: "\(strength)m",
                detailKey: "metric.today",
                symbol: "dumbbell.fill",
                tint: NomiPalette.metric,
                progress: nil
            ),
            DailyMetric(
                id: "walk",
                titleKey: "metric.walk",
                value: "\(walk)m",
                detailKey: "metric.today",
                symbol: "figure.walk",
                tint: NomiPalette.metric,
                progress: nil
            ),
            DailyMetric(
                id: "sitting",
                titleKey: "metric.sitting",
                value: "\(sitting)m",
                detailKey: "metric.today",
                symbol: "chair.fill",
                tint: NomiPalette.metric,
                progress: nil
            ),
            DailyMetric(
                id: "sleep",
                titleKey: "metric.sleep",
                value: "\(sleep)m",
                detailKey: "metric.today",
                symbol: "moon.fill",
                tint: NomiPalette.metric,
                progress: nil
            )
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("tab.today")
                        .font(NomiType.caption)
                        .foregroundStyle(.secondary)
                    Text(items.count == 1 ? "today.item.count.one" : "today.item.count.many \(items.count)")
                        .font(NomiType.value)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 18)

                ZStack {
                    Circle()
                        .fill(NomiPalette.surfaceLift.opacity(0.72))
                        .frame(width: 50, height: 50)
                    Image(systemName: "heart.text.square.fill")
                        .font(.system(.headline, design: .default, weight: .semibold))
                        .foregroundStyle(NomiPalette.metric)
                }
            }

            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 8),
                GridItem(.flexible(), spacing: 8),
                GridItem(.flexible(), spacing: 8)
            ], spacing: 8) {
                ForEach(metrics) { metric in
                    MetricTile(metric: metric)
                }
            }
        }
        .padding(18)
        .nomiContentSurface(
            in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.panel)), isUniform: true),
            fillOpacity: 0.70,
            shadowOpacity: 0.08,
            shadowRadius: 28,
            shadowY: 18
        )
    }
}

struct MetricTile: View {
    let metric: DailyMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: metric.symbol)
                    .font(NomiType.captionStrong)
                    .foregroundStyle(metric.tint)
                    .frame(width: 20, height: 20)
                    .background(NomiPalette.fill.opacity(0.55), in: Circle())

                Text(metric.titleKey)
                    .font(NomiType.captionStrong)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(metric.value)
                    .font(NomiType.bodyEmphasis)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Text(metric.detailKey)
                    .font(.caption2.weight(.regular))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
            .id("\(metric.id)-\(metric.value)")
            .transaction { transaction in
                transaction.animation = nil
            }

            if let progress = metric.progress {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                    .tint(metric.tint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 78, alignment: .topLeading)
        .padding(10)
        .nomiContentSurface(
            in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.tile)), isUniform: true),
            fillOpacity: 0.46,
            strokeOpacity: 0.55,
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowY: 0
        )
    }
}

struct EmptyTimelineState: View {
    var body: some View {
        Color.clear
            .frame(height: 156)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("home.timeline")
            .accessibilityIdentifier("empty-timeline")
    }
}

struct TimelineRow: View {
    let item: TimelineItem
    let index: Int
    let isFirst: Bool
    let isLast: Bool
    @State private var appeared = false
    private let cardHeight: CGFloat = 74
    private let rowGap: CGFloat = 12
    private let markerSize: CGFloat = 9

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Text(item.time)
                .font(NomiType.caption)
                .foregroundStyle(.secondary)
                .frame(width: 48, alignment: .trailing)
                .padding(.top, 28)

            VStack(spacing: 0) {
                Rectangle()
                    .fill(isFirst ? .clear : Color.secondary.opacity(0.14))
                    .frame(width: 1, height: (cardHeight - markerSize) / 2)

                Circle()
                    .strokeBorder(NomiPalette.surfaceLift.opacity(0.86), lineWidth: 2)
                    .background(Circle().fill(item.tint.opacity(0.68)))
                    .frame(width: markerSize, height: markerSize)
                    .scaleEffect(appeared ? 1 : 0.4)

                Rectangle()
                    .fill(isLast ? .clear : Color.secondary.opacity(0.14))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)
            }
            .frame(width: 10, height: cardHeight + rowGap)

            HStack(spacing: 11) {
                ZStack {
                    Circle()
                        .fill(item.tint.opacity(0.1))
                    if let image = item.image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity.combined(with: .scale(scale: 0.94)))
                            .clipShape(Circle())
                    } else {
                        Image(systemName: item.symbol)
                            .font(NomiType.captionStrong)
                            .foregroundStyle(item.tint)
                            .symbolEffect(.bounce, value: appeared)
                    }
                }
                .frame(width: 34, height: 34)

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.subtitle)
                        .font(.caption.weight(.regular))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(item.detail)
                        .font(NomiType.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if let badge = item.badge {
                    Text(badge)
                        .font(NomiType.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 5)
                        .padding(.horizontal, 8)
                        .background(NomiPalette.fill.opacity(0.58), in: Capsule())
                }
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(height: cardHeight)
            .nomiContentSurface(
                in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.card)), isUniform: true),
                fillOpacity: 0.56,
                strokeOpacity: 0.85,
                shadowOpacity: 0.025,
                shadowRadius: 12,
                shadowY: 7
            )
        }
        .frame(height: cardHeight + rowGap, alignment: .top)
        .offset(y: appeared ? 0 : 12)
        .opacity(appeared ? 1 : 0)
        .accessibilityIdentifier("timeline-row-\(index)")
        .onAppear {
            withAnimation(.spring(duration: 0.55, bounce: 0.18).delay(Double(index) * 0.07)) {
                appeared = true
            }
        }
    }
}

struct UploadSheet: View {
    let onUpload: (UploadResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedSource: UploadSource = .photos
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var importedImage: UIImage?
    @State private var importedImageData: Data?
    @State private var importedName = String(localized: "upload.no.file.selected")
    @State private var importedMimeType = "image/jpeg"
    @State private var showFileImporter = false
    @State private var isUploading = false
    @State private var uploadProgress = 0.0
    @State private var uploadError: String?
    @State private var cameraMessage: String?
    @State private var controlsAppeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("nav.add")
                .font(NomiType.pageTitle)

            sourcePicker

            uploadPreview

            Spacer(minLength: 8)

            Button {
                if importedImage == nil {
                    choose(selectedSource)
                } else {
                    startUpload()
                }
            } label: {
                HStack {
                    if isUploading {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(isUploading ? "upload.analyzing" : importedImage == nil ? "upload.choose" : "upload.upload")
                        .font(NomiType.bodyEmphasis)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.capsule)
            .tint(NomiPalette.ink)
            .disabled(isUploading)
            .accessibilityIdentifier("upload-primary-button")
        }
        .padding(.horizontal, 22)
        .padding(.top, 64)
        .padding(.bottom, 24)
        .overlay(alignment: .topTrailing) {
            Button(role: .close) {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(.headline, design: .default, weight: .medium))
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .tint(NomiPalette.ink.opacity(0.72))
            .frame(width: 52, height: 52)
            .padding(.top, 52)
            .padding(.trailing, 24)
            .accessibilityLabel("accessibility.close")
            .accessibilityIdentifier("upload-close-button")
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhoto, matching: .images)
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.image],
            allowsMultipleSelection: false
        ) { result in
            importFile(result)
        }
        .task(id: selectedPhoto) {
            await loadSelectedPhoto()
        }
        .onAppear {
            withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
                controlsAppeared = true
            }
        }
    }

    private var sourcePicker: some View {
        HStack(spacing: 10) {
            ForEach(Array(UploadSource.allCases.enumerated()), id: \.element.id) { index, source in
                Button {
                    choose(source)
                } label: {
                    VStack(spacing: 9) {
                        Image(systemName: source.symbol)
                            .font(.system(.title3, design: .default, weight: .semibold))
                            .symbolEffect(.bounce, value: selectedSource)
                        Text(source.titleKey)
                            .font(NomiType.captionStrong)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 76)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.roundedRectangle(radius: 20))
                .tint(selectedSource == source ? NomiPalette.ink.opacity(0.82) : NomiPalette.muted.opacity(0.34))
                .opacity(controlsAppeared ? 1 : 0)
                .offset(y: controlsAppeared ? 0 : 18)
                .animation(.spring(duration: 0.48, bounce: 0.22).delay(Double(index) * 0.05), value: controlsAppeared)
                .accessibilityIdentifier("upload-source-\(source.apiValue)")
            }
        }
    }

    private var uploadPreview: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(selectedSource.copyKey)
                        .font(NomiType.cardTitle)
                    Text(cameraMessage ?? importedName)
                        .font(.subheadline.weight(.regular))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: importedImage == nil ? "plus.viewfinder" : "checkmark.circle.fill")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(importedImage == nil ? Color.secondary : NomiPalette.metric)
                    .contentTransition(.symbolEffect(.replace))
            }

            ZStack {
                ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.panel)), isUniform: true)
                    .fill(NomiPalette.surfaceLift.opacity(0.50))

                if let importedImage {
                    Image(uiImage: importedImage)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: selectedSource.symbol)
                            .font(.system(.largeTitle, design: .default, weight: .semibold))
                            .foregroundStyle(.secondary)
                        Text("upload.tap.to.choose")
                            .font(.subheadline.weight(.regular))
                            .foregroundStyle(.secondary)
                    }
                }

                if isUploading {
                    VStack(spacing: 12) {
                        ProgressView(value: uploadProgress)
                            .progressViewStyle(.linear)
                            .tint(NomiPalette.ink)
                        Text("upload.analyzing")
                            .font(NomiType.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(18)
                    .background(.thinMaterial, in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.card)), isUniform: true))
                    .padding(26)
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
                }
            }
            .frame(height: 164)
            .clipShape(ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.panel)), isUniform: true))
            .onTapGesture {
                choose(selectedSource)
            }

            if let uploadError {
                VStack(alignment: .leading, spacing: 9) {
                    HStack {
                        Text(uploadError)
                            .font(NomiType.cardTitle)
                        Spacer()
                    }
                }
                .padding(14)
                .nomiContentSurface(
                    in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.card)), isUniform: true),
                    fillOpacity: 0.48,
                    strokeOpacity: 0.6,
                    shadowOpacity: 0,
                    shadowRadius: 0,
                    shadowY: 0
                )
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .padding(18)
        .nomiContentSurface(
            in: ConcentricRectangle(corners: .concentric(minimum: .fixed(NomiRadii.panel)), isUniform: true),
            fillOpacity: 0.62,
            shadowOpacity: 0.03,
            shadowRadius: 16,
            shadowY: 8
        )
        .opacity(controlsAppeared ? 1 : 0)
        .offset(y: controlsAppeared ? 0 : 18)
        .animation(.spring(duration: 0.55, bounce: 0.2).delay(0.12), value: controlsAppeared)
    }

    private func choose(_ source: UploadSource) {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.spring(duration: 0.4, bounce: 0.2)) {
            selectedSource = source
            cameraMessage = nil
            uploadError = nil
        }

        switch source {
        case .camera:
            cameraMessage = String(localized: "upload.camera.simulator.placeholder")
        case .photos:
            showPhotoPicker = true
        case .files:
            showFileImporter = true
        }
    }

    private func loadSelectedPhoto() async {
        guard let selectedPhoto else { return }
        do {
            if let data = try await selectedPhoto.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                let mimeType = selectedPhoto.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg"
                await MainActor.run {
                    withAnimation(.spring(duration: 0.45, bounce: 0.18)) {
                        importedImage = image
                        importedImageData = data
                        importedName = String(localized: "upload.photo.library.image")
                        importedMimeType = mimeType
                        uploadError = nil
                    }
                }
            }
        } catch {
            await MainActor.run {
                importedName = String(localized: "upload.photo.load.error")
            }
        }
    }

    private func importFile(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else {
            importedName = String(localized: "upload.no.file.selected")
            return
        }

        let access = url.startAccessingSecurityScopedResource()
        defer {
            if access {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            if let image = UIImage(data: data) {
                let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "image/jpeg"
                withAnimation(.spring(duration: 0.45, bounce: 0.18)) {
                    importedImage = image
                    importedImageData = data
                    importedName = url.lastPathComponent
                    importedMimeType = mimeType
                    uploadError = nil
                }
            } else {
                importedName = String(localized: "upload.file.not.image")
            }
        } catch {
            importedName = String(localized: "upload.file.import.error")
        }
    }

    private func startUpload() {
        guard importedImage != nil, let importedImageData else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let assetName = importedName
        let imageData = importedImageData
        let mimeType = importedMimeType
        let source = selectedSource

        isUploading = true
        uploadError = nil
        uploadProgress = 0.12

        Task {
            await advanceUploadProgress(to: 0.36)
            do {
                let timelineItem = try await RecordsClient.uploadImage(
                    data: imageData,
                    assetName: assetName,
                    source: source,
                    mimeType: mimeType
                )
                await MainActor.run {
                    withAnimation(.smooth(duration: 0.24)) {
                        uploadProgress = 0.78
                    }
                }
                await advanceUploadProgress(to: 1.0)

                await MainActor.run {
                    onUpload(
                        UploadResult(
                            item: timelineItem,
                            source: source,
                            assetName: assetName
                        )
                    )
                }
            } catch {
                await MainActor.run {
                    withAnimation(.smooth(duration: 0.24)) {
                        uploadError = String(localized: "upload.file.import.error")
                        isUploading = false
                        uploadProgress = 0
                    }
                }
            }
        }
    }

    private func advanceUploadProgress(to value: Double) async {
        try? await Task.sleep(for: .milliseconds(260))
        await MainActor.run {
            withAnimation(.smooth(duration: 0.24)) {
                uploadProgress = value
            }
        }
    }

}

extension UploadSource {
    init?(apiValue: String) {
        switch apiValue.lowercased() {
        case "camera":
            self = .camera
        case "library", "photos":
            self = .photos
        case "file", "files":
            self = .files
        default:
            return nil
        }
    }

    var apiValue: String {
        switch self {
        case .camera: "camera"
        case .photos: "library"
        case .files: "file"
        }
    }
}

private extension TimelineItem {
    var caloriesKcal: Int {
        value(before: "千卡") + value(before: "kcal")
    }

    var proteinG: Int {
        value(before: "g 蛋白质") + value(before: "g protein")
    }

    var durationMin: Int {
        value(before: " 分钟") + value(before: " min") + value(before: "m /")
    }

    func value(before marker: String) -> Int {
        guard let range = detail.range(of: marker) else {
            return 0
        }

        let prefix = detail[..<range.lowerBound]
        let digits = prefix
            .reversed()
            .drop { !$0.isNumber }
            .prefix { $0.isNumber }
            .reversed()
        return Int(String(digits)) ?? 0
    }
}

struct NomiBackground: View {
    var ignoresSafeArea = true

    var body: some View {
        if ignoresSafeArea {
            NomiPalette.paper
                .ignoresSafeArea()
        } else {
            NomiPalette.paper
        }
    }
}

#Preview {
    ContentView()
}
