import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UIKit

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

enum NomiTab: Int, CaseIterable {
    case today = 0
    case trends = 1
    case log = 2
    case profile = 3

    var title: String {
        switch self {
        case .today: "Today"
        case .trends: "Trends"
        case .log: "Log"
        case .profile: "Me"
        }
    }

    var symbol: String {
        switch self {
        case .today: "house"
        case .trends: "chart.line.uptrend.xyaxis"
        case .log: "fork.knife"
        case .profile: "person"
        }
    }

    var selectedSymbol: String {
        switch self {
        case .today: "house.fill"
        case .trends: "chart.line.uptrend.xyaxis"
        case .log: "fork.knife"
        case .profile: "person.fill"
        }
    }
}

enum UploadSource: String, CaseIterable, Identifiable {
    case camera = "Camera"
    case photos = "Photos"
    case files = "Files"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .camera: "camera.fill"
        case .photos: "photo.on.rectangle.angled"
        case .files: "doc.fill"
        }
    }

    var copy: String {
        switch self {
        case .camera: "Capture a fresh record"
        case .photos: "Choose from library"
        case .files: "Import an image file"
        }
    }
}

struct ContentView: View {
    @State private var selectedTab: NomiTab = .today
    @State private var showUploadSheet = false
    @State private var showHero = false
    @State private var timelineItems: [TimelineItem] = TimelineItem.samples

    var body: some View {
        ZStack(alignment: .bottom) {
            currentTabView

            NomiBottomBar(selectedTab: $selectedTab, onAdd: openUploadSheet)
                .padding(.horizontal, 20)
                .padding(.bottom, 10)
        }
        .tint(.primary)
        .sheet(isPresented: $showUploadSheet) {
            UploadSheet { newItem in
                withAnimation(.spring(duration: 0.55, bounce: 0.22)) {
                    timelineItems.insert(newItem, at: 0)
                }
                showUploadSheet = false
            }
            .presentationDetents([.fraction(0.74), .large])
            .presentationCornerRadius(34)
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
        }
    }

    @ViewBuilder
    private var currentTabView: some View {
        switch selectedTab {
        case .today:
            NavigationStack {
                HomeView(
                    items: timelineItems,
                    showHero: showHero
                )
                .navigationTitle("Nomi")
                .navigationBarTitleDisplayMode(.inline)
            }
        case .trends:
            PlaceholderTab(title: "Trends", symbol: "chart.line.uptrend.xyaxis", detail: "Gentle reflection views are next.")
        case .log:
            PlaceholderTab(title: "Log", symbol: "fork.knife", detail: "Detailed records will live here.")
        case .profile:
            PlaceholderTab(title: "Me", symbol: "person", detail: "Privacy and export controls are next.")
        }
    }

    private func openUploadSheet() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.bouncy(duration: 0.45)) {
            showUploadSheet = true
        }
    }
}

struct NomiBottomBar: View {
    private enum NavSlot: Equatable {
        case tab(NomiTab)
        case upload
    }

