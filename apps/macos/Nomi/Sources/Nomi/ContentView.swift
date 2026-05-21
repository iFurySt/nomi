import AppKit
import SwiftUI
import UniformTypeIdentifiers

private enum NomiType {
    static let breadcrumb = Font.system(size: 14, weight: .bold, design: .default)
    static let title = Font.system(size: 23, weight: .bold, design: .default)
    static let section = Font.system(size: 18, weight: .bold, design: .default)
    static let cardTitle = Font.system(size: 13, weight: .bold, design: .default)
    static let body = Font.system(size: 12, weight: .semibold, design: .default)
    static let bodyRegular = Font.system(size: 12, weight: .regular, design: .default)
    static let caption = Font.system(size: 10, weight: .semibold, design: .default)
    static let value = Font.system(size: 25, weight: .regular, design: .default)
}

private enum NomiColor {
    static let appBackground = Color(nsColor: .windowBackgroundColor)
    static let content = Color(hex: 0xfafaf8)
    static let surface = Color.white
    static let ink = Color(hex: 0x111111)
    static let secondaryInk = Color(hex: 0x666a70)
    static let muted = Color(hex: 0x8a8a8a)
    static let hairline = Color(hex: 0xeeeeed)
    static let softFill = Color(hex: 0xf3f3f2)
    static let overlayPanel = Color(hex: 0xfafaf9)
}

private struct NomiCursorModifier: ViewModifier {
    let cursor: NSCursor
    @State private var isHovering = false

    func body(content: Content) -> some View {
        content
            .onHover { hovering in
                guard hovering != isHovering else { return }
                isHovering = hovering
                if hovering {
                    cursor.push()
                } else {
                    NSCursor.pop()
                }
            }
            .onDisappear {
                if isHovering {
                    NSCursor.pop()
                    isHovering = false
                }
            }
    }
}

private extension View {
    func nomiCursor(_ cursor: NSCursor) -> some View {
        modifier(NomiCursorModifier(cursor: cursor))
    }
}

private final class NomiPlaceholderTextView: NSTextView {
    var placeholder = "" {
        didSet { needsDisplay = true }
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        guard string.isEmpty, !hasMarkedText(), !placeholder.isEmpty, window?.firstResponder !== self else { return }

        let textFont = font ?? .systemFont(ofSize: 14, weight: .regular)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: textFont,
            .foregroundColor: NSColor(calibratedWhite: 0.55, alpha: 1)
        ]
        let point = NSPoint(x: textContainerOrigin.x, y: textContainerOrigin.y)
        NSString(string: placeholder).draw(at: point, withAttributes: attributes)
    }

    override func becomeFirstResponder() -> Bool {
        let result = super.becomeFirstResponder()
        needsDisplay = true
        return result
    }

    override func resignFirstResponder() -> Bool {
        let result = super.resignFirstResponder()
        needsDisplay = true
        return result
    }
}

private struct NomiMultilineTextInput: NSViewRepresentable {
    @Binding var text: String
    let placeholder: String

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.scrollerStyle = .overlay

        let textView = NomiPlaceholderTextView()
        textView.delegate = context.coordinator
        textView.string = text
        textView.placeholder = placeholder
        textView.drawsBackground = false
        textView.isRichText = false
        textView.importsGraphics = false
        textView.allowsUndo = true
        textView.font = .systemFont(ofSize: 14, weight: .regular)
        textView.textColor = .labelColor
        textView.insertionPointColor = .labelColor
        textView.isEditable = true
        textView.isSelectable = true
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainerInset = NSSize(width: 3, height: 0)
        textView.textContainer?.lineFragmentPadding = 0
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(width: scrollView.contentSize.width, height: .greatestFiniteMagnitude)

        scrollView.documentView = textView
        context.coordinator.textView = textView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = context.coordinator.textView else { return }
        if textView.string != text {
            textView.string = text
        }
        if let textView = textView as? NomiPlaceholderTextView {
            textView.placeholder = placeholder
            textView.needsDisplay = true
        }
        textView.font = .systemFont(ofSize: 14, weight: .regular)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding private var text: String
        weak var textView: NSTextView?

        init(text: Binding<String>) {
            _text = text
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            text = textView.string
            textView.needsDisplay = true
        }
    }
}

private enum SidebarSection: String, CaseIterable, Identifiable, Hashable {
    case overview = "概览"
    case records = "记录"
    case data = "数据"
    case insights = "洞察"
    case reminders = "提醒"
    case profile = "我的"

    var id: String { rawValue }

    var symbolName: String {
        switch self {
        case .overview: "square.grid.2x2"
        case .records: "list.bullet.rectangle"
        case .data: "chart.bar"
        case .insights: "sparkles"
        case .reminders: "bell"
        case .profile: "person"
        }
    }
}

private enum RecordFilter: String, CaseIterable, Identifiable {
    case all = "全部"
    case food = "饮食"
    case fitness = "健身"
    case checkup = "体检"
    case text = "文本"
    case audio = "语音"
    case file = "文件"

    var id: String { rawValue }
}

private struct NomiRecord: Identifiable, Equatable {
    enum Visual: Equatable {
        case image(URL)
        case symbol(String, Color)
        case waveform
    }

