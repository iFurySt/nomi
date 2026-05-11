import AppKit
import SwiftUI
import UniformTypeIdentifiers

private enum NomiMacType {
    static let breadcrumb = Font.system(size: 14, weight: .bold, design: .default)
    static let title = Font.system(size: 23, weight: .bold, design: .default)
    static let section = Font.system(size: 18, weight: .bold, design: .default)
    static let cardTitle = Font.system(size: 13, weight: .bold, design: .default)
    static let body = Font.system(size: 12, weight: .semibold, design: .default)
    static let bodyRegular = Font.system(size: 12, weight: .regular, design: .default)
    static let caption = Font.system(size: 10, weight: .semibold, design: .default)
    static let value = Font.system(size: 25, weight: .regular, design: .default)
}

private enum NomiMacColor {
    static let appBackground = Color(hex: 0xf7f7f6)
    static let sidebar = Color(hex: 0xf1f1ef)
    static let content = Color(hex: 0xfafaf8)
    static let surface = Color.white
    static let ink = Color(hex: 0x111111)
    static let secondaryInk = Color(hex: 0x666a70)
    static let muted = Color(hex: 0x8a8a8a)
    static let hairline = Color(hex: 0xeeeeed)
    static let softFill = Color(hex: 0xf3f3f2)
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
        case image(String)
        case symbol(String, Color)
        case waveform
    }

    let id: String
    let time: String
    let dayGroup: String
    let dateLabel: String
    let title: String
    let summary: String
    let source: String?
    let tag: RecordFilter
    let visual: Visual
    let calories: String
    let protein: String
    let carbs: String
    let fat: String
}

struct ContentView: View {
    @State private var preferredColumn: NavigationSplitViewColumn = .detail
    @State private var records: [SavedRecord] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedFilter: RecordFilter = .all
    @State private var selectedRecordID = "breakfast"
    @State private var searchText = ""
    @State private var isSearchPresented = false
    @State private var showingAddOverlay = false
    @State private var previewRecord: NomiRecord?

    private var displayRecords: [NomiRecord] {
        let serverRows = records.map(NomiRecord.init(savedRecord:))
        return serverRows + NomiRecord.figmaFixtures
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

    private var selectedRecord: NomiRecord {
        displayRecords.first { $0.id == selectedRecordID } ?? displayRecords.first ?? NomiRecord.figmaFixtures[0]
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

            if let previewRecord {
                ImagePreviewOverlay(record: previewRecord) {
                    withAnimation(.smooth(duration: 0.22)) {
                        self.previewRecord = nil
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                .zIndex(20)
            }
        }
        .tint(.primary)
        .background(NomiMacColor.appBackground)
        .task {
            await loadRecords()
        }
        .accessibilityIdentifier("mac-health-record-app")
    }

    private var appShell: some View {
        NavigationSplitView(preferredCompactColumn: $preferredColumn) {
            NativeSidebarView()
                .frame(minWidth: 220)
                .navigationDestination(for: SidebarSection.self) { section in
                    NavigationStack {
                        detailColumn(for: section)
                    }
                }
        } detail: {
            NavigationStack {
                detailColumn(for: .overview)
            }
        }
        .navigationSplitViewStyle(.balanced)
        .toolbar {
            if #available(macOS 26.0, *) {
                ToolbarSpacer(.flexible)
            }

            ToolbarItem {
                ExpandableToolbarSearch(
                    text: $searchText,
                    isExpanded: $isSearchPresented
                )
                .accessibilityIdentifier("mac-search-button")
            }

            ToolbarItem {
                Spacer(minLength: 22)
                    .frame(width: 22, height: 1)
                    .accessibilityHidden(true)
            }

            ToolbarItem {
                Button("添加记录", systemImage: "plus") {
                    withAnimation(.smooth(duration: 0.22)) {
                        showingAddOverlay.toggle()
                    }
                }
                .labelStyle(.iconOnly)
                .nativeToolbarIconButton()
                .help("添加记录")
                .accessibilityIdentifier("mac-add-button")
            }
        }
    }

    private func detailColumn(for section: SidebarSection) -> some View {
        GeometryReader { _ in
            Group {
                if section == .overview {
                    DashboardView(records: displayRecords.prefix(4).map { $0 })
                        .transition(.opacity)
                } else if section == .records {
                    RecordsPage(
                        records: filteredRecords,
                        selectedRecordID: $selectedRecordID,
                        selectedFilter: $selectedFilter,
                        selectedRecord: selectedRecord,
                        isLoading: isLoading,
                        errorMessage: errorMessage,
                        onRetry: { Task { await loadRecords() } },
                        onPreview: { record in
                            withAnimation(.smooth(duration: 0.22)) {
                                previewRecord = record
                            }
                        }
                    )
                    .transition(.opacity)
                } else {
                    PlaceholderPage(section: section)
                }
            }
            .navigationTitle(section.rawValue)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(NomiMacColor.content)
        }
    }

    @MainActor
    private func loadRecords() async {
        isLoading = true
        errorMessage = nil

        do {
            records = try await RecordsClient.loadRecords()
            if let first = records.first {
                selectedRecordID = first.id
            }
        } catch {
            errorMessage = "无法连接 \(NomiAPI.baseURL.absoluteString)"
        }

        isLoading = false
    }
}

private struct ExpandableToolbarSearch: View {
    @Binding var text: String
    @Binding var isExpanded: Bool
    @State private var showsExpandedControls = false
    @State private var showsCollapsedButton = true
    @State private var pendingCollapse: DispatchWorkItem?
    @State private var pendingReveal: DispatchWorkItem?

