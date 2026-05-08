import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UIKit

enum AppLanguage: String, CaseIterable, Identifiable {
    case english
    case simplifiedChinese

    static let storageKey = "nomi.languagePreference"

    var id: String { rawValue }

    static var detected: AppLanguage {
        let preferred = Locale.preferredLanguages.first ?? Locale.autoupdatingCurrent.identifier
        return preferred.lowercased().hasPrefix("zh") ? .simplifiedChinese : .english
    }

    static func value(for rawValue: String) -> AppLanguage {
        switch rawValue {
        case Self.english.rawValue:
            .english
        case Self.simplifiedChinese.rawValue:
            .simplifiedChinese
        default:
            Self.detected
        }
    }

    var resolvedLocale: Locale {
        switch self {
        case .english:
            Locale(identifier: "en")
        case .simplifiedChinese:
            Locale(identifier: "zh-Hans")
        }
    }

    var titleKey: LocalizedStringKey {
        switch self {
        case .english: "language.english"
        case .simplifiedChinese: "language.chinese.simplified"
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

struct ImageExtraction: Decodable, Equatable {
    let schemaVersion: String
    let direction: String
    let inputCategory: String
    let outputImpacts: [String]
    let title: String
    let summary: String
    let confidence: Double
    let metadata: ExtractionMetadata

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case direction
        case inputCategory = "input_category"
        case outputImpacts = "output_impacts"
        case title
        case summary
        case confidence
        case metadata
    }
}

struct ExtractionMetadata: Decodable, Equatable {
    let foodCategory: String?
    let portionEstimate: String?
    let weightG: Int?
    let caloriesKcal: Int?
    let proteinG: Int?
    let fatG: Int?
    let carbsG: Int?
    let fiberG: Int?
    let waterMl: Int?
    let caffeineMg: Int?
    let alcoholG: Int?
    let nicotineMg: Int?
    let durationMin: Int?
    let micronutrients: [String]?
    let minerals: [String]?
    let vitamins: [String]?
    let estimatedFrom: [String]?
    let reviewNeeded: [String]?
    let originalMimeType: String?

    enum CodingKeys: String, CodingKey {
        case foodCategory = "food_category"
        case portionEstimate = "portion_estimate"
        case weightG = "weight_g"
        case caloriesKcal = "calories_kcal"
        case proteinG = "protein_g"
        case fatG = "fat_g"
        case carbsG = "carbs_g"
        case fiberG = "fiber_g"
        case waterMl = "water_ml"
        case caffeineMg = "caffeine_mg"
        case alcoholG = "alcohol_g"
        case nicotineMg = "nicotine_mg"
        case durationMin = "duration_min"
        case micronutrients
        case minerals
        case vitamins
        case estimatedFrom = "estimated_from"
        case reviewNeeded = "review_needed"
        case originalMimeType = "original_mime_type"
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
    static let sheet: CGFloat = 32
    static let panel: CGFloat = 28
    static let card: CGFloat = 18
    static let tile: CGFloat = 16
}

private enum NomiPalette {
    static let paper = Color(red: 0.98, green: 0.96, blue: 0.91)
    static let surface = Color(red: 1.0, green: 0.98, blue: 0.94)
    static let ink = Color(red: 0.22, green: 0.18, blue: 0.15)
    static let muted = Color(red: 0.45, green: 0.40, blue: 0.35)
    static let clay = Color(red: 0.70, green: 0.39, blue: 0.31)
    static let cocoa = Color(red: 0.42, green: 0.28, blue: 0.22)
}

struct UploadResult {
    let item: TimelineItem
    let extraction: ImageExtraction
    let source: UploadSource
    let assetName: String
}

struct ContentView: View {
    @State private var showUploadSheet = false
    @State private var showHero = false
    @State private var showSidebar = false
    @State private var sidebarProgress: CGFloat = 0
    @State private var timelineItems: [TimelineItem] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            NomiBackground()

            NavigationStack {
                HomeView(
                    items: timelineItems,
                    showHero: showHero,
                    onAdd: openUploadSheet
                )
                .navigationTitle("Nomi")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        SidebarButton(action: openSidebar)
                            .opacity(showSidebar ? 0 : 1)
                            .allowsHitTesting(!showSidebar)
                            .accessibilityHidden(showSidebar)
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
                .toolbarBackground(.hidden, for: .navigationBar)
            }
            .background {
                NomiBackground()
            }
            .offset(x: sidebarProgress * 14)
            .scaleEffect(1 - sidebarProgress * 0.012, anchor: .trailing)
            .animation(.smooth(duration: 0.34), value: sidebarProgress)

            CenterAddButton(onAdd: openUploadSheet)
                .padding(.bottom, 12)
                .offset(x: sidebarProgress * 10)
                .opacity(Double(1 - sidebarProgress * 0.28))
                .animation(.smooth(duration: 0.28), value: sidebarProgress)

            if showSidebar {
                SidebarOverlay(progress: sidebarProgress, onClose: closeSidebar)
                    .zIndex(2)
            }
        }
        .tint(.primary)
        .sheet(isPresented: $showUploadSheet) {
            UploadSheet { result in
                withAnimation(.spring(duration: 0.55, bounce: 0.22)) {
                    timelineItems.insert(result.item, at: 0)
                }
                showUploadSheet = false
                Task {
                    await RecordsClient.save(
                        extraction: result.extraction,
                        source: result.source,
                        assetName: result.assetName
                    )
                }
            }
            .presentationDetents([.fraction(0.74), .large])
            .presentationCornerRadius(NomiRadii.sheet)
            .presentationBackground {
                NomiBackground()
            }
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

    private func openUploadSheet() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.bouncy(duration: 0.45)) {
            showUploadSheet = true
        }
    }

    private func openSidebar() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        guard !showSidebar else { return }
        sidebarProgress = 0
        showSidebar = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(18))
            withAnimation(.spring(duration: 0.46, bounce: 0.20)) {
                sidebarProgress = 1
            }
        }
    }

    private func closeSidebar() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.smooth(duration: 0.26)) {
            sidebarProgress = 0
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(260))
            guard sidebarProgress == 0 else { return }
            showSidebar = false
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

                let extraction = await ImageExtractionClient.analyze(
                    data: imageData,
                    assetName: item.fileName,
                    source: source,
                    mimeType: item.mimeType
                )

                await MainActor.run {
                    timelineItems.insert(extraction.timelineItem(source: source, image: image), at: 0)
                    writeE2EResult(
                        "NOMI_E2E_UPLOAD_RESULT ok \(source.apiValue) \(item.fileName) \(extraction.schemaVersion) \(extraction.inputCategory) \(extraction.title) \(Int((extraction.confidence * 100).rounded()))",
                        to: resultsURL
                    )
                }
                await RecordsClient.save(
                    extraction: extraction,
                    source: source,
                    assetName: item.fileName
                )
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
            try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: url)
        }
    }
}