    let id: String
    let time: String
    let dayGroup: String
    let dateLabel: String
    let title: String
    let summary: String
    let tag: RecordFilter
    let visual: Visual
    let status: String
    let calories: String
    let protein: String
    let carbs: String
    let fat: String
}

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase

    @State private var preferredColumn: NavigationSplitViewColumn = .detail
    @State private var records: [SavedRecord] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedSection: SidebarSection = .records
    @State private var selectedFilter: RecordFilter = .all
    @State private var selectedRecordID: String?
    @State private var searchText = ""
    @State private var showingAddOverlay = false
    @State private var expandedRecordID: String?
    @State private var isImportingDroppedFiles = false

    private static let recordsSyncInterval: Duration = .seconds(15)

    private var displayRecords: [NomiRecord] {
        records.map(NomiRecord.init(savedRecord:))
    }

    private var filteredRecords: [NomiRecord] {
        let rows = selectedFilter == .all ? displayRecords : displayRecords.filter { $0.tag == selectedFilter }
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return rows
        }

        return rows.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.summary.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var selectedRecord: NomiRecord? {
        guard let selectedRecordID else { return nil }
        return displayRecords.first { $0.id == selectedRecordID }
    }

    private var expandedRecord: NomiRecord? {
        guard let expandedRecordID else { return nil }
        return displayRecords.first { $0.id == expandedRecordID }
    }

    private var detailRouteKey: String {
        if selectedSection == .records, let expandedRecordID {
            return "records-expanded-\(expandedRecordID)"
        }
        return "section-\(selectedSection.id)"
    }

    private var isRecordsBackedSectionVisible: Bool {
        selectedSection == .overview || selectedSection == .records
    }

    var body: some View {
        ZStack {
            appShell

            if showingAddOverlay {
                AddRecordOverlay(
                    isPresented: $showingAddOverlay,
                    onExtractImage: { fileURL in
                        _ = try await RecordsClient.extractImage(fileURL: fileURL)
                        await loadRecords()
                    },
                    onSave: { draft in
                        try await RecordsClient.saveRecord(draft)
                        await loadRecords()
                    }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                .zIndex(10)
            }
        }
        .tint(.primary)
        .background(NomiColor.appBackground)
        .task {
            await loadRecords(showLoading: true)
        }
        .task {
            await runRecordsSyncLoop()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task {
                await loadRecords(showLoading: false)
            }
        }
        .onChange(of: selectedSection) { _, _ in
            guard isRecordsBackedSectionVisible else { return }
            Task {
                await loadRecords(showLoading: false)
            }
        }
        .accessibilityIdentifier("mac-health-record-app")
    }

    private var appShell: some View {
        NavigationSplitView(preferredCompactColumn: $preferredColumn) {
            NativeSidebarView(
                selectedSection: selectedSection,
                onSelectSection: selectSection
            )
                .navigationSplitViewColumnWidth(min: 150, ideal: 188, max: 220)
        } detail: {
            NavigationStack {
                detailColumn(for: selectedSection)
                    .id(detailRouteKey)
            }
        }
        .navigationSplitViewStyle(.balanced)
        .toolbarBackground(.hidden, for: .windowToolbar)
    }

    private func selectSection(_ section: SidebarSection) {
        withAnimation(.smooth(duration: 0.18)) {
            selectedSection = section
            expandedRecordID = nil
            selectedRecordID = nil
        }
    }

    private func returnToRecordsList() {
        withAnimation(.smooth(duration: 0.22)) {
            selectedSection = .records
            expandedRecordID = nil
            selectedRecordID = nil
        }
    }

    private func detailColumn(for section: SidebarSection) -> some View {
        GeometryReader { _ in
            Group {
                if section == .overview {
                    DashboardView(
                        records: displayRecords.prefix(4).map { $0 },
                        onDelete: { record in
                            Task { await deleteRecord(record) }
                        }
                    )
                        .transition(.opacity)
                } else if section == .records, let expandedRecord {
                    RecordExpandedPage(
                        record: expandedRecord,
                        onBack: returnToRecordsList
                    )
                    .transition(.opacity)
                } else if section == .records {
                    RecordsPage(
                        records: filteredRecords,
                        hasAnyRecords: !displayRecords.isEmpty,
                        selectedRecordID: $selectedRecordID,
                        selectedFilter: $selectedFilter,
                        selectedRecord: selectedRecord,
                        isLoading: isLoading,
                        errorMessage: errorMessage,
                        isImportingDroppedFiles: isImportingDroppedFiles,
                        onRetry: { Task { await loadRecords(showLoading: true) } },
                        onPreview: { record in
                            withAnimation(.smooth(duration: 0.22)) {
                                expandedRecordID = record.id
                            }
                        },
                        onDelete: { record in
                            Task { await deleteRecord(record) }
                        },
                        onDismissPreview: {
                            withAnimation(.smooth(duration: 0.18)) {
                                selectedRecordID = nil
                            }
                        },
                        onDropFiles: { fileURLs in
                            Task {
                                await importDroppedFiles(fileURLs)
                            }
                        }
                    )
                    .transition(.opacity)
                } else {
                    PlaceholderPage(section: section)
                }
            }
            .navigationTitle(section == .records && expandedRecord != nil ? "" : section.rawValue)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(NomiColor.content)
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button {
                        withAnimation(.smooth(duration: 0.22)) {
                            showingAddOverlay.toggle()
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("添加记录")
                    .help("添加记录")
                    .accessibilityIdentifier("mac-add-button")
                }
            }
        }
    }

    @MainActor
    private func loadRecords(showLoading: Bool = false) async {
        if showLoading {
            isLoading = true
        }
        errorMessage = nil

        do {
            records = try await RecordsClient.loadRecords()
            if let selectedRecordID, !records.contains(where: { $0.id == selectedRecordID }) {
                self.selectedRecordID = nil
            }
            if let expandedRecordID, !records.contains(where: { $0.id == expandedRecordID }) {
                self.expandedRecordID = nil
            }
        } catch {
            errorMessage = "无法连接 \(NomiAPI.baseURL.absoluteString)"
        }

        if showLoading {
            isLoading = false
        }
    }

    @MainActor
    private func runRecordsSyncLoop() async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: Self.recordsSyncInterval)
            } catch {
                return
            }

            guard isRecordsBackedSectionVisible else { continue }
            await loadRecords(showLoading: false)
        }
    }

    @MainActor
    private func deleteRecord(_ record: NomiRecord) async {
        do {
            try await RecordsClient.deleteRecord(id: record.id)
            records.removeAll { $0.id == record.id }
            if selectedRecordID == record.id {
                selectedRecordID = nil
            }
            if expandedRecordID == record.id {
                expandedRecordID = nil
            }
        } catch {
            errorMessage = "删除记录失败，请稍后重试。"
        }
    }

    @MainActor
    private func importDroppedFiles(_ fileURLs: [URL]) async {
        guard !fileURLs.isEmpty, !isImportingDroppedFiles else { return }

        isImportingDroppedFiles = true
        errorMessage = nil

        var failedCount = 0
        for fileURL in fileURLs {
            do {
                _ = try await RecordsClient.extractImage(fileURL: fileURL)
            } catch {
                failedCount += 1
            }
        }

        await loadRecords(showLoading: false)

        if failedCount > 0 {
            errorMessage = failedCount == fileURLs.count
                ? "文件分析失败，请确认 Nomi server 和 SeedX 正在运行。"
                : "部分文件分析失败，请稍后重试。"
        }

        isImportingDroppedFiles = false
    }
}