    var body: some View {
        ZStack(alignment: .trailing) {
            if isExpanded {
                if showsExpandedControls {
                    HStack(spacing: 8) {
                        NativeToolbarSearchField(text: $text)
                            .frame(width: 286, height: 30)

                        Button("关闭搜索", systemImage: "xmark") {
                            collapse()
                        }
                        .labelStyle(.iconOnly)
                        .nativeToolbarIconButton()
                        .help("关闭搜索")
                    }
                    .frame(width: 330, height: 34, alignment: .trailing)
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .trailing)))
                }
            } else if showsCollapsedButton {
                Button("搜索", systemImage: "magnifyingglass") {
                    expand()
                }
                .labelStyle(.iconOnly)
                .nativeToolbarIconButton()
                .help("搜索")
                .transition(.opacity.combined(with: .scale(scale: 0.82, anchor: .trailing)))
            }
        }
        .frame(width: isExpanded ? 330 : 34, height: 34, alignment: .trailing)
        .clipped()
        .animation(.smooth(duration: 0.24), value: isExpanded)
    }

    private func expand() {
        pendingCollapse?.cancel()
        pendingReveal?.cancel()
        pendingCollapse = nil
        pendingReveal = nil

        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            showsCollapsedButton = false
        }

        withAnimation(.smooth(duration: 0.24)) {
            isExpanded = true
            showsExpandedControls = true
        }
    }

    private func collapse() {
        pendingCollapse?.cancel()
        pendingReveal?.cancel()

        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            showsExpandedControls = false
            showsCollapsedButton = false
        }

        let workItem = DispatchWorkItem {
            withAnimation(.smooth(duration: 0.2)) {
                isExpanded = false
            }
            pendingCollapse = nil

            let revealItem = DispatchWorkItem {
                showsCollapsedButton = true
                pendingReveal = nil
            }
            pendingReveal = revealItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22, execute: revealItem)
        }
        pendingCollapse = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.04, execute: workItem)
    }
}

private extension View {
    @ViewBuilder
    func nativeToolbarIconButton() -> some View {
        self
            .font(.system(size: 19, weight: .regular))
            .foregroundStyle(Color(nsColor: .labelColor))
            .frame(width: 32, height: 32)
            .contentShape(Circle())
            .buttonStyle(.plain)
    }
}

private struct NativeToolbarSearchField: NSViewRepresentable {
    @Binding var text: String

    func makeNSView(context: Context) -> NSSearchField {
        let searchField = NSSearchField()
        searchField.placeholderString = "搜索记录、数据、洞察..."
        searchField.delegate = context.coordinator
        searchField.sendsSearchStringImmediately = true
        searchField.focusRingType = .none
        DispatchQueue.main.async {
            searchField.window?.makeFirstResponder(searchField)
        }
        return searchField
    }