struct SidebarButton: View {
    let action: () -> Void

    var body: some View {
        Button {
            action()
        } label: {
            VStack(spacing: 5) {
                Capsule()
                    .fill(NomiPalette.ink.opacity(0.76))
                    .frame(width: 18, height: 2)
                Capsule()
                    .fill(NomiPalette.ink.opacity(0.76))
                    .frame(width: 12, height: 2)
                    .frame(width: 18, alignment: .leading)
            }
        }
        .buttonStyle(
            LiquidCircleButtonStyle(
                visualSize: 44,
                touchSize: 52,
                glassTint: NomiPalette.surface,
                shadowOpacity: 0.08
            )
        )
        .accessibilityLabel("accessibility.sidebar")
        .accessibilityIdentifier("sidebar-button")
    }
}

struct CenterAddButton: View {
    let onAdd: () -> Void
    @State private var appeared = false

    var body: some View {
        Button {
            onAdd()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .medium))
                .symbolEffect(.bounce, value: appeared)
                .foregroundStyle(NomiPalette.clay)
        }
        .buttonStyle(
            LiquidCircleButtonStyle(
                visualSize: 44,
                touchSize: 56,
                glassTint: NomiPalette.clay,
                shadowOpacity: 0.10
            )
        )
        .scaleEffect(appeared ? 1 : 0.9)
        .opacity(appeared ? 1 : 0)
        .accessibilityLabel("accessibility.upload")
        .accessibilityIdentifier("bottom-add")
        .glassEffectTransition(.materialize)
        .onAppear {
            withAnimation(.spring(duration: 0.55, bounce: 0.2)) {
                appeared = true
            }
        }
    }
}

