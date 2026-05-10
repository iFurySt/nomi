import Foundation

enum NomiAPI {
    static let baseURL: URL = {
        if let value = ProcessInfo.processInfo.environment["NOMI_API_BASE_URL"],
           let url = URL(string: value) {
            return url
        }

        #if DEBUG
        return URL(string: "http://127.0.0.1:8088")!
        #else
        return URL(string: "https://nomi.ifuryst.com")!
        #endif
    }()

    static func url(path: String) -> URL {
        baseURL.appending(path: path)
    }
}

struct SavedRecord: Identifiable, Decodable, Equatable {
    let id: String
    let type: String
    let occurredAt: String
    let source: String
    let title: String
    let summary: String
    let imageURI: String?
    let metadata: [String: String]
    let confidence: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case occurredAt = "occurred_at"
        case source
        case title
        case summary
        case imageURI = "image_uri"
        case metadata
        case confidence
    }

    var category: String {
        metadata["input_category"] ?? type
    }

    var displayTime: String {
        guard let date = Self.parseDate(occurredAt) else {
            return "Saved"
        }

        let formatter = DateFormatter()
        if Calendar.current.isDateInToday(date) {
            formatter.dateFormat = "HH:mm"
        } else {
            formatter.dateFormat = "MMM d"
        }
        return formatter.string(from: date)
    }

    var detailLine: String {
        metadata["detail"] ?? summary
    }

    var symbolName: String {
        metadata["symbol"] ?? Self.symbolName(for: category)
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) {
            return date
        }

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }

    private static func symbolName(for category: String) -> String {
        switch category {
        case "beverage":
            "drop"
        case "caffeine":
            "cup.and.saucer"
        case "exercise":
            "figure.run"
        case "information", "document":
            "doc.text"
        case "sleep":
            "moon"
        default:
            "fork.knife"
        }
    }
}

struct CreateRecordDraft {
    var type = "note"
    var title = ""
    var summary = ""
    var source = "macos"
}

private struct RecordsResponse: Decodable {
    let records: [SavedRecord]
}

private struct CreateRecordRequest: Encodable {
    let type: String
    let source: String
    let title: String
    let summary: String
    let imageURI: String
    let metadata: [String: String]
    let confidence: Double

    enum CodingKeys: String, CodingKey {
        case type
        case source
        case title
        case summary
        case imageURI = "image_uri"
        case metadata
        case confidence
    }
}

enum RecordsClient {
    static func loadRecords() async throws -> [SavedRecord] {
        let (data, response) = try await URLSession.shared.data(from: NomiAPI.url(path: "records"))
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let decoded = try JSONDecoder().decode(RecordsResponse.self, from: data)
        return decoded.records
    }

    static func saveRecord(_ draft: CreateRecordDraft) async throws {
        var request = URLRequest(url: NomiAPI.url(path: "records"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            CreateRecordRequest(
                type: draft.type,
                source: draft.source,
                title: draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
                summary: draft.summary.trimmingCharacters(in: .whitespacesAndNewlines),
                imageURI: "",
                metadata: [
                    "input_category": draft.type,
                    "source": draft.source,
                    "detail": draft.summary.trimmingCharacters(in: .whitespacesAndNewlines),
                    "symbol": SavedRecordPlaceholder.symbolName(for: draft.type)
                ],
                confidence: 1
            )
        )

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}

private enum SavedRecordPlaceholder {
    static func symbolName(for type: String) -> String {
        switch type {
        case "food":
            "fork.knife"
        case "body_stats":
            "heart.text.square"
        case "document":
            "doc.text"
        default:
            "square.and.pencil"
        }
    }
}