    func updateNSView(_ searchField: NSSearchField, context: Context) {
        if searchField.stringValue != text {
            searchField.stringValue = text
        }
        DispatchQueue.main.async {
            if searchField.window?.firstResponder !== searchField.currentEditor() {
                searchField.window?.makeFirstResponder(searchField)
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    final class Coordinator: NSObject, NSSearchFieldDelegate {
        @Binding private var text: String

        init(text: Binding<String>) {
            _text = text
        }

        func controlTextDidChange(_ notification: Notification) {
            guard let searchField = notification.object as? NSSearchField else { return }
            text = searchField.stringValue
        }
    }
}

private struct NativeSidebarView: View {
    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    ResourceImage(name: "avatar", contentMode: .fill)
                        .frame(width: 30, height: 30)
                        .clipShape(Circle())
                    Text("Leo")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                }
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
                .accessibilityIdentifier("mac-sidebar-profile")
            }

            Section {
                ForEach(SidebarSection.allCases) { section in
                    NavigationLink(value: section) {
                        Label(section.rawValue, systemImage: section.symbolName)
                            .font(.body.weight(.semibold))
                    }
                    .accessibilityIdentifier("mac-sidebar-\(section.rawValue)")
                }
            }

            Section {
                Label("设置", systemImage: "gearshape")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(.bar)
        .accessibilityIdentifier("mac-native-sidebar")
    }
}

private struct DashboardView: View {
    let records: [NomiRecord]

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("早上好，Leo")
                            .font(NomiMacType.title)
                            .foregroundStyle(NomiMacColor.ink)
                        Text("这是你健康旅程的第 128 天")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: 0xa0a0a0))
                    }
                    .padding(.top, 18)

                    metricsRow(width: proxy.size.width)

                    HStack(alignment: .top, spacing: 16) {
                        RecentRecordsCard(records: records)
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
                    .font(NomiMacType.cardTitle)
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
            .font(NomiMacType.value)
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
                    .font(NomiMacType.cardTitle)
                    .foregroundStyle(Color(hex: 0x292929))
                Text("你的睡眠时间比平时晚了 30 分钟，\n建议今晚 11:00 前入睡。")
                    .font(.system(size: 12, weight: .semibold))
                    .lineSpacing(3)
                    .foregroundStyle(NomiMacColor.muted)
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
                    .background(NomiMacColor.softFill, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
    }
}

private struct RecentRecordsCard: View {
    let records: [NomiRecord]