struct LiquidCircleButtonStyle: ButtonStyle {
    let visualSize: CGFloat
    let touchSize: CGFloat
    let glassTint: Color
    let shadowOpacity: Double

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: visualSize, height: visualSize)
            .background {
                Circle()
                    .fill(NomiPalette.surface.opacity(configuration.isPressed ? 0.72 : 0.58))
                    .glassEffect(
                        .regular
                            .tint(glassTint.opacity(configuration.isPressed ? 0.18 : 0.08))
                            .interactive(),
                        in: .circle
                    )
                    .shadow(
                        color: NomiPalette.cocoa.opacity(configuration.isPressed ? shadowOpacity * 0.5 : shadowOpacity),
                        radius: configuration.isPressed ? 9 : 16,
                        y: configuration.isPressed ? 4 : 10
                    )
            }
            .scaleEffect(configuration.isPressed ? 0.93 : 1)
            .animation(.interactiveSpring(duration: 0.18, extraBounce: 0.12), value: configuration.isPressed)
            .frame(width: touchSize, height: touchSize)
            .contentShape(Circle())
            .glassEffectTransition(.materialize)
    }
}

struct SidebarOverlay: View {
    let progress: CGFloat
    let onClose: () -> Void
    @AppStorage(AppLanguage.storageKey) private var languagePreference = AppLanguage.detected.rawValue

    private var selectedLanguage: AppLanguage {
        AppLanguage.value(for: languagePreference)
    }

