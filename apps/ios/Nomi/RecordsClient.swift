import Foundation
import SwiftUI

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

enum RecordsClient {
    static func loadTimelineItems() async -> [TimelineItem] {
        do {
            let (data, response) = try await URLSession.shared.data(from: NomiAPI.url(path: "records"))
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                return []
            }

            let records = try JSONDecoder().decode(RecordsResponse.self, from: data)
            return records.records.map(\.timelineItem)
        } catch {
            return []
        }
    }

    static func uploadImage(data: Data, assetName: String, source: UploadSource, mimeType: String) async throws -> TimelineItem {
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
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder().decode(ImageUploadResponse.self, from: responseData).record.timelineItem
    }
}

private struct RecordsResponse: Decodable {
    let records: [SavedRecord]
}

private struct ImageUploadResponse: Decodable {
    let record: SavedRecord
}

private struct SavedRecord: Decodable {
    let id: String
    let type: String
    let status: String
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
        case status
        case occurredAt = "occurred_at"
        case source
        case title
        case summary
        case imageURI = "image_uri"
        case metadata
        case confidence
    }

    var timelineItem: TimelineItem {
        let inputCategory = metadata["input_category"] ?? type
        let symbol = metadata["symbol"] ?? symbolName(for: inputCategory)
        let badge = metadata["badge"] ?? confidence.map { "\(Int(($0 * 100).rounded()))%" }
        let detail = metadata["detail"] ?? summary

        return TimelineItem(
            time: timeText,
            title: title,
            subtitle: inputCategory.capitalized,
            detail: detail,
            symbol: symbol,
            tint: tint(for: inputCategory),
            image: nil,
            minutesAgo: 0,
            badge: status == "completed" ? badge : statusBadge,
            status: status
        )
    }

    private var statusBadge: String {
        switch status {
        case "pending": "Queued"
        case "processing": "AI"
        case "failed": "Failed"
        default: status
        }
    }

    private var timeText: String {
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
}

private func symbolName(for inputCategory: String) -> String {
    switch inputCategory {
    case "beverage": "drop"
    case "caffeine": "cup.and.saucer"
    case "alcohol": "wineglass"
    case "nicotine": "smoke"
    case "exercise": "figure.run"
    case "sunlight": "sun.max"
    case "social": "person.2"
    case "information", "document": "doc.text"
    default: "fork.knife"
    }
}

private func tint(for inputCategory: String) -> Color {
    switch inputCategory {
    case "caffeine", "beverage", "sunlight":
        Color(uiColor: .label).opacity(0.62)
    case "exercise", "information", "document", "social":
        Color(uiColor: .label).opacity(0.70)
    case "alcohol", "nicotine":
        Color(uiColor: .secondaryLabel).opacity(0.84)
    default:
        Color(uiColor: .label).opacity(0.66)
    }
}
