import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct TimelineItem: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let subtitle: String
    let detail: String
    let symbol: String
    let tint: Color
    let image: UIImage?
    let minutesAgo: Int
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
    @State private var selectedTab = 0
    @State private var showUploadSheet = false
    @State private var showHero = false
    @State private var timelineItems: [TimelineItem] = TimelineItem.samples

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                HomeView(
                    items: timelineItems,
                    showHero: showHero
                )
                .navigationTitle("Nomi")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            openUploadSheet()
                        } label: {
                            Image(systemName: "plus")
                                .font(.headline.weight(.semibold))
                        }
                        .buttonStyle(.glass)
                        .accessibilityLabel("Upload")
                    }
                }
            }
            .tabItem {
                Label("Today", systemImage: "house.fill")
            }
            .tag(0)

            PlaceholderTab(title: "Ask", symbol: "sparkles", detail: "Grounded answers will live here.")
                .tabItem {
                    Label("Ask", systemImage: "sparkles")
                }
                .tag(1)

            PlaceholderTab(title: "Trends", symbol: "chart.line.uptrend.xyaxis", detail: "Gentle reflection views are next.")
                .tabItem {
                    Label("Trends", systemImage: "chart.line.uptrend.xyaxis")
                }
                .tag(2)
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

    private func openUploadSheet() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.bouncy(duration: 0.45)) {
            showUploadSheet = true
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

                        LazyVStack(spacing: 12) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                TimelineRow(item: item, index: index)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 112)
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
    @State private var appeared = false

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(item.tint.opacity(0.15))
                if let image = item.image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity.combined(with: .scale(scale: 0.94)))
                } else {
                    Image(systemName: item.symbol)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(item.tint)
                        .symbolEffect(.bounce, value: appeared)
                }
            }
            .frame(width: 58, height: 58)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            VStack(alignment: .leading, spacing: 5) {
                Text(item.title)
                    .font(.headline)
                Text(item.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(item.detail)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Text("\(item.minutesAgo)m")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .padding(.vertical, 6)
                .padding(.horizontal, 9)
                .background(.thinMaterial, in: Capsule())
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.white.opacity(0.68))
                .glassEffect(.regular, in: .rect(cornerRadius: 24))
        }
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

            VStack(alignment: .leading, spacing: 22) {
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
            .padding(.top, 42)
            .padding(.bottom, 18)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .padding(.top, 34)
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
                    .frame(height: 86)
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
            .frame(height: 184)
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
                    title: "New upload",
                    subtitle: selectedSource.rawValue,
                    detail: "Saved to today's private timeline",
                    symbol: selectedSource.symbol,
                    tint: .green,
                    image: importedImage,
                    minutesAgo: 0
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
            title: "Breakfast photo",
            subtitle: "Image upload",
            detail: "AI tags ready for review",
            symbol: "fork.knife.circle.fill",
            tint: .orange,
            image: nil,
            minutesAgo: 18
        ),
        TimelineItem(
            title: "Walk note",
            subtitle: "Light movement",
            detail: "Recorded after lunch",
            symbol: "figure.walk.circle.fill",
            tint: .mint,
            image: nil,
            minutesAgo: 74
        ),
        TimelineItem(
            title: "Evening snack",
            subtitle: "Quick capture",
            detail: "Private memory saved",
            symbol: "camera.macro.circle.fill",
            tint: .purple,
            image: nil,
            minutesAgo: 126
        )
    ]
}

#Preview {
    ContentView()
}