    var body: some View {
        CardSurface(radius: 13) {
            VStack(alignment: .leading, spacing: 12) {
                Text("最近记录")
                    .font(NomiMacType.section)
                    .foregroundStyle(Color(hex: 0x222222))

                HStack(spacing: 18) {
                    ForEach(["全部", "饮食", "健身", "体检", "文本", "语音"], id: \.self) { label in
                        Text(label)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(label == "全部" ? NomiMacColor.ink : Color(hex: 0x7c7c7c))
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
                        CompactRecordRow(record: record)
                        if record.id != records.prefix(4).last?.id {
                            Divider().overlay(NomiMacColor.hairline)
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

    var body: some View {
        HStack(spacing: 18) {
            RecordThumb(visual: record.visual)
                .frame(width: 63, height: 50)
            VStack(alignment: .leading, spacing: 4) {
                Text(record.dayGroup == "今天" ? "今天 \(record.time)" : "\(record.dayGroup) \(record.time)")
                    .font(NomiMacType.body)
                    .foregroundStyle(Color(hex: 0x9a9a9a))
                Text(record.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(hex: 0x222222))
                Text(record.summary)
                    .font(NomiMacType.body)
                    .foregroundStyle(Color(hex: 0x7a7a7a))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "ellipsis")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color(hex: 0x4f4f4f))
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
                        .font(NomiMacType.section)
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
                    .foregroundStyle(NomiMacColor.muted)
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
                    .font(NomiMacType.section)
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
    @Binding var selectedRecordID: String
    @Binding var selectedFilter: RecordFilter
    let selectedRecord: NomiRecord
    let isLoading: Bool
    let errorMessage: String?
    let onRetry: () -> Void
    let onPreview: (NomiRecord) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 18) {
                FilterPills(selectedFilter: $selectedFilter)

                if let errorMessage, records.isEmpty {
                    ServerStatePanel(message: errorMessage, action: onRetry)
                }

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityIdentifier("mac-records-loading")
                }

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(groupedRecords, id: \.key) { group in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(group.key)
                                    .font(NomiMacType.section)
                                    .foregroundStyle(NomiMacColor.ink)
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
                                    action: { selectedRecordID = record.id }
                                )
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
            .frame(minWidth: 500, maxWidth: .infinity, alignment: .topLeading)

            DetailPanel(record: selectedRecord, onPreview: { onPreview(selectedRecord) })
                .frame(width: 280)
                .padding(.top, 4)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .accessibilityIdentifier("mac-records-page")
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
                            .background(filter == selectedFilter ? NomiMacColor.ink : Color(hex: 0xf1f1f1), in: Capsule())
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

    var body: some View {
        Button(action: action) {
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

                if let source = record.source {
                    Text(source)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(Color(hex: 0x9a9a9a))
                        .lineLimit(1)
                }

                TagPill(record.tag)

                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(hex: 0x555555))
            }
            .padding(.horizontal, 12)
            .frame(height: 75)
            .background {
                if isSelected {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white)
                        .shadow(color: .black.opacity(0.05), radius: 12, y: 5)
                } else {
                    VStack {
                        Spacer()
                        Rectangle()
                            .fill(NomiMacColor.hairline)
                            .frame(height: 1)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("mac-record-row")
    }
}

private struct DetailPanel: View {
    let record: NomiRecord
    let onPreview: () -> Void

    var body: some View {
        CardSurface(radius: 13) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ZStack(alignment: .topTrailing) {
                        RecordThumb(visual: record.visual)
                            .frame(maxWidth: .infinity)
                            .frame(height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                        Button(action: onPreview) {
                            Image(systemName: "arrow.up.left.and.arrow.down.right")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color.white)
                                .frame(width: 24, height: 24)
                                .background(Color(hex: 0x6e6e6e).opacity(0.9), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .padding(8)
                        .help("放大预览")
                        .accessibilityIdentifier("mac-preview-image-button")
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

                    NutritionCard(record: record)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("相关数据")
                            .font(.system(size: 12, weight: .bold))
                        RelatedDataRow(symbol: "scalemass", title: "体重", subtitle: "今天 07:00")
                        RelatedDataRow(symbol: "moon.fill", title: "睡眠", subtitle: "7 小时 12 分钟\n昨晚")
                    }

                    Divider()

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

private struct RelatedDataRow: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                Text(subtitle)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x999999))
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Color(hex: 0x777777))
        }
        .padding(.horizontal, 12)
        .frame(height: 50)
        .background(Color(hex: 0xf8f8f7), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
}

private struct AddRecordOverlay: View {
    @Binding var isPresented: Bool
    let onExtractImage: (URL) async throws -> Void
    let onSave: (CreateRecordDraft) async throws -> Void

    @State private var draft = CreateRecordDraft()
    @State private var isSaving = false
    @State private var isImportingImage = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Rectangle()
                .fill(Color.black.opacity(0.001))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !isSaving else { return }
                    isPresented = false
                }

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("添加记录")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(NomiMacColor.ink)
                    Spacer()
                    Button {
                        isPresented = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x8a8a8a))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                }

                Button {
                    isImportingImage = true
                } label: {
                    VStack(spacing: 12) {
                        Image(systemName: "photo")
                            .font(.system(size: 38, weight: .regular))
                            .foregroundStyle(Color(hex: 0x999999))
                        Text(isSaving ? "正在分析图片..." : "拖拽图片到这里，或点击上传")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Color(hex: 0x7f7f7f))
                        Text("支持 JPG、PNG、HEIC")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color(hex: 0x9b9b9b))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 166)
                    .background(Color.white.opacity(0.24), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Color(hex: 0xd9d9d9), style: StrokeStyle(lineWidth: 1.2, dash: [4, 4]))
                    }
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
                .accessibilityIdentifier("mac-add-image-button")

                VStack(alignment: .leading, spacing: 0) {
                    TextField("说些什么（可选）", text: $draft.summary, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14, weight: .medium))
                        .lineLimit(4, reservesSpace: true)
                        .padding(.horizontal, 16)
                        .padding(.top, 14)

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
                .background(Color.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Color(hex: 0xe4e4e4), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.03), radius: 9, y: 4)

                if let errorMessage {
                    Text(errorMessage)
                        .font(NomiMacType.caption)
                        .foregroundStyle(Color(hex: 0x777777))
                }
            }
            .padding(26)
            .frame(width: 522)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(hex: 0xf0f0f0), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.09), radius: 27, y: 12)
            .fileImporter(
                isPresented: $isImportingImage,
                allowedContentTypes: [.image],
                allowsMultipleSelection: false
            ) { result in
                handleImageImport(result)
            }
            .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                guard let provider = providers.first else { return false }
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    guard let data = item as? Data,
                          let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                    Task { @MainActor in
                        importImage(url)
                    }
                }
                return true
            }
        }
        .accessibilityIdentifier("mac-add-overlay")
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

    private func handleImageImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let fileURL = urls.first else { return }
            importImage(fileURL)
        case .failure:
            errorMessage = "无法打开这张图片。"
        }
    }

    private func importImage(_ fileURL: URL) {
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
                    errorMessage = "图片分析失败，请确认 Nomi server 和 SeedX 正在运行。"
                    isSaving = false
                }
            }
        }
    }
}