private struct NativeSidebarView: View {
    let selectedSection: SidebarSection
    let onSelectSection: (SidebarSection) -> Void

    private var selection: Binding<SidebarSection?> {
        Binding(
            get: { selectedSection },
            set: { section in
                guard let section else { return }
                onSelectSection(section)
            }
        )
    }

    var body: some View {
        List(selection: selection) {
            Section {
                ForEach(SidebarSection.allCases) { section in
                    Label(section.rawValue, systemImage: section.symbolName)
                        .tag(section)
                        .accessibilityIdentifier("mac-sidebar-\(section.rawValue)")
                }
            }
        }
        .listStyle(.sidebar)
        .frame(minWidth: 150)
        .accessibilityIdentifier("mac-native-sidebar")
    }
}

private struct DashboardView: View {
    let records: [NomiRecord]
    let onDelete: (NomiRecord) -> Void

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("早上好，Leo")
                            .font(NomiType.title)
                            .foregroundStyle(NomiColor.ink)
                        Text("这是你健康旅程的第 128 天")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: 0xa0a0a0))
                    }
                    .padding(.top, 18)

                    metricsRow(width: proxy.size.width)

                    HStack(alignment: .top, spacing: 16) {
                        RecentRecordsCard(records: records, onDelete: onDelete)
                            .frame(minWidth: 360, maxWidth: .infinity, minHeight: 382)
                        VStack(spacing: 16) {
                            InsightCard()
                                .frame(minHeight: 280)
                            DataSourcesCard()
                                .frame(minHeight: 90)
                        }
                        .frame(minWidth: 330, maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
        }
        .accessibilityIdentifier("mac-dashboard-page")
    }

    @ViewBuilder
    private func metricsRow(width: CGFloat) -> some View {
        if width < 760 {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                metricCards
            }
        } else {
            let contentWidth = max(640, width - 48)
            let spacing: CGFloat = 12
            let usableWidth = contentWidth - spacing * 4
            let healthWidth = usableWidth * 0.19
            let metricWidth = usableWidth * 0.155
            let suggestionWidth = usableWidth - healthWidth - metricWidth * 3

            HStack(spacing: spacing) {
                MetricCard(title: "健康评分", value: "82", unit: "/100", points: [0.32, 0.28, 0.36, 0.52, 0.48, 0.74, 0.42, 0.68])
                    .frame(width: healthWidth, height: 146)
                MetricCard(title: "步数", value: "8,620", unit: "/10,000 步", points: [0.64, 0.40, 0.55, 0.42, 0.68, 0.37, 0.50, 0.30])
                    .frame(width: metricWidth, height: 146)
                MetricCard(title: "活动", value: "420", unit: "/500 千卡", points: [0.75, 0.50, 0.63, 0.46, 0.61, 0.48, 0.56, 0.34])
                    .frame(width: metricWidth, height: 146)
                MetricCard(title: "睡眠", value: "7.2", unit: "小时", points: [0.72, 0.70, 0.62, 0.48, 0.30, 0.36, 0.28, 0.34])
                    .frame(width: metricWidth, height: 146)
                SuggestionCard()
                    .frame(width: suggestionWidth, height: 146)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var metricCards: some View {
        MetricCard(title: "健康评分", value: "82", unit: "/100", points: [0.32, 0.28, 0.36, 0.52, 0.48, 0.74, 0.42, 0.68])
            .frame(minHeight: 146)
        MetricCard(title: "步数", value: "8,620", unit: "/10,000 步", points: [0.64, 0.40, 0.55, 0.42, 0.68, 0.37, 0.50, 0.30])
            .frame(minHeight: 146)
        MetricCard(title: "活动", value: "420", unit: "/500 千卡", points: [0.75, 0.50, 0.63, 0.46, 0.61, 0.48, 0.56, 0.34])
            .frame(minHeight: 146)
        MetricCard(title: "睡眠", value: "7.2", unit: "小时", points: [0.72, 0.70, 0.62, 0.48, 0.30, 0.36, 0.28, 0.34])
            .frame(minHeight: 146)
        SuggestionCard()
            .frame(minHeight: 146)
    }

}

private struct MetricCard: View {
    let title: String
    let value: String
    let unit: String
    let points: [Double]

    var body: some View {
        CardSurface(radius: 13) {
            VStack(alignment: .leading, spacing: 13) {
                Text(title)
                    .font(NomiType.cardTitle)
                    .foregroundStyle(Color(hex: 0x262626))

                if unit == "/100" {
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        valueText
                        unitText
                    }
                } else {
                    VStack(alignment: .leading, spacing: 1) {
                        valueText
                        unitText
                    }
                }

                Spacer(minLength: 0)

                Sparkline(points: points)
                    .stroke(Color(hex: 0x9c9c9c), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                    .frame(height: 32)
                    .shadow(color: .black.opacity(0.12), radius: 2, y: 2)
            }
            .padding(16)
        }
    }

    private var valueText: some View {
        Text(value)
            .font(NomiType.value)
            .foregroundStyle(Color.black)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
            .allowsTightening(true)
            .layoutPriority(1)
    }

    private var unitText: some View {
        Text(unit)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Color(hex: 0x6e6e6e))
            .lineLimit(1)
            .minimumScaleFactor(0.55)
            .allowsTightening(true)
    }
}

