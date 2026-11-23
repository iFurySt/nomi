import SwiftUI
import AuthenticationServices

struct CloudPanel: View {
    let cloud: MobileCloud
    let library: Library
    @Environment(\.webAuthenticationSession) private var web
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var email = ""
    @State private var password = ""
    @State private var working = false
    @State private var problem: String?
    @State private var linked: Set<String> = []
    @FocusState private var passwordFocused: Bool

    var body: some View {
        NavigationStack {
            Group {
                if let session = cloud.session { settings(session) }
                else { login }
            }
            .navigationTitle(cloud.session == nil ? "" : "个人设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if cloud.session != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button {
                                UIPasteboard.general.string = versionDescription
                            } label: {
                                Label(versionDescription, systemImage: "document.on.document")
                            }
                        } label: {
                            Label("版本信息", systemImage: "info.circle")
                        }
                        .accessibilityIdentifier("versionInfo")
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("关闭")
                }
            }
            .disabled(working)
            .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        }
        .interactiveDismissDisabled(working)
        .task(id: cloud.session?.sessionID) {
            linked = []
            if let session = cloud.session,
               let result = try? await CloudAPI.request(session.site, "v1/identities", token: session.token) as? [String],
               cloud.session?.sessionID == session.sessionID { linked = Set(result) }
        }
    }

    private var versionDescription: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        return "Nomi v\(version) (\(build))"
    }

    private var login: some View {
        ScrollView {
            VStack(spacing: 14) {
                Image("NomiMark").resizable().scaledToFit().frame(width: 42, height: 42).accessibilityHidden(true)
                Text("登录 Nomi").font(.largeTitle.bold()).padding(.bottom, 12)
                VStack(spacing: 0) {
                    TextField("邮箱", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                        .autocorrectionDisabled().submitLabel(.next).onSubmit { passwordFocused = true }
                        .accessibilityIdentifier("loginEmail").padding(14)
                    Divider().padding(.leading, 14)
                    SecureField("密码", text: $password)
                        .textContentType(.password).focused($passwordFocused).submitLabel(.go)
                        .onSubmit { submitPassword() }.accessibilityIdentifier("loginPassword").padding(14)
                }.background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 15))
                Button(action: submitPassword) {
                    Text("登录").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 46)
                }
                    .background(Color.primary, in: Capsule())
                    .foregroundStyle(Color(uiColor: .systemBackground))
                    .disabled(email.isEmpty || password.isEmpty)
                    .opacity(email.isEmpty || password.isEmpty ? 0.55 : 1)
                    .accessibilityIdentifier("passwordSignIn")
                HStack { Rectangle().frame(height: 0.5); Text("或").font(.footnote); Rectangle().frame(height: 0.5) }
                    .foregroundStyle(.secondary).padding(.vertical, 3)
                NativeAppleButton(dark: scheme == .dark) { provider("apple") }
                    .frame(height: 46).id(scheme).accessibilityIdentifier("appleSignIn")
                Button { provider("google") } label: {
                    HStack { Image("GoogleMark").resizable().scaledToFit().frame(width: 19, height: 19); Text("使用 Google 登录").fontWeight(.medium) }
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .overlay(Capsule().strokeBorder(.secondary.opacity(0.45)))
                }.buttonStyle(.plain).accessibilityIdentifier("googleSignIn")
                feedback
            }.frame(maxWidth: 370).padding(22).frame(maxWidth: .infinity)
        }.scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private var feedback: some View {
        if let message = problem ?? cloud.message { Text(message).font(.footnote).foregroundStyle(.secondary) }
    }

    private func settings(_ session: CloudSession) -> some View {
        List {
            Section {
                LabeledContent { Text(session.email).textSelection(.enabled) } label: { Label("账号", systemImage: "person.crop.circle") }
                ForEach(linked.sorted(), id: \.self) { name in
                    LabeledContent(name == "apple" ? "Apple" : "Google", value: "已关联")
                }
            }
            if session.spaceID == nil || !cloud.replica.pending.isEmpty || cloud.conflict {
                Section("文稿同步") {
                    if session.spaceID != nil {
                        if !cloud.replica.pending.isEmpty { Text("待同步 · \(cloud.replica.pending.count)").foregroundStyle(.secondary) }
                        if cloud.conflict {
                            Button("保留修改副本并使用同步版本") { perform { try await cloud.resolveKeepingCopies(in: library) } }
                        }
                    } else {
                        ForEach(cloud.spaces, id: \.id) { space in
                            Button(space.name) { perform { try cloud.bind(space.id); await cloud.sync() } }
                        }
                        if cloud.spaces.isEmpty { Button("读取文稿") { perform { try await cloud.listSpaces(); await cloud.sync() } } }
                    }
                }
            }
            if problem != nil || cloud.message != nil { Section { feedback } }
            Section {
                Button(role: .destructive) { perform { try await cloud.signOut(); dismiss() } } label: {
                    Label("退出登录", systemImage: "rectangle.portrait.and.arrow.right")
                }.disabled(cloud.busy)
            }
        }
    }

    private func submitPassword() {
        guard !email.isEmpty, !password.isEmpty else { return }
        passwordFocused = false
        perform {
            try await cloud.signIn(site: CloudAPI.mobileSite, email: email, password: password)
            password = ""
            await cloud.sync()
            if cloud.session?.spaceID != nil { dismiss() }
        }
    }

    private func provider(_ name: String) {
        perform {
            try await cloud.useProvider(name) { nonce, client in
                if name == "apple" {
                    guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                        .first(where: { $0.activationState == .foregroundActive })?.keyWindow else { throw CloudFailure("无法显示 Apple 登录。") }
                    return try await AppleAuthorization(window: window).credential(nonce: nonce)
                }
                return try await GoogleAuthorization.credential(nonce: nonce, client: client) { url, scheme in
                    try await web.authenticate(using: url, callbackURLScheme: scheme)
                }
            }
            await cloud.sync()
            if cloud.session?.spaceID != nil { dismiss() }
        }
    }

    private func perform(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !working else { return }
        working = true
        problem = nil
        Task {
            defer { working = false }
            do { try await operation() }
            catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin { }
            catch let error as ASAuthorizationError where error.code == .canceled { }
            catch is CancellationError { }
            catch { problem = error.localizedDescription }
        }
    }
}

private struct NativeAppleButton: UIViewRepresentable {
    let dark: Bool
    let action: () -> Void
    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .signIn, style: dark ? .white : .black)
        button.cornerRadius = 23
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        return button
    }
    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {}
}
