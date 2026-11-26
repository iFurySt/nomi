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
    @State private var confirmDeletion = false
    @State private var accountDeleted = false
    @State private var showAppleInstructions = false
    @Environment(\.openURL) private var openURL
    @State private var working = false
    @State private var problem: String?
    @State private var linked: Set<String>?
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
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Link(destination: URL(string: "https://nomi.ifuryst.com/support/")!) {
                            Label("联系支持", systemImage: "questionmark.circle")
                        }
                        Link(destination: URL(string: "https://nomi.ifuryst.com/privacy/")!) {
                            Label("隐私政策", systemImage: "lock")
                        }
                        Divider()
                        Button {
                            UIPasteboard.general.string = versionDescription
                        } label: {
                            Label(versionDescription, systemImage: "document.on.document")
                        }
                    } label: {
                        Label("帮助与信息", systemImage: "info.circle")
                    }
                    .accessibilityIdentifier("versionInfo")
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("关闭")
                }
            }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .alert("永久注销 Nomi 账号？", isPresented: $confirmDeletion) {
            Button("取消", role: .cancel) {}
            Button("永久注销", role: .destructive) {
                let needsInstructions = linked?.contains("apple") ?? true
                perform {
                    try await cloud.deleteAccount()
                    showAppleInstructions = needsInstructions
                    accountDeleted = true
                }
            }
        } message: {
            Text("将删除此账号的云端文稿、附件和版本记录，并退出所有设备。本机独立文稿和其他设备已有的本地副本会保留。此操作无法撤销。")
        }
        .alert("账号已注销", isPresented: $accountDeleted) {
            if showAppleInstructions {
                Button("查看 Apple 指引") {
                    openURL(URL(string: "https://support.apple.com/102571")!)
                    dismiss()
                }
            }
            Button("完成") { dismiss() }
        } message: {
            if showAppleInstructions {
                Text("如果曾使用 Apple 登录，可在 Apple 账户中停止使用 Nomi。")
            }
        }
        .interactiveDismissDisabled(working)
        .task(id: cloud.session?.sessionID) {
            linked = nil
            if let session = cloud.session,
               let result = try? await CloudAPI.request(session.site, "v1/identities", token: session.token) as? [String],
               cloud.session?.sessionID == session.sessionID {
                linked = Set(result)
            }
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
                generalLink.font(.footnote)
                feedback
            }.frame(maxWidth: 370).padding(22).frame(maxWidth: .infinity)
        }.scrollDismissesKeyboard(.interactively)
    }

    private var generalLink: some View {
        NavigationLink {
            GeneralSettings()
        } label: {
            Label("通用", systemImage: "gearshape")
        }
        .accessibilityIdentifier("generalSettings")
    }

    @ViewBuilder private var feedback: some View {
        if let message = problem ?? cloud.message { Text(message).font(.footnote).foregroundStyle(.secondary) }
    }

    private func settings(_ session: CloudSession) -> some View {
        List {
            Section {
                LabeledContent { Text(session.email).textSelection(.enabled) } label: { Label("账号", systemImage: "person.crop.circle") }
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
            Section {
                generalLink
                NavigationLink {
                    List {
                        if let problem {
                            Section { Text(problem).foregroundStyle(.secondary) }
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .background(Color(uiColor: .systemGroupedBackground))
                    .safeAreaInset(edge: .bottom) {
                        accountAction {
                            confirmDeletion = true
                        } label: {
                            Text("永久注销账号")
                        }
                        .accessibilityIdentifier("deleteAccount")
                    }
                    .navigationTitle("数据管理")
                    .navigationBarTitleDisplayMode(.inline)
                } label: {
                    Label("数据管理", systemImage: "archivebox")
                }
                .accessibilityIdentifier("dataControls")
            }
            Section {
                Button(role: .destructive) {
                    perform { try await cloud.signOut(); dismiss() }
                } label: {
                    Label("退出登录", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .disabled(cloud.busy)
            }
            if problem != nil || cloud.message != nil { Section { feedback } }
        }
    }

    private func accountAction<Content: View>(
        action: @escaping () -> Void, @ViewBuilder label: () -> Content
    ) -> some View {
        Button(role: .destructive, action: action) {
            label()
                .foregroundStyle(.red)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(cloud.busy)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color(uiColor: .systemGroupedBackground))
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