private struct SuggestionCard: View {
    var body: some View {
        CardSurface(radius: 13) {
            VStack(alignment: .leading, spacing: 12) {
                Text("今日建议")
                    .font(NomiType.cardTitle)
                    .foregroundStyle(Color(hex: 0x292929))
                Text("你的睡眠时间比平时晚了 30 分钟，\n建议今晚 11:00 前入睡。")
                    .font(.system(size: 12, weight: .semibold))
                    .lineSpacing(3)
                    .foregroundStyle(NomiColor.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Button {
                } label: {
                    HStack {
                        Text("查看详情")
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color(hex: 0x2f2f2f))
                    .padding(.horizontal, 15)
                    .frame(height: 32)
                    .background(NomiColor.softFill, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
    }
}

private struct RecentRecordsCard: View {
    let records: [NomiRecord]
    let onDelete: (NomiRecord) -> Void

    var body: some View {
        CardSurface(radius: 13) {
            VStack(alignment: .leading, spacing: 12) {
                Text("最近记录")
                    .font(NomiType.section)
                    .foregroundStyle(Color(hex: 0x222222))

                HStack(spacing: 18) {
                    ForEach(["全部", "饮食", "健身", "体检", "文本", "语音"], id: \.self) { label in
                        Text(label)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(label == "全部" ? NomiColor.ink : Color(hex: 0x7c7c7c))
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                            .padding(.horizontal, label == "全部" ? 12 : 0)
                            .frame(height: 24)
                            .background {
                                if label == "全部" {
                                    Capsule()
                                        .fill(Color.white)
                                        .shadow(color: .black.opacity(0.07), radius: 8, y: 4)
                                }
                            }
                    }
                }

                VStack(spacing: 0) {
                    ForEach(records.prefix(4)) { record in
                        CompactRecordRow(record: record, onDelete: { onDelete(record) })
                        if record.id != records.prefix(4).last?.id {
                            Divider().overlay(NomiColor.hairline)
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct CompactRecordRow: View {
    let record: NomiRecord
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 18) {
            RecordThumb(visual: record.visual)
                .frame(width: 63, height: 50)
            VStack(alignment: .leading, spacing: 4) {
                Text(record.dayGroup == "今天" ? "今天 \(record.time)" : "\(record.dayGroup) \(record.time)")
                    .font(NomiType.body)
                    .foregroundStyle(Color(hex: 0x9a9a9a))
                Text(record.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(hex: 0x222222))
                Text(record.summary)
                    .font(NomiType.body)
                    .foregroundStyle(Color(hex: 0x7a7a7a))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            RecordActionsMenu(onDelete: onDelete)
        }
        .frame(height: 74)
    }
}

private struct InsightCard: View {
    var body: some View {
        CardSurface(radius: 13) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("AI 洞察")
                        .font(NomiType.section)
                    Spacer()
                    Text("查看全部")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color(hex: 0xb3b3b3))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: 0xb3b3b3))
                }

                Text("你的健康趋势良好")
                    .font(.system(size: 21, weight: .bold))
                    .padding(.top, 10)
                Text("过去 7 天，你的活动量和睡眠质量都有提升，\n继续保持均衡饮食，注意多摄入蛋白质。")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NomiColor.muted)
                    .lineSpacing(3)

                ChartSketch()
                    .frame(height: 105)
                    .padding(.top, 4)

                HStack(spacing: 8) {
                    ForEach(["活动", "睡眠", "饮食", "压力"], id: \.self) { label in
                        Text(label)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Color(hex: 0x6d6d6d))
                            .frame(width: 46, height: 20)
                            .background(Color(hex: 0xefefed), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct ChartSketch: View {
    var body: some View {
        ZStack {
            VStack(spacing: 31) {
                ForEach(0..<3, id: \.self) { _ in
                    Rectangle()
                        .fill(Color(hex: 0xe5e5e3))
                        .frame(height: 1)
                }
            }
            Sparkline(points: [0.54, 0.62, 0.50, 0.48, 0.38, 0.50, 0.35])
                .stroke(Color(hex: 0x9b9b9b), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                .padding(.horizontal, 26)
                .padding(.vertical, 20)
        }
    }
}

private struct DataSourcesCard: View {
    var body: some View {
        CardSurface(radius: 13) {
            VStack(alignment: .leading, spacing: 13) {
                Text("数据来源")
                    .font(NomiType.section)
                HStack(spacing: 40) {
                    DataSourceItem(symbol: "applewatch", title: "Apple Watch", subtitle: "同步于 9:30")
                    DataSourceItem(symbol: "heart.fill", title: "健康", subtitle: "同步于 9:30")
                }
            }
            .padding(16)
        }
    }
}

private struct DataSourceItem: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 30, height: 30)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .shadow(color: .black.opacity(0.05), radius: 8, y: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 12, weight: .bold))
                Text(subtitle).font(.system(size: 10, weight: .semibold)).foregroundStyle(Color(hex: 0xa5a5a5))
            }
        }
    }
}

private struct RecordsPage: View {
    let records: [NomiRecord]
    let hasAnyRecords: Bool
    @Binding var selectedRecordID: String?
    @Binding var selectedFilter: RecordFilter
    let selectedRecord: NomiRecord?
    let isLoading: Bool
    let errorMessage: String?
    let isImportingDroppedFiles: Bool
    let onRetry: () -> Void
    let onPreview: (NomiRecord) -> Void
    let onDelete: (NomiRecord) -> Void
    let onDismissPreview: () -> Void
    let onDropFiles: ([URL]) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 18) {
                content
            }
            .frame(minWidth: 500, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background {
                Color.black.opacity(0.001)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if selectedRecord != nil {
                            onDismissPreview()
                        }
                    }
                }

            if let selectedRecord {
                DetailPanel(
                    record: selectedRecord,
                    onCollapse: { selectedRecordID = nil },
                    onPreview: { onPreview(selectedRecord) }
                )
                    .frame(width: 280)
                    .padding(.top, 4)
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, hasAnyRecords || errorMessage != nil ? 28 : 0)
        .padding(.bottom, hasAnyRecords || errorMessage != nil ? 0 : 42)
        .accessibilityIdentifier("mac-records-page")
    }

    @ViewBuilder
    private var content: some View {
        if let errorMessage, records.isEmpty {
            ServerStatePanel(message: errorMessage, action: onRetry)
        } else if isLoading {
            ProgressView()
                .controlSize(.small)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("mac-records-loading")
        } else if !hasAnyRecords {
            EmptyRecordsView(
                isImporting: isImportingDroppedFiles,
                onDropFiles: onDropFiles
            )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            FilterPills(selectedFilter: $selectedFilter)

            ScrollView(.vertical, showsIndicators: false) {
                if records.isEmpty {
                    EmptyFilteredRecordsView()
                        .frame(maxWidth: .infinity, minHeight: 220, alignment: .center)
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(groupedRecords, id: \.key) { group in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(group.key)
                                    .font(NomiType.section)
                                    .foregroundStyle(NomiColor.ink)
                                Text(group.value.first?.dateLabel ?? "")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(Color(hex: 0x777777))
                            }
                            .padding(.top, group.key == groupedRecords.first?.key ? 10 : 24)
                            .padding(.bottom, 10)

                            ForEach(group.value) { record in
                                FullRecordRow(
                                    record: record,
                                    isSelected: record.id == selectedRecordID,
                                    action: { selectedRecordID = record.id },
                                    onDelete: { onDelete(record) }
                                )
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
        }
    }

    private var groupedRecords: [(key: String, value: [NomiRecord])] {
        let groups = Dictionary(grouping: records, by: \.dayGroup)
        let order = ["今天", "昨天", "更早"]
        return order.compactMap { day in
            guard let value = groups[day], !value.isEmpty else { return nil }
            return (day, value)
        }
    }
}

private struct EmptyRecordsView: View {
    let isImporting: Bool
    let onDropFiles: ([URL]) -> Void

    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 12) {
            if isImporting {
                ProgressView()
                    .controlSize(.regular)
            } else {
                Image(systemName: isDropTargeted ? "tray.and.arrow.down.fill" : "tray")
                    .font(.system(size: 42, weight: .medium))
                    .foregroundStyle(Color(hex: 0x8f8f8f))
            }
            Text(isImporting ? "正在导入文件" : "暂无数据")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(NomiColor.ink)
            Text(isImporting ? "正在分析" : "拖入图片或 PDF")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color(hex: 0x8b8b8b))
                .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .contentShape(Rectangle())
        .background {
            if isDropTargeted {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.55))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(Color(hex: 0xc7c7c2), style: StrokeStyle(lineWidth: 1.5, dash: [5, 5]))
                    }
                    .padding(34)
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            guard !isImporting else { return false }

            Task {
                let fileURLs = await loadDroppedFileURLs(from: providers)
                guard !fileURLs.isEmpty else { return }
                await MainActor.run {
                    onDropFiles(fileURLs)
                }
            }

            return true
        }
        .accessibilityIdentifier("mac-records-empty")
    }
}

private func loadDroppedFileURLs(from providers: [NSItemProvider]) async -> [URL] {
    var fileURLs: [URL] = []

    for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
        if let fileURL = await loadDroppedFileURL(from: provider) {
            fileURLs.append(fileURL)
        }
    }

    return fileURLs
}

private func loadDroppedFileURL(from provider: NSItemProvider) async -> URL? {
    await withCheckedContinuation { (continuation: CheckedContinuation<URL?, Never>) in
        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
            if let data = item as? Data,
               let fileURL = URL(dataRepresentation: data, relativeTo: nil) {
                continuation.resume(returning: fileURL)
                return
            }

            if let fileURL = item as? URL {
                continuation.resume(returning: fileURL)
                return
            }

            continuation.resume(returning: nil)
        }
    }
}