    var body: some View {
        GeometryReader { proxy in
            let drawerWidth = min(proxy.size.width * 0.76, 292)

            ZStack(alignment: .leading) {
                sidebarBackdrop
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onClose()
                    }

                sidebarContent
                .frame(width: drawerWidth)
                .frame(maxHeight: .infinity, alignment: .top)
                .background {
                    ZStack {
                        NomiBackground()

                        LinearGradient(
                            colors: [
                                NomiPalette.surface.opacity(0.22),
                                .white.opacity(0.04)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    }
                    .clipShape(sidebarShape)
                    .glassEffect(.regular, in: sidebarShape)
                    .shadow(color: NomiPalette.cocoa.opacity(0.12), radius: 28, x: 10, y: 18)
                    .ignoresSafeArea()
                }
                .offset(x: -drawerWidth * (1 - progress))
                .scaleEffect(x: 0.985 + progress * 0.015, y: 1, anchor: .leading)
                .glassEffectTransition(.materialize)
                .accessibilityIdentifier("sidebar-drawer")
            }
        }
    }

    private var sidebarShape: ConcentricRectangle {
        ConcentricRectangle(
            uniformLeadingCorners: .fixed(0),
            uniformTrailingCorners: .concentric(minimum: .fixed(30))
        )
    }

    private var sidebarBackdrop: some View {
        NomiBackground()
            .opacity(Double(progress))
        .ignoresSafeArea()
    }

    private var sidebarContent: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("sidebar.username")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .foregroundStyle(NomiPalette.ink)
                .padding(.top, 82)
                .opacity(Double(progress))
                .offset(x: -18 * (1 - progress))

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "character.bubble")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NomiPalette.clay)
                        .frame(width: 30, height: 30)
                        .background(NomiPalette.clay.opacity(0.11), in: Circle())

                    Text("settings.language")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NomiPalette.ink)

                    Spacer(minLength: 0)
                }

                languagePicker
            }
            .padding(12)
            .background(NomiPalette.surface.opacity(0.52), in: .rect(corners: .concentric(minimum: .fixed(NomiRadii.card))))
            .glassEffect(.regular.interactive(), in: .rect(corners: .concentric(minimum: .fixed(NomiRadii.card))))
            .opacity(Double(progress))
            .offset(x: -24 * (1 - progress))
            .scaleEffect(0.985 + progress * 0.015, anchor: .leading)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 28)
    }

    private var languagePicker: some View {
        HStack(spacing: 6) {
            ForEach(AppLanguage.allCases) { language in
                Button {
                    UISelectionFeedbackGenerator().selectionChanged()
                    withAnimation(.spring(duration: 0.28, bounce: 0.14)) {
                        languagePreference = language.rawValue
                    }
                } label: {
                    Text(language.titleKey)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.74)
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .foregroundStyle(selectedLanguage == language ? NomiPalette.ink : NomiPalette.muted.opacity(0.78))
                        .contentShape(Rectangle())
                        .background {
                            if selectedLanguage == language {
                                ConcentricRectangle(corners: .concentric(minimum: .fixed(12)), isUniform: true)
                                    .fill(NomiPalette.surface.opacity(0.82))
                                    .overlay {
                                        ConcentricRectangle(corners: .concentric(minimum: .fixed(12)), isUniform: true)
                                            .stroke(.white.opacity(0.68), lineWidth: 1)
                                    }
                                    .transition(.scale.combined(with: .opacity))
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("language-\(language.rawValue)")
            }
        }
        .padding(3)
        .background(NomiPalette.cocoa.opacity(0.06), in: .rect(corners: .concentric(minimum: .fixed(15))))
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
                                    .font(.title2.weight(.semibold))
                                Spacer()
                                Text("\(items.count)")
                                    .font(.subheadline)
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
    @State private var breathe = false

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
                tint: Color(red: 0.77, green: 0.47, blue: 0.21),
                progress: items.isEmpty ? 0 : min(Double(calories) / 2200, 1)
            ),
            DailyMetric(
                id: "protein",
                titleKey: "metric.protein",
                value: "\(protein)g",
                detailKey: "metric.protein.target",
                symbol: "circle.hexagongrid.fill",
                tint: Color(red: 0.38, green: 0.50, blue: 0.38),
                progress: min(Double(protein) / 120, 1)
            ),
            DailyMetric(
                id: "strength",
                titleKey: "metric.strength",
                value: "\(strength)m",
                detailKey: "metric.today",
                symbol: "dumbbell.fill",
                tint: Color(red: 0.40, green: 0.45, blue: 0.55),
                progress: nil
            ),
            DailyMetric(
                id: "walk",
                titleKey: "metric.walk",
                value: "\(walk)m",
                detailKey: "metric.today",
                symbol: "figure.walk",
                tint: Color(red: 0.39, green: 0.54, blue: 0.47),
                progress: nil
            ),
            DailyMetric(
                id: "sitting",
                titleKey: "metric.sitting",
                value: "\(sitting)m",
                detailKey: "metric.today",
                symbol: "chair.fill",
                tint: Color(red: 0.51, green: 0.48, blue: 0.42),
                progress: nil
            ),
            DailyMetric(
                id: "sleep",
                titleKey: "metric.sleep",
                value: "\(sleep)m",
                detailKey: "metric.today",
                symbol: "moon.fill",
                tint: Color(red: 0.38, green: 0.43, blue: 0.53),
                progress: nil
            )
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("tab.today")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                    Text(items.count == 1 ? "today.item.count.one" : "today.item.count.many \(items.count)")
                        .font(.system(size: 24, weight: .semibold, design: .rounded))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 18)

                ZStack {
                    Circle()
                        .fill(.white.opacity(0.72))
                        .frame(width: 50, height: 50)
                        .glassEffect(.regular.interactive(), in: .circle)
                    Image(systemName: "heart.text.square.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Color(red: 0.33, green: 0.40, blue: 0.32))
                        .symbolEffect(.pulse, options: .repeating, value: breathe)
                }
                .scaleEffect(breathe ? 1.035 : 0.985)
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
        .background {
            RoundedRectangle(cornerRadius: NomiRadii.panel, style: .continuous)
                .fill(.white.opacity(0.72))
                .glassEffect(.regular, in: .rect(cornerRadius: NomiRadii.panel))
                .shadow(color: .black.opacity(0.08), radius: 28, y: 18)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                breathe = true
            }
        }
    }
}