    @Binding var selectedTab: NomiTab
    let onAdd: () -> Void
    @State private var appeared = false
    @State private var activeSlot: NavSlot?
    @State private var dragStartSlot: NavSlot?
    @State private var lastFeedbackSlot: NavSlot?
    @Namespace private var selectionNamespace

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 9) {
                tabButton(.today)
                tabButton(.trends)
                uploadButton
                tabButton(.log)
                tabButton(.profile)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Capsule(style: .continuous))
            .gesture(navDragGesture(width: proxy.size.width))
        }
        .frame(maxWidth: 326)
        .frame(height: 72)
        .background {
            Capsule(style: .continuous)
                .fill(Color(red: 1.0, green: 0.99, blue: 0.96).opacity(0.62))
                .glassEffect(.regular.interactive(), in: .capsule)
                .overlay {
                    Capsule(style: .continuous)
                        .stroke(.white.opacity(0.72), lineWidth: 1)
                }
                .overlay(alignment: .top) {
                    Capsule()
                        .fill(.white.opacity(0.5))
                        .frame(height: 1)
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                }
                .shadow(color: Color(red: 0.16, green: 0.13, blue: 0.11).opacity(0.13), radius: 24, y: 16)
        }
        .scaleEffect(appeared ? 1 : 0.96)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(duration: 0.55, bounce: 0.2)) {
                appeared = true
            }
        }
    }

    private var uploadButton: some View {
        let isActive = activeSlot == .upload

        return VStack(spacing: 5) {
            Image(systemName: "plus")
                .font(.system(size: 19, weight: .semibold))
                .symbolEffect(.bounce, value: activeSlot)
            Text("Add")
                .font(.system(size: 10, weight: .semibold))
        }
        .frame(width: 48, height: 50)
        .foregroundStyle(Color(red: 0.66, green: 0.36, blue: 0.29).opacity(isActive ? 1 : 0.76))
        .background {
            if isActive {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color(red: 0.80, green: 0.43, blue: 0.34).opacity(0.12))
                    .glassEffect(.regular, in: .rect(cornerRadius: 22))
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .scaleEffect(isActive ? 1.07 : 1)
        .accessibilityLabel("Upload")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            onAdd()
        }
    }

    private func tabButton(_ tab: NomiTab) -> some View {
        let isSelected = selectedTab == tab
        let isActive = activeSlot == .tab(tab)

        return VStack(spacing: 5) {
            Image(systemName: selectedTab == tab ? tab.selectedSymbol : tab.symbol)
                .font(.system(size: 18, weight: .medium))
                .symbolEffect(.bounce, value: selectedTab)
            Text(tab.title)
                .font(.system(size: 10, weight: .semibold))
        }
        .frame(width: 48, height: 50)
        .foregroundStyle(isSelected ? Color(red: 0.21, green: 0.19, blue: 0.16) : Color(red: 0.42, green: 0.39, blue: 0.34).opacity(0.58))
        .background {
            if isSelected {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.white.opacity(0.56))
                    .glassEffect(.regular, in: .rect(cornerRadius: 22))
                    .matchedGeometryEffect(id: "selectedTab", in: selectionNamespace)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .scaleEffect(isActive ? 1.07 : isSelected ? 1.03 : 1)
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            selectTab(tab)
        }
    }

    private func navDragGesture(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                let slot = navSlot(at: value.location.x, width: width)

                if dragStartSlot == nil {
                    dragStartSlot = slot
                }

                if activeSlot != slot {
                    activeSlot = slot
                }

                if lastFeedbackSlot != slot {
                    UISelectionFeedbackGenerator().selectionChanged()
                    lastFeedbackSlot = slot
                }

                if case .tab(let tab) = slot, selectedTab != tab {
                    selectTab(tab)
                }
            }
            .onEnded { value in
                let finalSlot = navSlot(at: value.location.x, width: width)

                if finalSlot == .upload {
                    onAdd()
                }

                withAnimation(.spring(duration: 0.28, bounce: 0.18)) {
                    activeSlot = nil
                }
                dragStartSlot = nil
                lastFeedbackSlot = nil
            }
    }

    private func navSlot(at x: CGFloat, width: CGFloat) -> NavSlot {
        let slots: [NavSlot] = [.tab(.today), .tab(.trends), .upload, .tab(.log), .tab(.profile)]
        let slotWidth = max(width / CGFloat(slots.count), 1)
        let index = min(max(Int(x / slotWidth), 0), slots.count - 1)
        return slots[index]
    }

    private func selectTab(_ tab: NomiTab) {
        withAnimation(.spring(duration: 0.35, bounce: 0.18)) {
            selectedTab = tab
        }
    }
}

struct HomeView: View {
    let items: [TimelineItem]
    let showHero: Bool

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    OverviewCard(itemCount: items.count)
                        .scaleEffect(showHero ? 1 : 0.96)
                        .opacity(showHero ? 1 : 0)
                        .blur(radius: showHero ? 0 : 12)