private struct EmptyFilteredRecordsView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(Color(hex: 0xa0a0a0))
            Text("这个分类还没有记录")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NomiColor.secondaryInk)
        }
        .accessibilityIdentifier("mac-records-filter-empty")
    }
}

private struct FilterPills: View {
    @Binding var selectedFilter: RecordFilter

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(RecordFilter.allCases) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        Text(filter.rawValue)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(filter == selectedFilter ? Color.white : Color(hex: 0x333333))
                            .frame(width: 56, height: 30)
                            .background(filter == selectedFilter ? NomiColor.ink : Color(hex: 0xf1f1f1), in: Capsule())
                            .shadow(color: filter == selectedFilter ? .black.opacity(0.16) : .clear, radius: 9, y: 4)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct FullRecordRow: View {
    let record: NomiRecord
    let isSelected: Bool
    let action: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 22) {
            Text(record.time)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color(hex: 0x333333))
                .frame(width: 42, alignment: .trailing)

            RecordThumb(visual: record.visual)
                .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 5) {
                Text(record.title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(hex: 0x222222))
                    .lineLimit(1)
                Text(record.summary)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x777777))
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            RecordStatusBadge(status: record.status)

            TagPill(record.tag)

            RecordActionsMenu(onDelete: onDelete)
        }
        .padding(.horizontal, 12)
        .frame(height: 75)
        .contentShape(Rectangle())
        .background {
            if isSelected {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white)
                    .shadow(color: .black.opacity(0.05), radius: 12, y: 5)
            } else {
                VStack {
                    Spacer()
                    Rectangle()
                        .fill(NomiColor.hairline)
                        .frame(height: 1)
                }
            }
        }
        .onTapGesture(perform: action)
        .accessibilityIdentifier("mac-record-row")
    }
}

private struct RecordActionsMenu: View {
    let onDelete: () -> Void

