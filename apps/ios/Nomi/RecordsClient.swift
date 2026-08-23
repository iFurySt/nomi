import Foundation
import Security

struct NomiUser: Codable, Identifiable { let id: String; let email: String; let displayName: String; enum CodingKeys: String,CodingKey { case id,email; case displayName="display_name" } }
struct NomiHousehold: Codable, Identifiable { let id: String; let name: String; let role: String }
struct AuthSession: Codable { let token: String; let expiresAt: String; let user: NomiUser; let household: NomiHousehold; enum CodingKeys: String,CodingKey { case token,user,household; case expiresAt="expires_at" } }
struct PersonModel: Codable, Identifiable, Hashable { let id: String; let displayName: String; let relationship: String; enum CodingKeys: String,CodingKey { case id,relationship; case displayName="display_name" } }
struct AgentResultModel: Codable { let title: String; let answer: String; let summary: String; let changes: String; let currentAssessment: String; let openQuestions: [String]; let citations: [String]; enum CodingKeys: String,CodingKey { case title,answer,summary,changes,citations; case currentAssessment="current_assessment"; case openQuestions="open_questions" } }
struct AssetModel: Codable, Identifiable { let id: String; let personID: String?; let originalName: String; let mimeType: String; let status: String; let analysis: AgentResultModel?; let createdAt: String; enum CodingKeys: String,CodingKey { case id,status,analysis; case personID="person_id"; case originalName="original_name"; case mimeType="mime_type"; case createdAt="created_at" } }
struct JobModel: Codable, Identifiable { let id: String; let personID: String?; let kind: String; let status: String; let result: AgentResultModel?; let error: String?; let createdAt: String; enum CodingKeys: String,CodingKey { case id,kind,status,result,error; case personID="person_id"; case createdAt="created_at" } }
struct KnowledgeEntryModel: Codable, Identifiable { let id: String; let personID: String?; let kind: String; let title: String; let summary: String; let sourcePath: String; let result: AgentResultModel?; let occurredOn: String?; let updatedAt: String; enum CodingKeys: String,CodingKey { case id,kind,title,summary,result; case personID="person_id"; case sourcePath="source_path"; case occurredOn="occurred_on"; case updatedAt="updated_at" } }
struct ThreadModel: Codable, Identifiable { let id: String; let personID: String?; let title: String; let updatedAt: String; enum CodingKeys: String,CodingKey { case id,title; case personID="person_id"; case updatedAt="updated_at" } }
struct MessageModel: Codable, Identifiable { let id: String; let role: String; let content: String; let citations: [String]?; let status: String; let createdAt: String; enum CodingKeys: String,CodingKey { case id,role,content,citations,status; case createdAt="created_at" } }
struct UploadResponse: Codable { let asset: AssetModel; let job: JobModel }
struct MessageResponse: Codable { let message: MessageModel; let job: JobModel }
struct HouseholdInvite: Codable { let inviteCode: String; let expiresAt: String; enum CodingKeys: String,CodingKey { case inviteCode="invite_code"; case expiresAt="expires_at" } }

enum NomiAPIError: LocalizedError {
    case server(String)
    case transport(String)
    case invalidResponse
    var errorDescription: String? { switch self { case .server(let code): return code; case .transport(let endpoint): return "无法连接服务器（\(endpoint)）"; case .invalidResponse: return "服务器返回无效响应" } }
}

enum NomiAPIClient {
    static var baseURL: URL {
        if let value=ProcessInfo.processInfo.environment["NOMI_API_BASE_URL"],let url=URL(string:value) { return url }
        return URL(string:"https://nomi.ifuryst.com")!
    }

    static func register(email:String,password:String,displayName:String,householdName:String,inviteCode:String) async throws -> AuthSession {
        try await json(path:"auth/register",method:"POST",body:["email":email,"password":password,"display_name":displayName,"household_name":householdName,"invite_code":inviteCode],token:nil)
    }
    static func login(email:String,password:String) async throws -> AuthSession { try await json(path:"auth/login",method:"POST",body:["email":email,"password":password],token:nil) }
    static func logout(token:String) async throws { let _: EmptyResponse = try await json(path:"v1/auth/logout",method:"POST",token:token,allowEmpty:true) }
    static func createInvite(token:String) async throws -> HouseholdInvite { try await json(path:"v1/household/invites",method:"POST",token:token) }
    static func people(token:String) async throws -> [PersonModel] { let response: PeopleResponse=try await json(path:"v1/people",token:token);return response.people }
    static func createPerson(token:String,name:String,relationship:String) async throws -> PersonModel { try await json(path:"v1/people",method:"POST",body:["display_name":name,"relationship":relationship],token:token) }
    static func assets(token:String,personID:String?) async throws -> [AssetModel] { let response: AssetsResponse=try await json(path:path("v1/assets",personID),token:token);return response.assets }
    static func jobs(token:String,personID:String?) async throws -> [JobModel] { let response: JobsResponse=try await json(path:path("v1/jobs",personID),token:token);return response.jobs }
    static func knowledge(token:String,personID:String?) async throws -> [KnowledgeEntryModel] { let response: KnowledgeResponse=try await json(path:path("v1/knowledge",personID),token:token);return response.entries }
    static func threads(token:String,personID:String?) async throws -> [ThreadModel] { let response: ThreadsResponse=try await json(path:path("v1/threads",personID),token:token);return response.threads }
    static func createThread(token:String,personID:String?,title:String) async throws -> ThreadModel { var body=["title":title];if let personID{body["person_id"]=personID};return try await json(path:"v1/threads",method:"POST",body:body,token:token) }
    static func messages(token:String,threadID:String) async throws -> [MessageModel] { let response: MessagesResponse=try await json(path:"v1/threads/\(threadID)/messages",token:token);return response.messages }
    static func send(token:String,threadID:String,content:String) async throws -> MessageResponse { try await json(path:"v1/threads/\(threadID)/messages",method:"POST",body:["content":content],token:token) }