                    VStack(alignment: .leading, spacing: 16) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Today")
                                .font(.title2.weight(.semibold))
                            Spacer()
                            Text("\(items.count) uploads")
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
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 104)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct OverviewCard: View {
    let itemCount: Int
    @State private var breathe = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Global Overview")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                    Text("A quiet day with a few useful signals.")
                        .font(.system(size: 27, weight: .semibold, design: .rounded))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 18)

                ZStack {
                    Circle()
                        .fill(.white.opacity(0.72))
                        .frame(width: 62, height: 62)
                        .glassEffect(.regular.interactive(), in: .circle)
                    Image(systemName: "sparkle.magnifyingglass")
                        .font(.system(size: 23, weight: .semibold))
                        .symbolEffect(.pulse, options: .repeating, value: breathe)
                }
                .scaleEffect(breathe ? 1.035 : 0.985)
            }

            HStack(spacing: 10) {
                MetricPill(value: "\(itemCount)", label: "uploads", symbol: "tray.and.arrow.up.fill")
                MetricPill(value: "2", label: "themes", symbol: "tag.fill")
                MetricPill(value: "8h", label: "span", symbol: "clock.fill")
            }
        }
        .padding(20)
        .background {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.white.opacity(0.72))
                .glassEffect(.regular, in: .rect(cornerRadius: 30))
                .shadow(color: .black.opacity(0.08), radius: 28, y: 18)
        }
        .overlay(alignment: .topTrailing) {
            Canvas { context, size in
                let rect = CGRect(x: size.width - 96, y: 14, width: 88, height: 88)
                context.stroke(Path(ellipseIn: rect), with: .color(.white.opacity(0.8)), lineWidth: 1)
            }
            .allowsHitTesting(false)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                breathe = true
            }
        }
    }
}

struct MetricPill: View {
    let value: String
    let label: String
    let symbol: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.headline.weight(.semibold))
                    .contentTransition(.numericText())
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
        .padding(.horizontal, 11)
        .background(.thinMaterial, in: Capsule())
    }
}

struct TimelineRow: View {
    let item: TimelineItem
    let index: Int
    let isFirst: Bool
    let isLast: Bool
    @State private var appeared = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(item.time)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: 48, alignment: .trailing)
                .padding(.top, 22)

            VStack(spacing: 0) {
                Rectangle()
                    .fill(isFirst ? .clear : Color.secondary.opacity(0.2))
                    .frame(width: 1, height: 18)

                Circle()
                    .strokeBorder(item.tint.opacity(0.36), lineWidth: 2)
                    .background(Circle().fill(item.tint.opacity(0.82)))
                    .frame(width: 10, height: 10)
                    .scaleEffect(appeared ? 1 : 0.4)

                Rectangle()
                    .fill(isLast ? .clear : Color.secondary.opacity(0.2))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)
            }
            .frame(width: 12, height: 88)

            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(item.tint.opacity(0.14))
                    if let image = item.image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity.combined(with: .scale(scale: 0.94)))
                    } else {
                        Image(systemName: item.symbol)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(item.tint)
                            .symbolEffect(.bounce, value: appeared)
                    }
                }
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(item.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if let badge = item.badge {
                    Text(badge)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(item.tint)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 9)
                        .background(item.tint.opacity(0.1), in: Capsule())
                }
            }
            .padding(.vertical, 11)
            .padding(.horizontal, 12)
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(index == 3 ? item.tint.opacity(0.16) : Color.white.opacity(0.68))
                    .glassEffect(.regular, in: .rect(cornerRadius: 22))
            }
        }
        .frame(height: 88)
        .offset(y: appeared ? 0 : 20)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(duration: 0.55, bounce: 0.18).delay(Double(index) * 0.07)) {
                appeared = true
            }
        }
    }
}