    var body: some View {
        Menu {
            Button(role: .destructive, action: onDelete) {
                Label("删除", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color(hex: 0x555555))
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("更多")
        .accessibilityIdentifier("mac-record-actions-menu")
    }
}

private struct RecordStatusBadge: View {
    let status: String

    var body: some View {
        if status != "completed" {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(foreground)
                .padding(.horizontal, 8)
                .frame(height: 20)
                .background(background, in: Capsule())
                .accessibilityIdentifier("mac-record-status-\(status)")
        }
    }

    private var label: String {
        switch status {
        case "pending": "等待识别"
        case "processing": "识别中"
        case "failed": "识别失败"
        default: status
        }
    }

    private var foreground: Color {
        status == "failed" ? Color(hex: 0x8f2f2f) : Color(hex: 0x555555)
    }

    private var background: Color {
        status == "failed" ? Color(hex: 0xffeeee) : Color(hex: 0xf1f1f1)
    }
}

private struct DetailPanel: View {
    let record: NomiRecord
    let onCollapse: () -> Void
    let onPreview: () -> Void

    var body: some View {
        CardSurface(radius: 13) {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    ZStack(alignment: .topTrailing) {
                        RecordThumb(visual: record.visual)
                            .frame(maxWidth: .infinity)
                            .frame(height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                        HStack(spacing: 6) {
                            DetailPanelIconButton(
                                symbol: "chevron.right",
                                accessibilityLabel: "收起预览",
                                help: "收起预览",
                                action: onCollapse
                            )
                            DetailPanelIconButton(
                                symbol: "arrow.up.left.and.arrow.down.right",
                                accessibilityLabel: "放大预览",
                                help: "放大预览",
                                action: onPreview
                            )
                        }
                        .padding(8)
                    }

                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(record.title)
                                .font(.system(size: 18, weight: .bold))
                            Text("\(record.dayGroup) \(record.time)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color(hex: 0x8f8f8f))
                        }
                        Spacer()
                        RecordStatusBadge(status: record.status)
                        TagPill(record.tag)
                    }

                    Divider()

                    VStack(alignment: .leading, spacing: 10) {
                        Text("描述")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color(hex: 0x333333))
                        Text(record.summary)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x777777))
                    }

                    if record.status == "completed" {
                        NutritionCard(record: record)
                    } else {
                        RecordAnalysisStateCard(status: record.status)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("备注")
                            .font(.system(size: 12, weight: .bold))
                        TextField("添加备注...", text: .constant(""))
                            .textFieldStyle(.plain)
                            .font(.system(size: 11, weight: .medium))
                            .padding(.horizontal, 12)
                            .frame(height: 40)
                            .background(Color(hex: 0xfbfbfa), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Color(hex: 0xefefef), lineWidth: 1)
                            }
                    }
                }
                .padding(16)
            }
        }
    }
}

private struct DetailPanelIconButton: View {
    let symbol: String
    let accessibilityLabel: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color(hex: 0x333333))
                .frame(width: 26, height: 26)
                .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Color.black.opacity(0.06), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .help(help)
        .accessibilityIdentifier("mac-detail-panel-\(symbol)-button")
    }
}

private struct NutritionCard: View {
    let record: NomiRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 5) {
                Text("营养识别")
                    .font(.system(size: 12, weight: .bold))
                Text("(AI)")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x909090))
            }
            HStack {
                NutritionItem(title: "热量", value: record.calories)
                NutritionItem(title: "蛋白质", value: record.protein)
                NutritionItem(title: "碳水", value: record.carbs)
                NutritionItem(title: "脂肪", value: record.fat)
            }
        }
        .padding(12)
        .background(Color(hex: 0xf7f7f6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .shadow(color: .black.opacity(0.03), radius: 9, y: 4)
    }
}

private struct RecordAnalysisStateCard: View {
    let status: String

    var body: some View {
        HStack(spacing: 10) {
            if status == "failed" {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 14, weight: .semibold))
            } else {
                ProgressView()
                    .controlSize(.small)
            }
            Text(message)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color(hex: 0x555555))
            Spacer()
        }
        .padding(12)
        .background(Color(hex: 0xf7f7f6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityIdentifier("mac-record-analysis-state")
    }

    private var message: String {
        switch status {
        case "pending": "已上传，等待 SeedX 识别"
        case "processing": "SeedX 正在识别图片"
        case "failed": "识别失败，没有写入营养估算"
        default: "等待记录更新"
        }
    }
}