    static func upload(token:String,personID:String?,data:Data,name:String,mimeType:String) async throws -> UploadResponse {
        let boundary="NomiBoundary-\(UUID().uuidString)";var body=Data()
        func append(_ value:String){body.append(Data(value.utf8))}
        if let personID { append("--\(boundary)\r\nContent-Disposition: form-data; name=\"person_id\"\r\n\r\n\(personID)\r\n") }
        append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name.replacingOccurrences(of:"\"",with:""))\"\r\nContent-Type: \(mimeType)\r\n\r\n");body.append(data);append("\r\n--\(boundary)--\r\n")
        var request=URLRequest(url:endpointURL("v1/assets"));request.httpMethod="POST";request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization");request.setValue("multipart/form-data; boundary=\(boundary)",forHTTPHeaderField:"Content-Type");request.httpBody=body;request.timeoutInterval=90
        return try await perform(request)
    }

    private static func path(_ base:String,_ personID:String?)->String { guard let personID else{return base};var components=URLComponents();components.path="/"+base;components.queryItems=[URLQueryItem(name:"person_id",value:personID)];return String(components.string!.dropFirst()) }
    private static func endpointURL(_ path:String)->URL { URL(string:path,relativeTo:baseURL.appending(path:"/"))! }
    private static func json<T:Decodable>(path:String,method:String="GET",token:String?,allowEmpty:Bool=false) async throws -> T { var request=URLRequest(url:endpointURL(path));request.httpMethod=method;request.timeoutInterval=90;if let token{request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")};return try await perform(request,allowEmpty:allowEmpty) }
    private static func json<T:Decodable,B:Encodable>(path:String,method:String="GET",body:B,token:String?,allowEmpty:Bool=false) async throws -> T { var request=URLRequest(url:endpointURL(path));request.httpMethod=method;request.timeoutInterval=90;if let token{request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")};request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try JSONEncoder().encode(body);return try await perform(request,allowEmpty:allowEmpty) }
    private static func perform<T:Decodable>(_ request:URLRequest,allowEmpty:Bool=false) async throws -> T { let data:Data;let response:URLResponse;do{(data,response)=try await URLSession.shared.data(for:request)}catch{throw NomiAPIError.transport(request.url?.host ?? baseURL.absoluteString)};guard let http=response as? HTTPURLResponse else{throw NomiAPIError.invalidResponse};guard (200..<300).contains(http.statusCode) else{let code=(try? JSONDecoder().decode(ErrorResponse.self,from:data).error) ?? "HTTP \(http.statusCode)";throw NomiAPIError.server(code)};if allowEmpty&&data.isEmpty{return EmptyResponse() as! T};return try JSONDecoder().decode(T.self,from:data) }
}

private struct ErrorResponse:Decodable{let error:String}
private struct EmptyResponse:Decodable{init(){}}
private struct PeopleResponse:Decodable{let people:[PersonModel]}
private struct AssetsResponse:Decodable{let assets:[AssetModel]}
private struct JobsResponse:Decodable{let jobs:[JobModel]}
private struct KnowledgeResponse:Decodable{let entries:[KnowledgeEntryModel]}
private struct ThreadsResponse:Decodable{let threads:[ThreadModel]}
private struct MessagesResponse:Decodable{let messages:[MessageModel]}

enum SessionKeychain {
    private static let service="com.ifuryst.nomi.session";private static let account="current"
    static func save(_ session:AuthSession) throws { let data=try JSONEncoder().encode(session);delete();let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account,kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly];let status=SecItemAdd(query as CFDictionary,nil);guard status==errSecSuccess else{throw NomiAPIError.server("keychain_save_failed")}}
    static func load()->AuthSession?{let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne];var item:CFTypeRef?;guard SecItemCopyMatching(query as CFDictionary,&item)==errSecSuccess,let data=item as? Data else{return nil};return try? JSONDecoder().decode(AuthSession.self,from:data)}
    static func delete(){let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account];SecItemDelete(query as CFDictionary)}
}