struct UploadSheet: View {
    let onUpload: (TimelineItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedSource: UploadSource = .photos
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var importedImage: UIImage?
    @State private var importedName = "No file selected"
    @State private var showFileImporter = false
    @State private var isUploading = false
    @State private var uploadProgress = 0.0
    @State private var cameraMessage: String?
    @State private var controlsAppeared = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            NomiBackground()

            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Upload")
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                    Text("Add one thing from today.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

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
                        Text(isUploading ? "Uploading" : importedImage == nil ? "Choose Image" : "Upload")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.capsule)
                .tint(.black.opacity(0.86))
                .disabled(isUploading)
            }
            .padding(.horizontal, 22)
            .padding(.top, 74)
            .padding(.bottom, 24)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .padding(.top, 62)
            .padding(.trailing, 26)
            .accessibilityLabel("Close")
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
                        Text(source.rawValue)
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
            }
        }
    }

    private var uploadPreview: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(selectedSource.copy)
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
                        Text("Choose an image to continue")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if isUploading {
                    VStack(spacing: 12) {
                        ProgressView(value: uploadProgress)
                            .progressViewStyle(.linear)
                            .tint(.primary)
                        Text("Preparing timeline entry")
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
        }
        .padding(18)
        .background {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.white.opacity(0.62))
                .glassEffect(.regular, in: .rect(cornerRadius: 30))
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
        }

        switch source {
        case .camera:
            cameraMessage = "Camera is a placeholder on simulator"
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
                await MainActor.run {
                    withAnimation(.spring(duration: 0.45, bounce: 0.18)) {
                        importedImage = image
                        importedName = "Photo library image"
                    }
                }
            }
        } catch {
            await MainActor.run {
                importedName = "Could not load selected photo"
            }
        }
    }

    private func importFile(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else {
            importedName = "No file selected"
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
                withAnimation(.spring(duration: 0.45, bounce: 0.18)) {
                    importedImage = image
                    importedName = url.lastPathComponent
                }
            } else {
                importedName = "Selected file is not an image"
            }
        } catch {
            importedName = "Could not import file"
        }
    }

    private func startUpload() {
        guard let importedImage else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        isUploading = true
        uploadProgress = 0.12

        Task {
            for progress in [0.32, 0.58, 0.82, 1.0] {
                try? await Task.sleep(for: .milliseconds(210))
                await MainActor.run {
                    withAnimation(.smooth(duration: 0.22)) {
                        uploadProgress = progress
                    }
                }
            }

            await MainActor.run {
                let newItem = TimelineItem(
                    time: "Now",
                    title: "New upload",
                    subtitle: selectedSource.rawValue,
                    detail: "Saved to today's private timeline",
                    symbol: selectedSource.symbol,
                    tint: .green,
                    image: importedImage,
                    minutesAgo: 0,
                    badge: "New"
                )
                onUpload(newItem)
            }
        }
    }
}

struct PlaceholderTab: View {
    let title: String
    let symbol: String
    let detail: String

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()
                VStack(spacing: 16) {
                    Image(systemName: symbol)
                        .font(.system(size: 36, weight: .semibold))
                        .frame(width: 78, height: 78)
                        .glassEffect(.regular.interactive(), in: .circle)
                    Text(title)
                        .font(.title2.weight(.semibold))
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(title)
        }
    }
}

struct NomiBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.98, green: 0.97, blue: 0.94),
                Color(red: 0.91, green: 0.95, blue: 0.97),
                Color(red: 0.97, green: 0.94, blue: 0.92)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

extension TimelineItem {
    static let samples: [TimelineItem] = [
        TimelineItem(
            time: "07:45",
            title: "Breakfast photo",
            subtitle: "Image upload",
            detail: "AI tags ready for review",
            symbol: "fork.knife.circle.fill",
            tint: .orange,
            image: nil,
            minutesAgo: 18,
            badge: "34P"
        ),
        TimelineItem(
            time: "09:30",
            title: "Walk note",
            subtitle: "Light movement",
            detail: "Recorded after lunch",
            symbol: "figure.walk.circle.fill",
            tint: .mint,
            image: nil,
            minutesAgo: 74,
            badge: "48m"
        ),
        TimelineItem(
            time: "12:20",
            title: "Evening snack",
            subtitle: "Quick capture",
            detail: "Private memory saved",
            symbol: "camera.macro.circle.fill",
            tint: .purple,
            image: nil,
            minutesAgo: 126,
            badge: nil
        )
    ]
}

#Preview {
    ContentView()
}
