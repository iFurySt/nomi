import SwiftUI
import UniformTypeIdentifiers

private enum NomiMacType {
    static let title = Font.system(.largeTitle, design: .default, weight: .semibold)
    static let section = Font.system(.title3, design: .default, weight: .semibold)
    static let body = Font.system(.body, design: .default, weight: .regular)
    static let bodyStrong = Font.system(.body, design: .default, weight: .semibold)
    static let caption = Font.system(.caption, design: .default, weight: .medium)
}

struct ContentView: View {
    @State private var records: [SavedRecord] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingAddSheet = false

    var body: some View {
        RecordsView(
            records: records,
            isLoading: isLoading,
            errorMessage: errorMessage,
            onRefresh: refreshRecords,
            onAdd: { showingAddSheet = true }
        )
        .tint(.primary)
        .task {
            await loadRecords()
        }
        .sheet(isPresented: $showingAddSheet) {
            AddRecordSheet(
                onExtractImage: { fileURL in
                    _ = try await RecordsClient.extractImage(fileURL: fileURL)
                    await loadRecords()
                },
                onSave: { draft in
                    try await RecordsClient.saveRecord(draft)
                    await loadRecords()
                }
            )
        }
    }

    private func refreshRecords() {
        Task {
            await loadRecords()
        }
    }

    @MainActor
    private func loadRecords() async {
        isLoading = true
        errorMessage = nil

        do {
            records = try await RecordsClient.loadRecords()
        } catch {
            errorMessage = "Could not reach the Nomi server at \(NomiAPI.baseURL.absoluteString)."
        }

        isLoading = false
    }
}

private struct RecordsView: View {
    let records: [SavedRecord]
    let isLoading: Bool
    let errorMessage: String?
    let onRefresh: () -> Void
    let onAdd: () -> Void

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header

                    if let errorMessage {
                        ServerStatePanel(message: errorMessage, action: onRefresh)
                    }

                    if records.isEmpty && !isLoading {
                        EmptyRecordsPanel(onAdd: onAdd)
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(records) { record in
                                RecordRow(record: record)
                            }
                        }
                    }
                }
                .padding(.horizontal, 34)
                .padding(.top, 28)
                .padding(.bottom, 34)
                .frame(maxWidth: 760, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        .accessibilityIdentifier("mac-records-view")
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Nomi")
                    .font(NomiMacType.title)
                Text(records.isEmpty ? "No records yet" : "\(records.count) saved")
                    .font(NomiMacType.body)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            }

            Spacer(minLength: 24)

            if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .padding(.top, 12)
                    .accessibilityIdentifier("mac-records-loading")
            }

            Button {
                onRefresh()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.borderless)
            .help("Refresh")
            .accessibilityIdentifier("mac-refresh-button")
            .padding(.top, 6)

            Button {
                onAdd()
            } label: {
                Image(systemName: "plus")
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.borderless)
            .help("Add")
            .accessibilityIdentifier("mac-add-button")
            .padding(.top, 6)
        }
    }
}

private struct RecordRow: View {
    let record: SavedRecord

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(record.displayTime)
                .font(NomiMacType.caption)
                .foregroundStyle(.secondary)
                .frame(width: 46, alignment: .trailing)

            Image(systemName: record.symbolName)
                .font(.system(.body, design: .default, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 26, height: 26)
                .background(.tertiary, in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(record.title)
                        .font(NomiMacType.bodyStrong)
                        .lineLimit(1)

                    Text(record.category.capitalized)
                        .font(NomiMacType.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(.quaternary, in: Capsule())
                }

                Text(record.detailLine)
                    .font(NomiMacType.body)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(.separator.opacity(0.42))
                .frame(height: 1)
                .padding(.leading, 72)
        }
        .accessibilityIdentifier("mac-record-row")
    }
}

private struct ServerStatePanel: View {
    let message: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(.title3, design: .default, weight: .semibold))
                .foregroundStyle(.secondary)

            Text(message)
                .font(NomiMacType.body)
                .foregroundStyle(.secondary)

            Spacer(minLength: 16)

            Button("Retry", action: action)
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(.separator.opacity(0.45), lineWidth: 1)
        }
    }
}

private struct EmptyRecordsPanel: View {
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "square.and.pencil")
                .font(.system(.title2, design: .default, weight: .semibold))
                .foregroundStyle(.secondary)

            Text("No records yet")
                .font(NomiMacType.section)

            Button {
                onAdd()
            } label: {
                Label("Add", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("mac-empty-add-button")
        }
        .padding(.vertical, 10)
        .frame(maxWidth: 320, alignment: .leading)
    }
}

private struct AddRecordSheet: View {
    let onExtractImage: (URL) async throws -> Void
    let onSave: (CreateRecordDraft) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft = CreateRecordDraft()
    @State private var isSaving = false
    @State private var isImportingImage = false
    @State private var errorMessage: String?

    private let types = ["note", "food", "body_stats", "document"]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Add")
                    .font(NomiMacType.section)
                Spacer()
            }

            Button {
                isImportingImage = true
            } label: {
                Label("Choose Image", systemImage: "photo")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isSaving)
            .accessibilityIdentifier("mac-add-image-button")

            Divider()

            Picker("Type", selection: $draft.type) {
                ForEach(types, id: \.self) { type in
                    Text(label(for: type)).tag(type)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("mac-add-type-picker")

            TextField("Title", text: $draft.title)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-add-title-field")

            TextField("Summary", text: $draft.summary, axis: .vertical)
                .lineLimit(4, reservesSpace: true)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-add-summary-field")

            if let errorMessage {
                Text(errorMessage)
                    .font(NomiMacType.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Spacer()

                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Button {
                    save()
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Save")
                    }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.bordered)
                .disabled(!canSave || isSaving)
                .accessibilityIdentifier("mac-add-save-button")
            }
        }
        .padding(24)
        .frame(width: 430)
        .fileImporter(
            isPresented: $isImportingImage,
            allowedContentTypes: [.image],
            allowsMultipleSelection: false
        ) { result in
            handleImageImport(result)
        }
    }

    private var canSave: Bool {
        !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func label(for type: String) -> String {
        switch type {
        case "body_stats":
            "Body"
        default:
            type.capitalized
        }
    }

    private func save() {
        guard canSave else { return }

        isSaving = true
        errorMessage = nil

        Task {
            do {
                try await onSave(draft)
                await MainActor.run {
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Save failed. Check that the Nomi server is running."
                    isSaving = false
                }
            }
        }
    }

    private func handleImageImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let fileURL = urls.first else { return }
            isSaving = true
            errorMessage = nil

            Task {
                do {
                    try await onExtractImage(fileURL)
                    await MainActor.run {
                        dismiss()
                    }
                } catch {
                    await MainActor.run {
                        errorMessage = "Image analysis failed. Check that the Nomi server and SeedX are running."
                        isSaving = false
                    }
                }
            }
        case .failure:
            errorMessage = "Could not open that image."
        }
    }
}