private struct NutritionItem: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Color(hex: 0x888888))
            Text(value)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color(hex: 0x222222))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct AddRecordOverlay: View {
    @Binding var isPresented: Bool
    let onExtractImage: (URL) async throws -> Void
    let onSave: (CreateRecordDraft) async throws -> Void

    @State private var draft = CreateRecordDraft()
    @State private var isSaving = false
    @State private var isImportingImage = false
    @State private var isCloseHovering = false
    @State private var isUploadHovering = false
    @State private var isUploadDropTargeted = false
    @State private var errorMessage: String?

    private var isUploadActive: Bool {
        isUploadHovering || isUploadDropTargeted
    }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(Color.black.opacity(0.001))
                .ignoresSafeArea()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .onTapGesture(perform: dismissIfAllowed)

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("添加记录")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(NomiColor.ink)
                    Spacer()
                    Button {
                        dismissIfAllowed()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(isCloseHovering ? Color(hex: 0x333333) : Color(hex: 0x8a8a8a))
                            .frame(width: 30, height: 30)
                            .background(
                                isCloseHovering ? Color.black.opacity(0.055) : Color.clear,
                                in: Circle()
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                    .contentShape(Circle())
                    .nomiCursor(.pointingHand)
                    .onHover { hovering in
                        withAnimation(.smooth(duration: 0.12)) {
                            isCloseHovering = hovering
                        }
                    }
                }

                Button {
                    isImportingImage = true
                } label: {
                    VStack(spacing: 12) {
                        Image(systemName: "photo")
                            .font(.system(size: 36, weight: .regular))
                            .foregroundStyle(isUploadActive ? Color(hex: 0x5f5f5f) : Color(hex: 0x7f7f7f))
                        Text(isSaving ? "正在分析文件..." : "拖拽图片或 PDF 到这里，或点击上传")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(isUploadActive ? Color(hex: 0x4d4d4d) : Color(hex: 0x626262))
                        Text("支持 JPG、PNG、HEIC、PDF")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color(hex: 0x8d8d8d))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 166)
                    .background(
                        (isUploadActive ? Color.white.opacity(0.9) : NomiColor.surface.opacity(0.66)),
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(
                                isUploadActive ? Color(hex: 0xc7c7c4) : NomiColor.hairline.opacity(0.82),
                                style: StrokeStyle(lineWidth: 1.2, dash: [4, 4])
                            )
                    }
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
                .nomiCursor(.pointingHand)
                .onHover { hovering in
                    withAnimation(.smooth(duration: 0.12)) {
                        isUploadHovering = hovering
                    }
                }
                .accessibilityIdentifier("mac-add-image-button")

                VStack(alignment: .leading, spacing: 0) {
                    NomiMultilineTextInput(text: $draft.summary, placeholder: "说些什么（可选）")
                        .padding(.horizontal, 14)
                        .padding(.top, 14)
                        .padding(.bottom, 4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                    Spacer(minLength: 8)

                    HStack(spacing: 20) {
                        Text("#")
                            .font(.system(size: 21, weight: .regular))
                            .foregroundStyle(Color(hex: 0x8b8b8b))
                        Image(systemName: "photo")
                        Divider().frame(height: 16)
                        Text("Aa")
                            .font(.system(size: 17, weight: .regular))
                        Image(systemName: "list.bullet")
                        Image(systemName: "mic.fill")

                        Spacer()

                        Button {
                            saveNote()
                        } label: {
                            if isSaving {
                                ProgressView()
                                    .controlSize(.small)
                                    .frame(width: 48, height: 36)
                            } else {
                                Image(systemName: "arrow.right")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundStyle(Color.white)
                                    .frame(width: 48, height: 36)
                            }
                        }
                        .buttonStyle(.plain)
                        .background(Color(hex: 0xd0d0d0), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .disabled(isSaving || draft.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("mac-add-save-button")
                    }
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Color(hex: 0x8b8b8b))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
                .frame(height: 126)
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .nomiCursor(.iBeam)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(NomiColor.hairline, lineWidth: 1)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(NomiType.caption)
                        .foregroundStyle(Color(hex: 0x777777))
                }
            }
            .padding(26)
            .frame(width: 522)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(NomiColor.overlayPanel)
                    .shadow(color: .black.opacity(0.07), radius: 24, y: 10)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.68), lineWidth: 1)
            }
            .fileImporter(
                isPresented: $isImportingImage,
                allowedContentTypes: [.image, .pdf],
                allowsMultipleSelection: false
            ) { result in
                handleFileImport(result)
            }
            .onDrop(of: [.fileURL], isTargeted: $isUploadDropTargeted) { providers in
                guard let provider = providers.first else { return false }
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    guard let data = item as? Data,
                          let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                    Task { @MainActor in
                        importFile(url)
                    }
                }
                return true
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .dismissOnEscape(isEnabled: !isSaving && !isImportingImage, perform: dismissIfAllowed)
        .accessibilityIdentifier("mac-add-overlay")
    }

    private func dismissIfAllowed() {
        guard !isSaving && !isImportingImage else { return }
        withAnimation(.smooth(duration: 0.18)) {
            isPresented = false
        }
    }

    private func saveNote() {
        isSaving = true
        errorMessage = nil
        draft.type = "note"
        draft.title = draft.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "文本记录" : "文本记录"

        Task {
            do {
                try await onSave(draft)
                await MainActor.run {
                    isPresented = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = "保存失败，请确认 Nomi server 正在运行。"
                    isSaving = false
                }
            }
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let fileURL = urls.first else { return }
            importFile(fileURL)
        case .failure:
            errorMessage = "无法打开这个文件。"
        }
    }

    private func importFile(_ fileURL: URL) {
        isSaving = true
        errorMessage = nil

        Task {
            do {
                try await onExtractImage(fileURL)
                await MainActor.run {
                    isPresented = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = "文件分析失败，请确认 Nomi server 和 SeedX 正在运行。"
                    isSaving = false
                }
            }
        }
    }
}

private struct EscapeDismissModifier: ViewModifier {
    let isEnabled: Bool
    let onDismiss: () -> Void

    @State private var keyMonitor: Any?

    func body(content: Content) -> some View {
        content
            .onAppear(perform: installIfNeeded)
            .onDisappear(perform: uninstall)
            .onChange(of: isEnabled) { _, enabled in
                if enabled {
                    installIfNeeded()
                } else {
                    uninstall()
                }
            }
            .onExitCommand {
                if isEnabled {
                    onDismiss()
                }
            }
    }

    private func installIfNeeded() {
        guard isEnabled else { return }

        if keyMonitor == nil {
            keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                if event.keyCode == 53 {
                    Task { @MainActor in
                        onDismiss()
                    }
                    return nil
                }
                return event
            }
        }
    }

    private func uninstall() {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
    }
}

private extension View {
    func dismissOnEscape(isEnabled: Bool, perform action: @escaping () -> Void) -> some View {
        modifier(EscapeDismissModifier(isEnabled: isEnabled, onDismiss: action))
    }
}

private struct RecordExpandedPage: View {
    let record: NomiRecord
    let onBack: () -> Void

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 18) {
                    RecordThumb(visual: record.visual)
                        .frame(maxWidth: .infinity)
                        .frame(height: 360)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text(record.title)
                                .font(.system(size: 28, weight: .bold))
                                .foregroundStyle(NomiColor.ink)
                            Text("\(record.dayGroup) \(record.time)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color(hex: 0x8c8c8c))
                            Text(record.summary)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(Color(hex: 0x444444))
                        }

                        Spacer()
                        RecordStatusBadge(status: record.status)
                        TagPill(record.tag)
                    }

                    if record.status == "completed" {
                        NutritionCard(record: record)
                    } else {
                        RecordAnalysisStateCard(status: record.status)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("备注")
                            .font(.system(size: 13, weight: .bold))
                        Text("添加备注...")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Color(hex: 0x555555))
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
                            .background(Color(hex: 0xfafafa), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Color(hex: 0xeeeeee), lineWidth: 1)
                        }
                    }
                }
                .frame(maxWidth: 860, alignment: .leading)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
        }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("返回记录")
                .help("返回记录")
                .accessibilityIdentifier("mac-record-back-button")
            }
        }
        .accessibilityIdentifier("mac-record-expanded-page")
    }
}

private struct PlaceholderPage: View {
    let section: SidebarSection

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(section.rawValue)
                .font(NomiType.title)
            Text("这个入口会在对应能力具备真实内容后继续补齐。")
                .font(NomiType.body)
                .foregroundStyle(NomiColor.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(32)
    }
}