private struct ImagePreviewOverlay: View {
    let record: NomiRecord
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.38)
                .background(.ultraThinMaterial)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(spacing: 0) {
                ZStack(alignment: .top) {
                    RecordThumb(visual: record.visual)
                        .frame(maxWidth: .infinity)
                        .frame(height: 315)
                        .clipped()

                    HStack {
                        PreviewIconButton(symbol: "xmark", action: onClose)
                        Spacer()
                        PreviewIconButton(symbol: "star", action: {})
                        PreviewIconButton(symbol: "ellipsis", action: {})
                    }
                    .padding(20)

                    HStack {
                        PreviewIconButton(symbol: "chevron.left", action: {})
                        Spacer()
                        PreviewIconButton(symbol: "chevron.right", action: {})
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 140)
                }

                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(spacing: 12) {
                                Text(record.title)
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundStyle(NomiMacColor.ink)
                                TagPill(record.tag)
                            }
                            Text("\(record.dayGroup) \(record.time)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Color(hex: 0x8c8c8c))
                            Text(record.summary)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(Color(hex: 0x444444))
                        }

                        Spacer()

                        HStack(spacing: 10) {
                            PreviewAction(symbol: "pencil", title: "编辑")
                            PreviewAction(symbol: "square.and.arrow.up", title: "分享")
                            PreviewAction(symbol: "trash", title: "删除")
                        }
                    }

                    HStack(spacing: 14) {
                        NutritionCard(record: record)
                            .frame(maxWidth: .infinity)
                        VStack(alignment: .leading, spacing: 13) {
                            Text("相关数据")
                                .font(.system(size: 13, weight: .bold))
                            HStack {
                                RelatedInline(symbol: "scalemass", title: "体重", subtitle: "今天 07:00")
                                RelatedInline(symbol: "moon.fill", title: "睡眠", subtitle: "7 小时 12 分钟")
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 78)
                        .background(Color(hex: 0xf7f7f7), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("备注")
                            .font(.system(size: 13, weight: .bold))
                        Text(record.id == "breakfast" ? "今天早餐吃得不错，水果很新鲜。" : "添加备注...")
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
                .padding(24)
                .frame(maxWidth: .infinity)
                .background(Color.white.opacity(0.98))
            }
            .frame(width: 784)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.24), radius: 32, y: 13)
        }
        .accessibilityIdentifier("mac-image-preview-overlay")
    }
}

private struct PreviewIconButton: View {
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Color(hex: 0x333333))
                .frame(width: 32, height: 32)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
        }
        .buttonStyle(.plain)
    }
}

private struct PreviewAction: View {
    let symbol: String
    let title: String

    var body: some View {
        Button {
        } label: {
            VStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                Text(title)
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundStyle(Color(hex: 0x555555))
            .frame(width: 44, height: 48)
            .background(Color(hex: 0xf9f9f9), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 11, y: 5)
        }
        .buttonStyle(.plain)
    }
}

