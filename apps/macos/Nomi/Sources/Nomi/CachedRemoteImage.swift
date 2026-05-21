import AppKit
import CryptoKit
import SwiftUI

struct CachedRemoteImage<Content: View, Loading: View, Failure: View>: View {
    let url: URL
    @ViewBuilder let content: (Image) -> Content
    @ViewBuilder let loading: () -> Loading
    @ViewBuilder let failure: () -> Failure

    @State private var image: NSImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image {
                content(Image(nsImage: image))
            } else if failed {
                failure()
            } else {
                loading()
            }
        }
        .task(id: url) {
            await loadImage()
        }
    }

    @MainActor
    private func loadImage() async {
        image = nil
        failed = false

        do {
            image = try await RemoteImageCache.shared.image(for: url)
        } catch {
            image = nil
            failed = true
        }
    }
}

@MainActor
private final class RemoteImageCache {
    static let shared = RemoteImageCache()

    private let memoryCache = NSCache<NSURL, NSImage>()
    private let fileManager = FileManager.default

    private init() {}

    func image(for url: URL) async throws -> NSImage {
        if let image = memoryCache.object(forKey: url as NSURL) {
            return image
        }

        let fileURL = try cachedFileURL(for: url)
        if fileManager.fileExists(atPath: fileURL.path),
           let image = NSImage(contentsOf: fileURL) {
            memoryCache.setObject(image, forKey: url as NSURL)
            return image
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        if let httpResponse = response as? HTTPURLResponse,
           !(200..<300).contains(httpResponse.statusCode) {
            throw URLError(.badServerResponse)
        }

        try ensureCacheDirectoryExists()
        try data.write(to: fileURL, options: [.atomic])

        guard let image = NSImage(data: data) ?? NSImage(contentsOf: fileURL) else {
            try? fileManager.removeItem(at: fileURL)
            throw URLError(.cannotDecodeContentData)
        }

        memoryCache.setObject(image, forKey: url as NSURL)
        return image
    }

    private func cachedFileURL(for url: URL) throws -> URL {
        try cacheDirectory()
            .appendingPathComponent(cacheKey(for: url), isDirectory: false)
            .appendingPathExtension(cacheExtension(for: url))
    }

    private func cacheDirectory() throws -> URL {
        let bundleID = Bundle.main.bundleIdentifier ?? "dev.nomi.mac"
        return try fileManager.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        .appendingPathComponent(bundleID, isDirectory: true)
        .appendingPathComponent("RecordImages", isDirectory: true)
    }

    private func ensureCacheDirectoryExists() throws {
        try fileManager.createDirectory(
            at: cacheDirectory(),
            withIntermediateDirectories: true,
            attributes: nil
        )
    }

    private func cacheKey(for url: URL) -> String {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func cacheExtension(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        if ext.range(of: #"^[a-z0-9]{1,8}$"#, options: .regularExpression) != nil {
            return ext
        }
        return "img"
    }
}
