import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

@MainActor
final class NomiAppModel: ObservableObject {
    @Published var session: AuthSession?
    @Published var people: [PersonModel] = []
    @Published var selectedPersonID: String?
    @Published var assets: [AssetModel] = []
    @Published var jobs: [JobModel] = []
    @Published var knowledge: [KnowledgeEntryModel] = []
    @Published var threads: [ThreadModel] = []
    @Published var activeThread: ThreadModel?
    @Published var messages: [MessageModel] = []
    @Published var householdInvite: HouseholdInvite?
    @Published var isBusy = false
    @Published var errorMessage: String?

    init() {
        #if DEBUG
        if ProcessInfo.processInfo.environment["NOMI_UI_TEST_RESET_SESSION"] == "1" {
            SessionKeychain.delete()
        }
        #endif
        session=SessionKeychain.load()
    }
    var token: String? { session?.token }

    func login(email:String,password:String) async { await authenticate { try await NomiAPIClient.login(email:email,password:password) } }
    func register(email:String,password:String,name:String,household:String,invite:String) async { await authenticate { try await NomiAPIClient.register(email:email,password:password,displayName:name,householdName:household,inviteCode:invite) } }
    private func authenticate(_ operation:() async throws->AuthSession) async { isBusy=true;errorMessage=nil;defer{isBusy=false};do{let value=try await operation();try SessionKeychain.save(value);session=value;await refreshAll()}catch{errorMessage=error.localizedDescription} }
    func logout() async { if let token { try? await NomiAPIClient.logout(token:token) };SessionKeychain.delete();session=nil;people=[];assets=[];jobs=[];knowledge=[];threads=[];messages=[] }

    func refreshAll() async { guard let token else{return};do{async let loadedPeople=NomiAPIClient.people(token:token);async let loadedAssets=NomiAPIClient.assets(token:token,personID:selectedPersonID);async let loadedJobs=NomiAPIClient.jobs(token:token,personID:selectedPersonID);async let loadedKnowledge=NomiAPIClient.knowledge(token:token,personID:selectedPersonID);async let loadedThreads=NomiAPIClient.threads(token:token,personID:selectedPersonID);let(p,a,j,k,t)=try await(loadedPeople,loadedAssets,loadedJobs,loadedKnowledge,loadedThreads);people=p;assets=a;jobs=j;knowledge=k;threads=t;if let activeThread, !t.contains(where:{$0.id==activeThread.id}){self.activeThread=nil;messages=[]};if self.activeThread==nil{self.activeThread=t.first};if let thread=self.activeThread{messages=try await NomiAPIClient.messages(token:token,threadID:thread.id)}}catch{errorMessage=error.localizedDescription} }
    func selectPerson(_ id:String?) async { selectedPersonID=id;activeThread=nil;messages=[];await refreshAll() }
    func createPerson(name:String,relationship:String) async { guard let token else{return};do{_ = try await NomiAPIClient.createPerson(token:token,name:name,relationship:relationship);await refreshAll()}catch{errorMessage=error.localizedDescription} }
    func createInvite() async { guard let token else{return};do{householdInvite=try await NomiAPIClient.createInvite(token:token)}catch{errorMessage=error.localizedDescription} }
    func upload(data:Data,name:String,mimeType:String) async { guard let token else{return};isBusy=true;errorMessage=nil;defer{isBusy=false};do{_ = try await NomiAPIClient.upload(token:token,personID:selectedPersonID,data:data,name:name,mimeType:mimeType);await refreshAll()}catch{errorMessage=error.localizedDescription} }
    func openThread(_ thread:ThreadModel) async { activeThread=thread;guard let token else{return};do{messages=try await NomiAPIClient.messages(token:token,threadID:thread.id)}catch{errorMessage=error.localizedDescription} }
    func newThread() async { guard let token else{return};do{let scope=people.first(where:{$0.id==selectedPersonID})?.displayName ?? "家庭";let thread=try await NomiAPIClient.createThread(token:token,personID:selectedPersonID,title:"关于\(scope)的对话");activeThread=thread;messages=[];await refreshAll()}catch{errorMessage=error.localizedDescription} }
    func send(_ content:String) async { guard let token else{return};if activeThread==nil{await newThread()};guard let thread=activeThread else{return};do{_ = try await NomiAPIClient.send(token:token,threadID:thread.id,content:content);messages=try await NomiAPIClient.messages(token:token,threadID:thread.id);jobs=try await NomiAPIClient.jobs(token:token,personID:selectedPersonID)}catch{errorMessage=error.localizedDescription} }
}