private struct RelatedInline: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .bold))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                Text(subtitle)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(hex: 0x555555))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct PlaceholderPage: View {
    let section: SidebarSection

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(section.rawValue)
                .font(NomiMacType.title)
            Text("这个入口会在对应能力具备真实内容后继续补齐。")
                .font(NomiMacType.body)
                .foregroundStyle(NomiMacColor.muted)
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
        switch visual {
        case .image(let name):
            ResourceImage(name: name, contentMode: .fill)
                .clipShape(RoundedRectangle(cornerRadius: name == "report" ? 2 : 7, style: .continuous))
                .shadow(color: .black.opacity(0.04), radius: 6, y: 3)
        case .symbol(let symbol, let background):
            ZStack {
                background
                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(symbol == "figure.run" ? Color(hex: 0x47e086) : Color(hex: 0x777777))
            }
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
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
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
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
                .font(NomiMacType.body)
                .foregroundStyle(NomiMacColor.secondaryInk)
                .lineLimit(1)
            Spacer()
            Button("重试", action: action)
        }
        .padding(12)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(NomiMacColor.hairline, lineWidth: 1)
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
            dayGroup: savedRecord.isToday ? "今天" : "更早",
            dateLabel: savedRecord.isToday ? "5月18日" : "",
            title: savedRecord.title.isEmpty ? "健康记录" : savedRecord.title,
            summary: savedRecord.detailLine.isEmpty ? savedRecord.summary : savedRecord.detailLine,
            source: savedRecord.source == "macos-file" ? "来自本机图片" : nil,
            tag: tag,
            visual: savedRecord.imageURI?.isEmpty == false ? .image("breakfast") : .symbol(savedRecord.symbolName, Color(hex: 0xf2f2f1)),
            calories: savedRecord.metadata["kcal"].map { "\($0) 千卡" } ?? "520 千卡",
            protein: savedRecord.metadata["protein_g"].map { "\($0) g" } ?? "28 g",
            carbs: savedRecord.metadata["carbs_g"].map { "\($0) g" } ?? "55 g",
            fat: savedRecord.metadata["fat_g"].map { "\($0) g" } ?? "18 g"
        )
    }

    static let figmaFixtures: [NomiRecord] = [
        NomiRecord(
            id: "breakfast",
            time: "08:15",
            dayGroup: "今天",
            dateLabel: "5月18日",
            title: "早餐",
            summary: "三明治、牛奶、水果",
            source: nil,
            tag: .food,
            visual: .image("breakfast"),
            calories: "520 千卡",
            protein: "28 g",
            carbs: "55 g",
            fat: "18 g"
        ),
        NomiRecord(
            id: "run",
            time: "07:30",
            dayGroup: "今天",
            dateLabel: "5月18日",
            title: "跑步",
            summary: "5.02 公里 · 32 分钟 · 5'42\"/公里",
            source: "来自 Apple Watch",
            tag: .fitness,
            visual: .symbol("figure.run", Color(hex: 0x141716)),
            calories: "312 千卡",
            protein: "-",
            carbs: "-",
            fat: "-"
        ),
        NomiRecord(
            id: "checkup",
            time: "",
            dayGroup: "今天",
            dateLabel: "5月18日",
            title: "体检报告",
            summary: "年度体检报告.pdf · 2.4 MB",
            source: nil,
            tag: .file,
            visual: .image("report"),
            calories: "-",
            protein: "-",
            carbs: "-",
            fat: "-"
        ),
        NomiRecord(
            id: "sleep-note",
            time: "",
            dayGroup: "今天",
            dateLabel: "5月18日",
            title: "睡前感受",
            summary: "今天睡眠一般，下午有点疲惫，喝了咖啡后精神好多了。",
            source: nil,
            tag: .text,
            visual: .symbol("note.text", Color(hex: 0xf2f2f1)),
            calories: "-",
            protein: "-",
            carbs: "-",
            fat: "-"
        ),
        NomiRecord(
            id: "voice",
            time: "",
            dayGroup: "今天",
            dateLabel: "5月18日",
            title: "语音记录",
            summary: "",
            source: nil,
            tag: .audio,
            visual: .waveform,
            calories: "-",
            protein: "-",
            carbs: "-",
            fat: "-"
        ),
        NomiRecord(
            id: "workout",
            time: "18:45",
            dayGroup: "昨天",
            dateLabel: "5月17日",
            title: "力量训练",
            summary: "胸部、肩部、肱三头肌 · 60 分钟",
            source: "来自 Apple Watch",
            tag: .fitness,
            visual: .image("workout"),
            calories: "420 千卡",
            protein: "-",
            carbs: "-",
            fat: "-"
        ),
        NomiRecord(
            id: "dinner",
            time: "18:10",
            dayGroup: "昨天",
            dateLabel: "5月17日",
            title: "晚餐",
            summary: "鸡胸肉、糙米、蔬菜沙拉",
            source: nil,
            tag: .food,
            visual: .image("breakfast"),
            calories: "610 千卡",
            protein: "42 g",
            carbs: "64 g",
            fat: "16 g"
        )
    ]
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
    var isToday: Bool {
        guard let date = parsedDate else { return true }
        return Calendar.current.isDateInToday(date)
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