struct MetricTile: View {
    let metric: DailyMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: metric.symbol)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(metric.tint)
                    .frame(width: 20, height: 20)
                    .background(metric.tint.opacity(0.11), in: Circle())

                Text(metric.titleKey)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(metric.value)
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Text(metric.detailKey)
                    .font(.caption2)
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
        .background(.white.opacity(0.48), in: RoundedRectangle(cornerRadius: NomiRadii.tile, style: .continuous))
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
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: 48, alignment: .trailing)
                .padding(.top, 28)

            VStack(spacing: 0) {
                Rectangle()
                    .fill(isFirst ? .clear : Color.secondary.opacity(0.14))
                    .frame(width: 1, height: (cardHeight - markerSize) / 2)

                Circle()
                    .strokeBorder(Color.white.opacity(0.86), lineWidth: 2)
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
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(item.tint)
                            .symbolEffect(.bounce, value: appeared)
                    }
                }
                .frame(width: 34, height: 34)

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(item.detail)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if let badge = item.badge {
                    Text(badge)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 5)
                        .padding(.horizontal, 8)
                        .background(.white.opacity(0.46), in: Capsule())
                }
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(height: cardHeight)
            .background {
                RoundedRectangle(cornerRadius: NomiRadii.card, style: .continuous)
                    .fill(Color.white.opacity(0.56))
                    .overlay {
                        RoundedRectangle(cornerRadius: NomiRadii.card, style: .continuous)
                            .stroke(.white.opacity(0.55), lineWidth: 1)
                    }
            }
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
    @State private var extraction: ImageExtraction?
    @State private var cameraMessage: String?
    @State private var controlsAppeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("nav.add")
                .font(.system(size: 34, weight: .semibold, design: .rounded))

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
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.capsule)
            .tint(.black.opacity(0.86))
            .disabled(isUploading)
            .accessibilityIdentifier("upload-primary-button")
        }
        .padding(.horizontal, 22)
        .padding(.top, 72)
        .padding(.bottom, 24)
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .padding(.top, 58)
            .padding(.trailing, 26)
            .accessibilityLabel("accessibility.close")
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
                            .font(.title3.weight(.semibold))
                            .symbolEffect(.bounce, value: selectedSource)
                        Text(source.titleKey)
                            .font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 80)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.roundedRectangle(radius: 20))
                .tint(selectedSource == source ? .primary.opacity(0.75) : .secondary.opacity(0.35))
                .scaleEffect(selectedSource == source ? 1.02 : 1)
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
                        .font(.headline)
                    Text(cameraMessage ?? importedName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: importedImage == nil ? "plus.viewfinder" : "checkmark.circle.fill")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(importedImage == nil ? Color.secondary : Color.green)
                    .contentTransition(.symbolEffect(.replace))
            }

            ZStack {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(.white.opacity(0.54))

                if let importedImage {
                    Image(uiImage: importedImage)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: selectedSource.symbol)
                            .font(.system(size: 36, weight: .semibold))
                            .foregroundStyle(.secondary)
                        Text("upload.tap.to.choose")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if isUploading {
                    VStack(spacing: 12) {
                        ProgressView(value: uploadProgress)
                            .progressViewStyle(.linear)
                            .tint(.primary)
                        Text("upload.analyzing")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .padding(18)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .padding(26)
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
                }
            }
            .frame(height: 164)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .glassEffect(.regular, in: .rect(cornerRadius: 28))
            .onTapGesture {
                choose(selectedSource)
            }

            if let extraction {
                VStack(alignment: .leading, spacing: 9) {
                    HStack {
                        Text(extraction.title)
                            .font(.headline)
                        Spacer()
                        Text("\(Int((extraction.confidence * 100).rounded()))%")
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(.white.opacity(0.58), in: Capsule())
                    }

                    Text(extraction.metadataLine)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    Text(extraction.outputImpacts.joined(separator: " / "))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(14)
                .background(.white.opacity(0.46), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .padding(18)
        .background {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.white.opacity(0.62))
                .glassEffect(.regular, in: .rect(cornerRadius: NomiRadii.panel))
        }
        .opacity(controlsAppeared ? 1 : 0)
        .offset(y: controlsAppeared ? 0 : 18)
        .animation(.spring(duration: 0.55, bounce: 0.2).delay(0.12), value: controlsAppeared)
    }

    private func choose(_ source: UploadSource) {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.spring(duration: 0.4, bounce: 0.2)) {
            selectedSource = source
            cameraMessage = nil
            extraction = nil
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
                        extraction = nil
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
                    extraction = nil
                }
            } else {
                importedName = String(localized: "upload.file.not.image")
            }
        } catch {
            importedName = String(localized: "upload.file.import.error")
        }
    }

    private func startUpload() {
        guard let importedImage, let importedImageData else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let assetName = importedName
        let imageData = importedImageData
        let mimeType = importedMimeType
        let source = selectedSource

        isUploading = true
        uploadProgress = 0.12

        Task {
            await advanceUploadProgress(to: 0.36)
            let extraction = await ImageExtractionClient.analyze(
                data: imageData,
                assetName: assetName,
                source: source,
                mimeType: mimeType
            )
            await MainActor.run {
                withAnimation(.smooth(duration: 0.24)) {
                    self.extraction = extraction
                    uploadProgress = 0.78
                }
            }
            await advanceUploadProgress(to: 1.0)

            await MainActor.run {
                let newItem = extraction.timelineItem(source: source, image: importedImage)
                onUpload(
                    UploadResult(
                        item: newItem,
                        extraction: extraction,
                        source: source,
                        assetName: assetName
                    )
                )
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
        value(before: "kcal")
    }

    var proteinG: Int {
        value(before: "g protein")
    }

    var durationMin: Int {
        value(before: " min") + value(before: "m /")
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

private enum ImageExtractionClient {
    static func analyze(
        data: Data,
        assetName: String,
        source: UploadSource,
        mimeType: String
    ) async -> ImageExtraction {
        do {
            var request = URLRequest(url: NomiAPI.url(path: "ai/extract-image"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                ImageExtractionRequest(
                    assetName: assetName,
                    source: source.apiValue,
                    mimeType: mimeType,
                    imageBase64: data.base64EncodedString()
                )
            )

            let (responseData, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                return .fallback(assetName: assetName, source: source, mimeType: mimeType)
            }

            return try JSONDecoder().decode(ImageExtraction.self, from: responseData)
        } catch {
            return .fallback(assetName: assetName, source: source, mimeType: mimeType)
        }
    }
}

extension ImageExtraction {
    var metadataLine: String {
        let values = [
            metadata.caloriesKcal.map { "\($0) kcal" },
            metadata.proteinG.map { "\($0)g protein" },
            metadata.carbsG.map { "\($0)g carbs" },
            metadata.fatG.map { "\($0)g fat" },
            metadata.fiberG.map { "\($0)g fiber" },
            metadata.waterMl.map { "\($0)ml water" },
            metadata.nicotineMg.map { "\($0)mg nicotine" },
            metadata.durationMin.map { "\($0) min" }
        ].compactMap(\.self)

        if !values.isEmpty {
            return values.joined(separator: " / ")
        }

        return summary
    }

    static func fallback(assetName: String, source: UploadSource, mimeType: String) -> ImageExtraction {
        ImageExtraction(
            schemaVersion: "2026-05-07.inputs-outputs.v1",
            direction: "input",
            inputCategory: assetName.localizedCaseInsensitiveContains("receipt") ? "information" : "food",
            outputImpacts: assetName.localizedCaseInsensitiveContains("receipt") ? ["focus", "mood"] : ["energy", "health"],
            title: assetName.localizedCaseInsensitiveContains("receipt") ? "Information input" : "Food input",
            summary: "Estimated upload record. Review details before using it for trends.",
            confidence: 0.62,
            metadata: ExtractionMetadata(
                foodCategory: assetName.localizedCaseInsensitiveContains("receipt") ? nil : "mixed meal",
                portionEstimate: assetName.localizedCaseInsensitiveContains("receipt") ? nil : "review needed",
                weightG: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 420,
                caloriesKcal: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 540,
                proteinG: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 28,
                fatG: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 18,
                carbsG: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 62,
                fiberG: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 7,
                waterMl: assetName.localizedCaseInsensitiveContains("receipt") ? nil : 180,
                caffeineMg: nil,
                alcoholG: nil,
                nicotineMg: nil,
                durationMin: nil,
                micronutrients: nil,
                minerals: nil,
                vitamins: nil,
                estimatedFrom: ["asset_name", "source"],
                reviewNeeded: ["context", "portion or duration"],
                originalMimeType: mimeType
            )
        )
    }

    func timelineItem(source: UploadSource, image: UIImage) -> TimelineItem {
        TimelineItem(
            time: "Now",
            title: title,
            subtitle: "\(inputCategory.capitalized) / \(direction.capitalized)",
            detail: metadataLine,
            symbol: symbolName,
            tint: tint,
            image: image,
            minutesAgo: 0,
            badge: badgeText
        )
    }

    var symbolName: String {
        switch inputCategory {
        case "beverage": "drop"
        case "caffeine": "cup.and.saucer"
        case "alcohol": "wineglass"
        case "nicotine": "smoke"
        case "exercise": "figure.run"
        case "sunlight": "sun.max"
        case "social": "person.2"
        case "information": "doc.text"
        default: "fork.knife"
        }
    }

    var tint: Color {
        switch inputCategory {
        case "caffeine": Color(red: 0.50, green: 0.42, blue: 0.35)
        case "beverage", "sunlight": Color(red: 0.40, green: 0.52, blue: 0.56)
        case "exercise": Color(red: 0.40, green: 0.45, blue: 0.55)
        case "information": Color(red: 0.50, green: 0.48, blue: 0.42)
        case "nicotine": Color(red: 0.48, green: 0.46, blue: 0.50)
        case "social": Color(red: 0.55, green: 0.42, blue: 0.46)
        default: Color(red: 0.42, green: 0.52, blue: 0.39)
        }
    }

    var badgeText: String? {
        if let calories = metadata.caloriesKcal {
            return "\(calories)"
        }
        if let duration = metadata.durationMin {
            return "\(duration)m"
        }
        return "\(Int((confidence * 100).rounded()))%"
    }
}

struct NomiBackground: View {
    var ignoresSafeArea = true

    var body: some View {
        let gradient = LinearGradient(
            colors: [
                Color(red: 0.98, green: 0.97, blue: 0.94),
                Color(red: 0.91, green: 0.95, blue: 0.97),
                Color(red: 0.97, green: 0.94, blue: 0.92)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )

        if ignoresSafeArea {
            gradient
                .ignoresSafeArea()
        } else {
            gradient
        }
    }
}

#Preview {
    ContentView()
}