struct ContentView: View {
    @StateObject private var model=NomiAppModel()
    var body: some View { Group { if model.session==nil { AuthView(model:model) } else { MainShell(model:model) } }.task(id:model.session?.token){guard model.session != nil else{return};await model.refreshAll();while !Task.isCancelled{try? await Task.sleep(for:.seconds(2));await model.refreshAll()}}.alert("出现问题",isPresented:Binding(get:{model.errorMessage != nil},set:{if !$0{model.errorMessage=nil}})){Button("知道了",role:.cancel){}}message:{Text(model.errorMessage ?? "未知错误")} }
}

struct AuthView: View {
    @ObservedObject var model:NomiAppModel
    @State private var isRegister=false;@State private var email="";@State private var password="";@State private var name="";@State private var household="";@State private var invite=""
    var body: some View { NavigationStack { ScrollView { VStack(alignment:.leading,spacing:20){Spacer().frame(height:36);Image(systemName:"heart.text.clipboard").font(.system(size:48)).symbolRenderingMode(.hierarchical);Text("Nomi").font(.largeTitle.bold());VStack(spacing:12){TextField("邮箱",text:$email).textContentType(.emailAddress).textInputAutocapitalization(.never).keyboardType(.emailAddress).textFieldStyle(.roundedBorder).accessibilityIdentifier("auth-email");SecureField("密码",text:$password).textContentType(isRegister ? .newPassword:.password).textFieldStyle(.roundedBorder).accessibilityIdentifier("auth-password");if isRegister{TextField("名字",text:$name).textFieldStyle(.roundedBorder);TextField("家庭名称（可选）",text:$household).textFieldStyle(.roundedBorder);TextField("邀请码",text:$invite).textInputAutocapitalization(.never).textFieldStyle(.roundedBorder).accessibilityIdentifier("auth-invite")}}
                Button { Task { if isRegister{await model.register(email:email,password:password,name:name,household:household,invite:invite)}else{await model.login(email:email,password:password)} } } label:{HStack{Spacer();if model.isBusy{ProgressView().tint(.white)}else{Text(isRegister ? "创建账号":"登录").bold()};Spacer()}}.buttonStyle(.borderedProminent).controlSize(.large).disabled(model.isBusy||email.isEmpty||password.isEmpty||(isRegister&&(password.count<6||name.isEmpty||invite.isEmpty))).accessibilityIdentifier("auth-submit")
                Button(isRegister ? "返回登录":"邀请码注册"){withAnimation{isRegister.toggle()}}.frame(maxWidth:.infinity)
            }.padding(28) } }.background(Color(.systemGroupedBackground)) }
}

struct MainShell: View {
    @ObservedObject var model:NomiAppModel
    var body: some View { TabView { Tab("资料",systemImage:"tray.full"){NavigationStack{LibraryView(model:model)}};Tab("对话",systemImage:"bubble.left.and.bubble.right"){NavigationStack{ChatView(model:model)}};Tab("家庭",systemImage:"person.3"){NavigationStack{FamilyView(model:model)}} }.tint(.primary).overlay(alignment:.top){if model.isBusy{ProgressView().padding(8).background(.ultraThinMaterial,in:Capsule()).padding(.top,4)}} }
}

struct ScopePicker: View {
    @ObservedObject var model:NomiAppModel
    var body: some View { ScrollView(.horizontal,showsIndicators:false){HStack(spacing:8){scopeButton("家庭",id:nil);ForEach(model.people){person in scopeButton(person.displayName,id:person.id)}}.padding(.horizontal)} }
    private func scopeButton(_ title:String,id:String?)->some View { Button(title){Task{await model.selectPerson(id)}}.buttonStyle(.borderedProminent).tint(model.selectedPersonID==id ? .primary:.secondary.opacity(0.16)).foregroundStyle(model.selectedPersonID==id ? Color(.systemBackground):.primary) }
}