private struct CardSurface<Content: View>: View {
    let radius: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        content
            .background(Color.white, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color(hex: 0xf0f0f0), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.05), radius: 15, y: 7)
    }
}

private struct RecordThumb: View {
    let visual: NomiRecord.Visual

    var body: some View {
        GeometryReader { proxy in
            thumbContent
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .shadow(color: .black.opacity(0.04), radius: 6, y: 3)
        }
    }

    @ViewBuilder
    private var thumbContent: some View {
        switch visual {
        case .image(let url):
            CachedRemoteImage(url: url) { image in
                image
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } loading: {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(hex: 0xf2f2f1))
            } failure: {
                imageFallback
            }
        case .symbol(let symbol, let background):
            ZStack {
                background
                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(symbol == "figure.run" ? Color(hex: 0x47e086) : Color(hex: 0x777777))
            }
        case .waveform:
            ZStack {
                ResourceImage(name: "audio", contentMode: .fill)
                    .opacity(0.95)
                HStack(alignment: .center, spacing: 3) {
                    ForEach(0..<20, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color(hex: 0xd6d6d6))
                            .frame(width: 2, height: CGFloat(8 + (index % 6) * 4))
                    }
                }
                .offset(x: 44)
            }
        }
    }

    private var imageFallback: some View {
        ZStack {
            Color(hex: 0xf2f2f1)
            Image(systemName: "photo")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Color(hex: 0x777777))
        }
    }
}

private struct ResourceImage: View {
    let name: String
    let contentMode: ContentMode

    var body: some View {
        if let image = NSImage(named: name) ?? NSImage(contentsOf: Bundle.module.url(forResource: name, withExtension: "png") ?? URL(fileURLWithPath: "")) {
            Image(nsImage: image)
                .resizable()
                .aspectRatio(contentMode: contentMode)
        } else {
            Rectangle()
                .fill(Color(hex: 0xf2f2f1))
                .overlay {
                    Image(systemName: "photo")
                        .foregroundStyle(Color(hex: 0x999999))
                }
        }
    }
}

private struct TagPill: View {
    let filter: RecordFilter

    init(_ filter: RecordFilter) {
        self.filter = filter
    }

    var body: some View {
        Text(filter.rawValue)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Color(hex: 0x777777))
            .frame(width: 41, height: 21)
            .background(Color(hex: 0xf3f3f3), in: Capsule())
    }
}

private struct ServerStatePanel: View {
    let message: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 14, weight: .semibold))
            Text(message)
                .font(NomiType.body)
                .foregroundStyle(NomiColor.secondaryInk)
                .lineLimit(1)
            Spacer()
            Button("重试", action: action)
        }
        .padding(12)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(NomiColor.hairline, lineWidth: 1)
        }
    }
}

private struct Sparkline: Shape {
    let points: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard points.count > 1 else { return path }

        let step = rect.width / CGFloat(points.count - 1)
        for index in points.indices {
            let x = rect.minX + CGFloat(index) * step
            let y = rect.minY + rect.height * CGFloat(points[index])
            if index == points.startIndex {
                path.move(to: CGPoint(x: x, y: y))
            } else {
                path.addLine(to: CGPoint(x: x, y: y))
            }
        }

        return path
    }
}

private extension NomiRecord {
    init(savedRecord: SavedRecord) {
        let tag = RecordFilter(category: savedRecord.category)
        self.init(
            id: savedRecord.id,
            time: savedRecord.displayTime,
            dayGroup: savedRecord.dayGroup,
            dateLabel: savedRecord.dateLabel,
            title: savedRecord.title.isEmpty ? "健康记录" : savedRecord.title,
            summary: savedRecord.detailLine.isEmpty ? savedRecord.summary : savedRecord.detailLine,
            tag: tag,
            visual: savedRecord.imageURL.map(NomiRecord.Visual.image) ?? .symbol(savedRecord.symbolName, Color(hex: 0xf2f2f1)),
            status: savedRecord.status,
            calories: savedRecord.metadata["calories_kcal"].map { "\($0) 千卡" } ?? "-",
            protein: savedRecord.metadata["protein_g"].map { "\($0) g" } ?? "-",
            carbs: savedRecord.metadata["carbs_g"].map { "\($0) g" } ?? "-",
            fat: savedRecord.metadata["fat_g"].map { "\($0) g" } ?? "-"
        )
    }
}

private extension RecordFilter {
    init(category: String) {
        switch category {
        case "food", "beverage", "caffeine", "alcohol":
            self = .food
        case "exercise":
            self = .fitness
        case "body_stats":
            self = .checkup
        case "document", "information":
            self = .file
        case "audio":
            self = .audio
        default:
            self = .text
        }
    }
}

private extension SavedRecord {
    var imageURL: URL? {
        guard let imageURI, !imageURI.isEmpty else { return nil }
        if imageURI.hasPrefix("local://images/") {
            let relativePath = String(imageURI.dropFirst("local://images/".count))
            let base = NomiAPI.baseURL.absoluteString.hasSuffix("/")
                ? String(NomiAPI.baseURL.absoluteString.dropLast())
                : NomiAPI.baseURL.absoluteString
            return URL(string: base + "/images/" + relativePath)
        }
        return URL(string: imageURI)
    }

    var dayGroup: String {
        guard let date = parsedDate else { return "更早" }
        if Calendar.current.isDateInToday(date) {
            return "今天"
        }
        if Calendar.current.isDateInYesterday(date) {
            return "昨天"
        }
        return "更早"
    }

    var dateLabel: String {
        guard let date = parsedDate else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_Hans")
        formatter.dateFormat = "M月d日"
        return formatter.string(from: date)
    }

    var parsedDate: Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: occurredAt) {
            return date
        }

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: occurredAt)
    }
}

private extension Color {
    init(hex: UInt, alpha: Double = 1) {
        let red = Double((hex >> 16) & 0xff) / 255
        let green = Double((hex >> 8) & 0xff) / 255
        let blue = Double(hex & 0xff) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}
