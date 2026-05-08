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

    static func save(extraction: ImageExtraction, source: UploadSource, assetName: String) async {
        do {
            var request = URLRequest(url: NomiAPI.url(path: "records"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                CreateRecordRequest(
                    type: extraction.recordType,
                    source: source.apiValue,
                    title: extraction.title,
                    summary: extraction.metadataLine,
                    imageURI: assetName,
                    metadata: extraction.recordMetadata(assetName: assetName, source: source),
                    confidence: extraction.confidence
                )
            )

            _ = try await URLSession.shared.data(for: request)
        } catch {
            return
        }
    }
}

private struct RecordsResponse: Decodable {
    let records: [SavedRecord]
}

private struct SavedRecord: Decodable {
    let type: String
    let occurredAt: String
    let source: String
    let title: String
    let summary: String
    let imageURI: String?
    let metadata: [String: String]
    let confidence: Double?

    enum CodingKeys: String, CodingKey {
        case type
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
            badge: badge
        )
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

private extension ImageExtraction {
    var recordType: String {
        switch inputCategory {
        case "information":
            return "document"
        case "body_stats":
            return "body_stats"
        case "food", "beverage", "caffeine", "alcohol", "nicotine":
            return "food"
        default:
            return "note"
        }
    }

    func recordMetadata(assetName: String, source: UploadSource) -> [String: String] {
        var values: [String: String] = [
            "schema_version": schemaVersion,
            "direction": direction,
            "input_category": inputCategory,
            "output_impacts": outputImpacts.joined(separator: ","),
            "asset_name": assetName,
            "source": source.apiValue,
            "detail": metadataLine,
            "symbol": symbolName
        ]

        if let badge = badgeText {
            values["badge"] = badge
        }
        if let calories = metadata.caloriesKcal {
            values["calories_kcal"] = "\(calories)"
        }
        if let protein = metadata.proteinG {
            values["protein_g"] = "\(protein)"
        }
        if let duration = metadata.durationMin {
            values["duration_min"] = "\(duration)"
        }
        if let mimeType = metadata.originalMimeType {
            values["mime_type"] = mimeType
        }

        return values
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