struct LibraryView: View {
    @ObservedObject var model:NomiAppModel
    @State private var showUpload=false
    private var pendingJobs:[JobModel]{model.jobs.filter{$0.kind=="ingest" && $0.status != "completed"}}
    var body: some View { VStack(spacing:12){ScopePicker(model:model);if pendingJobs.isEmpty && model.knowledge.isEmpty{ContentUnavailableView("暂无资料",systemImage:"doc.badge.plus")}else{List{ForEach(pendingJobs){job in JobRow(job:job)};ForEach(model.knowledge){entry in NavigationLink{KnowledgeDetailView(entry:entry)}label:{KnowledgeRow(entry:entry)}.accessibilityIdentifier("knowledge-entry")}}.listStyle(.plain).refreshable{await model.refreshAll()}}}.navigationTitle("资料").toolbar{ToolbarItem(placement:.topBarTrailing){Button{showUpload=true}label:{Image(systemName:"plus")}.accessibilityIdentifier("upload-open")}}.sheet(isPresented:$showUpload){UploadView(model:model)} }
}

struct JobRow: View {
    let job:JobModel
    var body: some View { VStack(alignment:.leading,spacing:6){HStack{Image(systemName:icon);Text(job.result?.title ?? (job.kind=="chat" ? "正在回答":"正在整理")).font(.headline);Spacer();statusBadge};if let result=job.result,!result.summary.isEmpty{Text(result.summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)}else if let error=job.error,!error.isEmpty{Text(error).font(.caption).foregroundStyle(.red).lineLimit(2)}}.padding(.vertical,6) }
    private var icon:String{job.kind=="chat" ? "bubble.left":"doc.text.magnifyingglass"}
    @ViewBuilder private var statusBadge:some View{switch job.status{case "queued":Text("等待").foregroundStyle(.secondary);case "processing":ProgressView();case "completed":Image(systemName:"checkmark.circle.fill").foregroundStyle(.green);default:Image(systemName:"exclamationmark.circle.fill").foregroundStyle(.red)}}
}

struct KnowledgeRow: View {
    let entry: KnowledgeEntryModel
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(entry.title)
                .font(.headline)
                .lineLimit(2)
            if !entry.summary.isEmpty {
                Text(entry.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let date = entry.occurredOn?.prefix(10) {
                Text(String(date))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 5)
    }
}

struct KnowledgeDetailView: View {
    let entry: KnowledgeEntryModel
    private var result: AgentResultModel? { entry.result }
    var body: some View {
        List {
            Section {
                Text(entry.summary)
            }
            if let result, !result.changes.isEmpty {
                Section("变化") { Text(result.changes) }
            }
            if let result, !result.currentAssessment.isEmpty {
                Section("判断") { Text(result.currentAssessment) }
            }
            if let result, !result.openQuestions.isEmpty {
                Section("待确认") {
                    ForEach(result.openQuestions, id: \.self) { Text($0) }
                }
            }
        }
        .navigationTitle(entry.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct UploadView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model:NomiAppModel
    @State private var photo:PhotosPickerItem?;@State private var showFiles=false
    var body: some View { NavigationStack { VStack(spacing:18){PhotosPicker(selection:$photo,matching:.images){UploadButtonLabel(title:"照片",icon:"photo.on.rectangle")}.onChange(of:photo){_,item in guard let item else{return};Task{if let data=try? await item.loadTransferable(type:Data.self){let contentType=item.supportedContentTypes.first ?? .image;let fileExtension=contentType.preferredFilenameExtension ?? "img";await model.upload(data:data,name:"photo-\(UUID().uuidString).\(fileExtension)",mimeType:contentType.preferredMIMEType ?? "application/octet-stream");dismiss()}}};Button{showFiles=true}label:{UploadButtonLabel(title:"文件或 PDF",icon:"folder")}.buttonStyle(.plain);Spacer()}.padding(24).navigationTitle("添加资料").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.cancellationAction){Button("取消"){dismiss()}}}.fileImporter(isPresented:$showFiles,allowedContentTypes:[.image,.pdf,.plainText],allowsMultipleSelection:false){result in guard case .success(let urls)=result,let url=urls.first else{return};Task{let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}};do{let data=try Data(contentsOf:url);let type=(try? url.resourceValues(forKeys:[.contentTypeKey]).contentType?.preferredMIMEType) ?? "application/octet-stream";await model.upload(data:data,name:url.lastPathComponent,mimeType:type);dismiss()}catch{model.errorMessage=error.localizedDescription}}} } }
}

