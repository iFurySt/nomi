import Foundation
import Observation

@MainActor @Observable
final class MobileCloud {
    private(set) var session: CloudSession?
    private(set) var replica = CloudReplica()
    private(set) var notes: [Manuscript] = []
    private(set) var spaces: [(id: String, name: String)] = []
    private(set) var busy = false
    private(set) var conflict = false
    var message: String?
    private var cache: URL?
    private var wake: Task<Void, Never>?

    init() {
        do {
            session = try CredentialVault.load()
            if let session, let space = session.spaceID { try load(session, space: space) }
        } catch { message = error.localizedDescription }
    }

    private func load(_ session: CloudSession, space: String) throws {
        let scope = CloudAPI.identifier("\(session.site.absoluteString)|\(session.userID)|\(space)")
        let file = URL.applicationSupportDirectory.appending(path: "Cloud/\(scope.uuidString).json")
        let saved = try CloudReplica(at: file)
        cache = file
        replica = saved
        notes = saved.manuscripts()
    }

    private func update(_ value: CloudReplica) throws {
        guard let cache else { throw CloudFailure("文稿同步尚未就绪。") }
        try value.persist(at: cache)
        replica = value
        notes = value.manuscripts()
    }

    func signIn(site: URL, email: String, password: String) async throws {
        guard !busy, session == nil else { throw CloudFailure("登录正在进行。") }
        busy = true
        defer { busy = false }
        let result = try await CloudAPI.request(site, "auth/login", method: "POST", body: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password,
            "deviceId": CloudAPI.deviceID, "deviceName": "Nomi · iPhone"
        ]) as? CloudJSON
        try await accept(CloudAPI.identity(site: site, result: result))
    }

    func useProvider(_ provider: String, authorize: (String, String) async throws -> String) async throws {
        guard !busy else { throw CloudFailure("请稍后再试。") }
        busy = true
        defer { busy = false }
        let site = session?.site ?? CloudAPI.mobileSite
        let token = session?.token
        var body: CloudJSON = ["provider": provider, "deviceId": CloudAPI.deviceID]
        let start = try await CloudAPI.request(site, "auth/native/challenge", token: token, method: "POST", body: body) as? CloudJSON
        guard let nonce = start?["nonce"] as? String, let client = start?["clientId"] as? String else { throw LibraryError.unsupported }
        body["nonce"] = nonce
        body["idToken"] = try await authorize(nonce, client)
        let result = try await CloudAPI.request(site, "auth/native/exchange", token: token, method: "POST", body: body) as? CloudJSON
        if token == nil { try await accept(CloudAPI.identity(site: site, result: result)) }
        else if result?["linked"] as? Bool != true { throw LibraryError.unsupported }
    }

    private func accept(_ identity: CloudSession) async throws {
        try CredentialVault.save(identity)
        session = identity
        try await listSpaces()
    }

    func listSpaces() async throws {
        guard let session else { return }
        let result = try await CloudAPI.request(session.site, "v1/spaces", token: session.token)
        guard let list = result as? [CloudJSON] else { throw LibraryError.unsupported }
        spaces = try list.map {
            guard let id = $0["id"] as? String, let name = $0["name"] as? String else { throw LibraryError.unsupported }
            return (id, name)
        }
        if spaces.isEmpty {
            let created = try await CloudAPI.request(session.site, "v1/spaces", token: session.token, method: "POST", body: ["name": "我的文稿"]) as? CloudJSON
            guard let id = created?["id"] as? String else { throw LibraryError.unsupported }
            spaces = [(id, "我的文稿")]
        }
        if spaces.count == 1 { try bind(spaces[0].id) }
    }

    func bind(_ id: String) throws {
        guard var identity = session, identity.spaceID == nil, spaces.contains(where: { $0.id == id }) else { return }
        identity.spaceID = id
        try load(identity, space: id)
        try CredentialVault.save(identity)
        session = identity
        message = nil
    }

    func deleteAccount() async throws {
        guard !busy, let identity = session else { throw CloudFailure("请稍后再试。") }
        busy = true
        defer { busy = false }
        let remote = try await CloudAPI.request(identity.site, "v1/spaces", token: identity.token)
        guard let libraries = remote as? [CloudJSON] else { throw LibraryError.unsupported }
        let result = try await CloudAPI.request(identity.site, "v1/me", token: identity.token, method: "DELETE", body: ["confirm": "DELETE"])
        guard (result as? CloudJSON)?["deleted"] as? Bool == true else { throw LibraryError.unsupported }
        for library in libraries {
            if let space = library["id"] as? String {
                let scope = CloudAPI.identifier("\(identity.site.absoluteString)|\(identity.userID)|\(space)")
                let file = URL.applicationSupportDirectory.appending(path: "Cloud/\(scope.uuidString).json")
                if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            }
        }
        try clearSession()
    }

    func signOut() async throws {
        guard !busy, let identity = session else { return }
        try clearSession()
        _ = try? await CloudAPI.request(identity.site, "v1/sessions/" + identity.sessionID, token: identity.token, method: "DELETE")
    }

    private func clearSession() throws {
        try CredentialVault.save(nil)
        wake?.cancel()
        session = nil
        cache = nil
        replica = CloudReplica()
        notes = []
        spaces = []
        conflict = false
        message = nil
    }

    @discardableResult func save(_ draft: Manuscript, original: Manuscript?) throws -> UUID {
        var next = replica
        let id = try next.edit(draft, original: original)
        try update(next)
        schedule()
        return CloudAPI.identifier(id)
    }

    func move(_ note: Manuscript, to parentID: UUID?) throws {
        var next = replica
        try next.move(note, to: parentID)
        try update(next)
        schedule()
    }

    func remove(_ note: Manuscript) throws {
        var next = replica
        try next.remove(note)
        try update(next)
        schedule()
    }

    func pause() { wake?.cancel() }

    private func schedule() {
        // Start after a quiet explicit save; the foreground sweep also bounds continuous work.
        wake?.cancel()
        wake = Task {
            do { try await Task.sleep(for: .seconds(3)) } catch { return }
            await sync()
        }
    }

    private func snapshot(_ identity: CloudSession, _ space: String) async throws -> CloudReplica {
        let raw = try await CloudAPI.request(identity.site, "v1/spaces/\(space)/snapshot", token: identity.token) as? CloudJSON
        guard raw?["protocol"] as? String == "nomi-sync/v1", let cursor = raw?["cursor"] as? Int,
              let records = raw?["records"] as? [CloudJSON], cursor >= 0 else { throw LibraryError.unsupported }
        var result = CloudReplica()
        result.initialized = true
        result.cursor = cursor
        result.records = records
        return result
    }

    func sync() async {
        guard !busy, !conflict, let identity = session, let space = identity.spaceID, cache != nil else { return }
        busy = true
        defer { busy = false }
        do {
            while let batch = replica.pending.first {
                var wire = batch
                wire.removeValue(forKey: "updatedAt")
                let receipt = try await CloudAPI.request(identity.site, "v1/spaces/\(space)/commit",
                                                         token: identity.token, method: "POST", body: wire) as? CloudJSON
                guard let versions = receipt?["versions"] as? [CloudJSON], let mutations = batch["mutations"] as? [CloudJSON],
                      versions.count == mutations.count, let sequence = receipt?["sequence"] as? Int, sequence > 0 else {
                    throw LibraryError.unsupported
                }
                // Receipt and dequeue are a single disk write. Only a pull advances the read cursor.
                var next = replica
                var base = Dictionary(next.records.map { (CloudReplica.key($0), $0) }, uniquingKeysWith: { _, last in last })
                let acknowledged = Dictionary(versions.map { (CloudReplica.key($0), $0) }, uniquingKeysWith: { _, last in last })
                for var mutation in mutations {
                    let key = CloudReplica.key(mutation)
                    guard let version = acknowledged[key]?["version"] as? Int,
                          let previous = mutation.removeValue(forKey: "baseVersion") as? Int,
                          version == previous + 1 || (version == previous && version > 0) else { throw LibraryError.unsupported }
                    if version >= (base[key]?["version"] as? Int ?? 0) {
                        mutation["version"] = version
                        mutation["updatedAt"] = batch["updatedAt"]
                        base[key] = mutation
                    }
                }
                next.records = Array(base.values)
                next.pending.removeFirst()
                try update(next)
            }
            if !replica.initialized {
                var next = try await snapshot(identity, space)
                next.pending = replica.pending
                try update(next)
            } else {
                try await pull(identity, space)
            }
            message = nil
        } catch LibraryError.conflict {
            conflict = true
            message = "另一台设备也修改了文稿，你的修改已保留。"
        } catch { message = error.localizedDescription }
    }

    private func pull(_ identity: CloudSession, _ space: String) async throws {
        var more = true
        while more {
            let page: CloudJSON?
            do {
                page = try await CloudAPI.request(identity.site, "v1/spaces/\(space)/changes?after=\(replica.cursor)&limit=50",
                                                  token: identity.token) as? CloudJSON
            } catch CloudHTTP.staleCursor {
                var next = try await snapshot(identity, space)
                next.pending = replica.pending
                try update(next)
                return
            }
            guard page?["protocol"] as? String == "nomi-sync/v1", let cursor = page?["cursor"] as? Int,
                  let batches = page?["changes"] as? [CloudJSON], let hasMore = page?["hasMore"] as? Bool,
                  cursor == replica.cursor + batches.count, !hasMore || !batches.isEmpty else { throw LibraryError.unsupported }
            if batches.isEmpty { return }
            var next = replica
            var records = Dictionary(next.records.map { (CloudReplica.key($0), $0) }, uniquingKeysWith: { _, last in last })
            for batch in batches {
                guard batch["sequence"] as? Int == next.cursor + 1, let updates = batch["records"] as? [CloudJSON] else { throw LibraryError.unsupported }
                for row in updates {
                    let key = CloudReplica.key(row)
                    guard let version = row["version"] as? Int else { throw LibraryError.unsupported }
                    if version >= (records[key]?["version"] as? Int ?? 0) { records[key] = row }
                }
                next.cursor += 1
            }
            next.records = Array(records.values)
            try update(next)
            more = hasMore
        }
    }

    func resolveKeepingCopies(in library: Library) async throws {
        guard !busy, conflict, let identity = session, let space = identity.spaceID else { return }
        busy = true
        defer { busy = false }
        let fresh = try await snapshot(identity, space)
        guard let cache else { throw LibraryError.unsupported }
        try replica.persist(at: cache.deletingPathExtension().appendingPathExtension("conflict.json"))
        let keys = Set(replica.pending.flatMap { ($0["mutations"] as? [CloudJSON] ?? []).map(CloudReplica.key) })
        for note in notes where !keys.isDisjoint(with: note.cloudVersions.keys) {
            var copy = Manuscript()
            copy.title = note.title
            copy.body = note.body
            try library.save(copy)
        }
        try update(fresh)
        conflict = false
        message = nil
    }
}
