import AuthenticationServices
import CryptoKit
import UIKit

@MainActor
final class AppleAuthorization: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<String, Error>?
    private var controller: ASAuthorizationController?
    private let anchor: UIWindow

    init(window: UIWindow) { anchor = window }

    func credential(nonce: String) async throws -> String {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        self.controller = controller
        controller.delegate = self
        controller.presentationContextProvider = self
        return try await withCheckedThrowingContinuation {
            continuation = $0
            controller.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
           let data = credential.identityToken, let token = String(data: data, encoding: .utf8) {
            finish(.success(token))
        } else { finish(.failure(CloudFailure("Apple 未返回身份凭据。"))) }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) { finish(.failure(error)) }
    private func finish(_ result: Result<String, Error>) {
        continuation?.resume(with: result)
        continuation = nil
        controller = nil
    }
}

enum GoogleAuthorization {
    private static func secret() throws -> String {
        var data = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, data.count, &data) == errSecSuccess else { throw CloudFailure("无法开始登录。") }
        return CloudAPI.base64URL(Data(data))
    }

    static func credential(nonce: String, client: String, open: (URL, String) async throws -> URL) async throws -> String {
        guard client.range(of: #"^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$"#, options: .regularExpression) != nil else {
            throw CloudFailure("Google 登录配置无效。")
        }
        let scheme = client.split(separator: ".").reversed().joined(separator: ".")
        let redirect = scheme + ":/oauthredirect"
        let verifier = try secret(), state = try secret()
        let challenge = CloudAPI.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        url.queryItems = ["client_id":client, "redirect_uri":redirect, "response_type":"code", "scope":"openid email", "prompt":"select_account",
                          "state":state, "nonce":nonce, "code_challenge":challenge, "code_challenge_method":"S256"].map(URLQueryItem.init)
        let callback = try await open(url.url!, scheme)
        guard let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false),
              parts.scheme == scheme, parts.host == nil, parts.path == "/oauthredirect",
              parts.queryItems?.first(where: { $0.name == "state" })?.value == state else { throw CloudFailure("Google 登录回调无效。") }
        if parts.queryItems?.contains(where: { $0.name == "error" && $0.value == "access_denied" }) == true { throw CancellationError() }
        guard let code = parts.queryItems?.first(where: { $0.name == "code" })?.value else { throw CloudFailure("Google 未返回授权。") }
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = ["client_id":client, "code":code, "code_verifier":verifier, "redirect_uri":redirect,
                           "grant_type":"authorization_code"].map(URLQueryItem.init)
        request.httpBody = Data((form.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try JSONSerialization.jsonObject(with: data) as? CloudJSON, let token = json["id_token"] as? String else {
            throw CloudFailure("Google 授权已过期，请重试。")
        }
        return token
    }
}