struct UploadButtonLabel: View {
    let title:String
    let icon:String
    var body:some View{HStack{Image(systemName:icon).font(.title2);Text(title).font(.headline);Spacer();Image(systemName:"chevron.right").foregroundStyle(.tertiary)}.padding(18).background(Color(.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:18))}
}

struct ChatView: View {
    @ObservedObject var model:NomiAppModel
    @State private var text=""
    var body: some View { VStack(spacing:0){ScopePicker(model:model).padding(.bottom,8);if model.activeThread==nil{ContentUnavailableView("新对话",systemImage:"bubble.left.and.text.bubble.right");Button("开始"){Task{await model.newThread()}}.buttonStyle(.borderedProminent)}else{ScrollViewReader{proxy in ScrollView{LazyVStack(spacing:12){ForEach(model.messages){message in MessageBubble(message:message).id(message.id)}}.padding()}.onChange(of:model.messages.count){_,_ in if let id=model.messages.last?.id{withAnimation{proxy.scrollTo(id,anchor:.bottom)}}}};HStack(alignment:.bottom,spacing:10){TextField("问 Nomi",text:$text,axis:.vertical).lineLimit(1...5).textFieldStyle(.roundedBorder);Button{let value=text;text="";Task{await model.send(value)}}label:{Image(systemName:"arrow.up.circle.fill").font(.title)}.disabled(text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}.padding().background(.bar)}}.navigationTitle(model.activeThread?.title ?? "对话").toolbar{ToolbarItem(placement:.topBarTrailing){Menu{Button("新建对话"){Task{await model.newThread()}};ForEach(model.threads){thread in Button(thread.title){Task{await model.openThread(thread)}}}}label:{Image(systemName:"ellipsis.circle")}}} }
}

struct MessageBubble: View {
    let message:MessageModel
    var body: some View { VStack(alignment:message.role=="user" ? .trailing:.leading,spacing:6){Text(message.content).padding(12).background(message.role=="user" ? Color.accentColor:Color(.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:16)).foregroundStyle(message.role=="user" ? .white:.primary);if let citations=message.citations,!citations.isEmpty{Text(citations.joined(separator:" · ")).font(.caption2).foregroundStyle(.secondary)}}.frame(maxWidth:.infinity,alignment:message.role=="user" ? .trailing:.leading).padding(message.role=="user" ? .leading:.trailing,44) }
}

struct FamilyView: View {
    @ObservedObject var model:NomiAppModel
    @State private var showAdd=false
    var body: some View {
        List {
            Section("家庭") {
                LabeledContent("名称", value: model.session?.household.name ?? "")
                LabeledContent("账号", value: model.session?.user.email ?? "")
                if model.session?.household.role == "owner" {
                    Button("生成家人邀请码", systemImage: "person.badge.key") {
                        Task { await model.createInvite() }
                    }
                    if let invite = model.householdInvite {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(invite.inviteCode)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                            Text("7 天内可使用一次")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section("成员") {
                ForEach(model.people) { person in
                    VStack(alignment: .leading) {
                        Text(person.displayName)
                        if !person.relationship.isEmpty {
                            Text(person.relationship)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Button("添加成员", systemImage: "person.badge.plus") {
                    showAdd = true
                }
            }
            Section {
                Button("退出登录", role: .destructive) {
                    Task { await model.logout() }
                }
            }
        }
        .navigationTitle("家庭")
        .sheet(isPresented: $showAdd) {
            AddPersonView(model: model)
        }
    }
}

struct AddPersonView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model:NomiAppModel
    @State private var name="";@State private var relationship=""
    var body: some View { NavigationStack{Form{TextField("名字",text:$name);TextField("关系（可选）",text:$relationship)}.navigationTitle("添加成员").toolbar{ToolbarItem(placement:.cancellationAction){Button("取消"){dismiss()}};ToolbarItem(placement:.confirmationAction){Button("添加"){Task{await model.createPerson(name:name,relationship:relationship);dismiss()}}.disabled(name.isEmpty)}}} }
}
