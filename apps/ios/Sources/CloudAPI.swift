import Foundation
import Security
import CryptoKit

typealias CloudJSON = [String: Any]

struct CloudFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}

struct CloudSession: Codable {
    let site: URL
    let token: String
    let sessionID: String
    let userID: String
    let email: String
    var spaceID: String?
}

enum CredentialVault {
    private static var key: [String: Any] {
        var service = "com.ifuryst.nomi.mobile.sync"
        #if DEBUG
        if let suite = ProcessInfo.processInfo.environment["NOMI_UI_LIBRARY"], UUID(uuidString: suite) != nil {
            service += "." + suite
        }
        #endif
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                kSecAttrAccount as String: "session"]
    }

    static func load() throws -> CloudSession? {
        var query = key
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw CloudFailure("无法读取钥匙串。") }
        return try JSONDecoder().decode(CloudSession.self, from: data)
    }

    static func save(_ value: CloudSession?) throws {
        guard let value else {
            let status = SecItemDelete(key as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw CloudFailure("无法清除钥匙串。") }
            return
        }
        let fields: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(value),
                                      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(key as CFDictionary, fields as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(key.merging(fields) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw CloudFailure("无法保存登录凭据。") }
    }
}

private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum CloudHTTP: LocalizedError {
    case staleCursor
    var errorDescription: String? { "请求已过期，请重试。" }
}

enum CloudAPI {
    static let official = "https://nomi.ifuryst.com"
    private static let network = URLSession(configuration: .ephemeral, delegate: RejectRedirects(), delegateQueue: nil)

    static var mobileSite: URL {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["NOMI_TEST_SITE"],
           let url = try? site(override), url.host == "127.0.0.1" { return url }
        #endif
        return URL(string: official)!
    }

    @MainActor static var deviceID: String {
        let defaults = UserDefaults.standard
        if let id = defaults.string(forKey: "syncDeviceID") { return id }
        let id = "device." + UUID().uuidString
        defaults.set(id, forKey: "syncDeviceID")
        return id
    }

    static func site(_ input: String) throws -> URL {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var url = URLComponents(string: raw.isEmpty ? official : raw),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, ["", "/", "/api", "/api/"].contains(url.path),
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "[::1]"].contains(host))
        else { throw CloudFailure("请输入 HTTPS 服务地址。") }
        url.path = ""
        guard let result = url.url else { throw CloudFailure("服务地址无效。") }
        return result
    }

    static func request(_ site: URL, _ path: String, token: String? = nil, method: String = "GET",
                        body: CloudJSON? = nil) async throws -> Any {
        guard let url = URL(string: "api/" + path, relativeTo: site.appendingPathComponent("", isDirectory: true))?.absoluteURL else { throw LibraryError.unsupported }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 25
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await network.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudFailure("服务没有响应。") }
        if let body = try? JSONSerialization.jsonObject(with: data) as? CloudJSON,
           let code = body["code"] as? String {
            switch code {
            case "invalid_credentials": throw CloudFailure("邮箱或密码有误。")
            case "email_ownership_required": throw CloudFailure("Google 无法确认这个外部邮箱的当前归属。请使用 Gmail、Google Workspace 或 Apple 登录。")
            case "verified_email_required": throw CloudFailure("请允许登录服务分享已验证的邮箱后重试。")
            case "identity_in_use": throw CloudFailure("账号已有其他关联。")
            case "provider_unavailable": throw CloudFailure("这种登录方式暂未开放。")
            case "invalid_proof": throw CloudFailure("身份验证已过期，请重试。")
            case "rate_limited": throw CloudFailure("尝试过于频繁，请稍后再试。")
            default: break
            }
        }
        if http.statusCode == 410 { throw CloudHTTP.staleCursor }
        if http.statusCode == 409 { throw LibraryError.conflict }
        if http.statusCode == 401 { throw CloudFailure("登录已失效，请重新登录。") }
        guard (200..<300).contains(http.statusCode), data.count <= 8 * 1024 * 1024 else {
            throw CloudFailure("同步服务返回错误（\(http.statusCode)）。")
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    static func identifier(_ text: String) -> UUID {
        let hex = SHA256.hash(data: Data(text.utf8)).prefix(16).map { String(format: "%02x", $0) }
        return UUID(uuidString: [0..<4, 4..<6, 6..<8, 8..<10, 10..<16].map { hex[$0].joined() }.joined(separator: "-"))!
    }

    static func base64URL(_ bytes: Data) -> String {
        bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func identity(site: URL, result: CloudJSON?) throws -> CloudSession {
        guard let token = result?["token"] as? String, let sessionID = result?["sessionId"] as? String,
              let user = result?["user"] as? CloudJSON, let uid = user["id"] as? String, let email = user["email"] as? String
        else { throw CloudFailure("未收到完整的登录凭据。") }
        return CloudSession(site: site, token: token, sessionID: sessionID, userID: uid, email: email)
    }
}
