import Foundation

/// Server records are kept verbatim so a text edit cannot discard an unfamiliar block or field.
struct CloudReplica {
    var records: [CloudJSON] = []
    var pending: [CloudJSON] = []
    var cursor = 0
    var initialized = false

    init() {}
    init(at url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? CloudJSON
        guard let records = value?["records"] as? [CloudJSON], let pending = value?["pending"] as? [CloudJSON],
              let cursor = value?["cursor"] as? Int, let initialized = value?["initialized"] as? Bool else { throw LibraryError.unsupported }
        self.records = records
        self.pending = pending
        self.cursor = cursor
        self.initialized = initialized
    }

    func persist(at url: URL) throws {
        let value: CloudJSON = ["records": records, "pending": pending, "cursor": cursor, "initialized": initialized]
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: value).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func key(_ r: CloudJSON) -> String { "\(r["kind"] ?? ""):\(r["id"] ?? "")" }

    var visible: [String: CloudJSON] {
        var map: [String: CloudJSON] = [:]
        for r in records where r["deleted"] as? Bool == false { map[Self.key(r)] = r }
        for group in pending {
            for var r in group["mutations"] as? [CloudJSON] ?? [] {
                r["version"] = (r["baseVersion"] as? Int ?? 0) + 1
                r["updatedAt"] = group["updatedAt"]
                map[Self.key(r)] = r["deleted"] as? Bool == true ? nil : r
            }
        }
        return map
    }

    func manuscripts() -> [Manuscript] {
        let map = visible
        let header = map.values.first { $0["kind"] as? String == "document" }?["data"] as? CloudJSON
        return (header?["noteOrder"] as? [String] ?? []).compactMap { id in
            guard let row = map["note:" + id], let data = row["data"] as? CloudJSON,
                  let title = data["title"] as? String,
                  let order = map["order:" + id]?["data"] as? CloudJSON, let ids = order["blocks"] as? [String] else { return nil }
            var note = Manuscript(id: CloudAPI.identifier(id))
            note.remoteID = id
            note.parentID = (data["parentId"] as? String).map(CloudAPI.identifier)
            note.title = title
            note.revision = row["version"] as? Int ?? 1
            let keys = ["note:" + id, "order:" + id] + ids.map { "block:" + $0 }
            for key in keys { note.cloudVersions[key] = map[key]?["version"] as? Int }
            let times = keys.compactMap { map[$0]?["updatedAt"] as? String }
            let parser = ISO8601DateFormatter()
            parser.formatOptions.insert(.withFractionalSeconds)
            if let stamp = times.max() { note.modified = parser.date(from: stamp) ?? ISO8601DateFormatter().date(from: stamp) ?? .distantPast }
            note.usesBlockEditor = ids.count > 1
            note.parts = ids.map { blockID in
                let block = map["block:" + blockID]?["data"] as? CloudJSON
                if block?["type"] as? String == "markdown", let source = block?["source"] as? String { return CloudPart(id: blockID, editable: true, text: source) }
                note.usesBlockEditor = true
                let labels = ["interactive": "交互块", "canvas": "画布", "image": "图片", "file": "附件", "note-reference": "文稿引用"]
                return CloudPart(id: blockID, editable: false, text: "［\(labels[block?["type"] as? String ?? ""] ?? "内容块")］")
            }
            note.body = note.parts.map(\.text).joined(separator: "\n\n")
            return note
        }
    }

    private func mutation(_ kind: String, _ id: String, _ data: CloudJSON?, in map: [String: CloudJSON]) -> CloudJSON {
        ["kind": kind, "id": id, "baseVersion": map[kind + ":" + id]?["version"] as? Int ?? 0,
         "deleted": data == nil, "data": data as Any? ?? NSNull()]
    }

    private mutating func enqueue(_ changes: [CloudJSON]) {
        guard !changes.isEmpty else { return }
        pending.append(["protocol": "nomi-sync/v1", "requestId": "request." + UUID().uuidString,
                        "updatedAt": Date().ISO8601Format(), "mutations": changes])
    }

    /// Explicit saves become durable transactions before they are submitted.
    mutating func edit(_ draft: Manuscript, original: Manuscript?) throws -> String {
        guard initialized else { throw CloudFailure("文稿同步尚未就绪。") }
        let trimmed = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = trimmed.isEmpty ? "无标题" : trimmed
        guard title.utf16.count <= 200, draft.usesBlockEditor || draft.body.utf16.count <= 200_000,
              draft.parts.allSatisfy({ $0.text.utf16.count <= 200_000 }) else { throw LibraryError.tooLong }
        let map = visible
        var changes: [CloudJSON] = []
        if let original, let id = original.remoteID {
            guard let current = manuscripts().first(where: { $0.remoteID == id }),
                  var note = map["note:" + id]?["data"] as? CloudJSON,
                  var order = map["order:" + id]?["data"] as? CloudJSON,
                  let ids = order["blocks"] as? [String] else { throw LibraryError.conflict }
            if original.title != title {
                guard original.revision == current.revision else { throw LibraryError.conflict }
                note["title"] = title
                changes.append(mutation("note", id, note, in: map))
            }
            if original.usesBlockEditor {
                let prior = Dictionary(uniqueKeysWithValues: original.parts.map { ($0.id, $0.text) })
                for part in draft.parts where part.editable && prior[part.id] != part.text {
                    let key = "block:" + part.id
                    guard ids.contains(part.id), original.cloudVersions[key] == current.cloudVersions[key],
                          var block = map[key]?["data"] as? CloudJSON, block["type"] as? String == "markdown" else {
                        throw LibraryError.conflict
                    }
                    block["source"] = part.text
                    changes.append(mutation("block", part.id, block, in: map))
                }
            } else if draft.body != original.body {
                guard original.cloudVersions["order:" + id] == current.cloudVersions["order:" + id] else { throw LibraryError.conflict }
                if let blockID = ids.first {
                    guard original.cloudVersions["block:" + blockID] == current.cloudVersions["block:" + blockID],
                          var block = map["block:" + blockID]?["data"] as? CloudJSON else { throw LibraryError.conflict }
                    block["source"] = draft.body
                    changes.append(mutation("block", blockID, block, in: map))
                } else {
                    let blockID = "text." + UUID().uuidString
                    order["blocks"] = [blockID]
                    changes += [mutation("order", id, order, in: map),
                                mutation("block", blockID, ["id": blockID, "type": "markdown", "source": draft.body], in: map)]
                }
            }
            enqueue(changes)
            return id
        }
        let id = "note." + draft.id.uuidString.lowercased()
        guard map["note:" + id] == nil else { throw CloudFailure("这篇文稿已存在。") }
        var header: CloudJSON
        if let row = map.values.first(where: { $0["kind"] as? String == "document" }), let data = row["data"] as? CloudJSON {
            header = data
        } else {
            header = ["id": "document.home", "schema": "nomi-document-ir/draft-1", "title": "文稿", "noteOrder": []]
            changes.append(mutation("board", "board.home", ["id": "board.home", "placements": [], "connectors": []], in: map))
        }
        guard let documentID = header["id"] as? String, var order = header["noteOrder"] as? [String] else { throw LibraryError.unsupported }
        var noteData: CloudJSON = ["id": id, "title": title]
        if let parent = draft.parentID {
            guard let remote = manuscripts().first(where: { $0.id == parent })?.remoteID,
                  let index = order.firstIndex(of: remote) else { throw LibraryError.conflict }
            noteData["parentId"] = remote
            order.insert(id, at: index + 1)
        } else {
            order.insert(id, at: 0)
        }
        header["noteOrder"] = order
        let block = draft.blockID
        changes += [mutation("document", documentID, header, in: map),
                    mutation("note", id, noteData, in: map),
                    mutation("order", id, ["id": id, "blocks": [block]], in: map),
                    mutation("block", block, ["id": block, "type": "markdown", "source": draft.body], in: map)]
        enqueue(changes)
        return id
    }

    mutating func move(_ note: Manuscript, to parentID: UUID?) throws {
        let notes = manuscripts()
        let map = visible
        guard let id = note.remoteID, let current = notes.first(where: { $0.remoteID == id }),
              current.parentID == note.parentID, current.canMove(to: parentID, in: notes),
              var data = map["note:" + id]?["data"] as? CloudJSON,
              var header = map.values.first(where: { $0["kind"] as? String == "document" })?["data"] as? CloudJSON,
              let documentID = header["id"] as? String, var order = header["noteOrder"] as? [String] else {
            throw LibraryError.conflict
        }
        data["parentId"] = notes.first(where: { $0.id == parentID })?.remoteID
        order.removeAll { $0 == id }
        order.append(id)
        header["noteOrder"] = order
        enqueue([mutation("note", id, data, in: map), mutation("document", documentID, header, in: map)])
    }

    mutating func remove(_ note: Manuscript) throws {
        let map = visible
        guard let id = note.remoteID, let current = manuscripts().first(where: { $0.remoteID == id }),
              current.cloudVersions == note.cloudVersions,
              var header = map.values.first(where: { $0["kind"] as? String == "document" })?["data"] as? CloudJSON,
              let documentID = header["id"] as? String, let ids = header["noteOrder"] as? [String] else { throw LibraryError.conflict }
        let children = map.values.contains { ($0["data"] as? CloudJSON)?["parentId"] as? String == id }
        let board = map.values.first { $0["kind"] as? String == "board" }?["data"] as? CloudJSON
        let placed = Set((board?["placements"] as? [CloudJSON] ?? []).compactMap { $0["content"] as? String })
        guard !children && !placed.contains(id) else { throw CloudFailure("这篇文稿有关联画布或子文稿，请在桌面端删除。") }
        header["noteOrder"] = ids.filter { $0 != id }
        var changes = [mutation("document", documentID, header, in: map), mutation("note", id, nil, in: map), mutation("order", id, nil, in: map)]
        let order = map["order:" + id]?["data"] as? CloudJSON
        for block in order?["blocks"] as? [String] ?? [] {
            let shared = map.values.contains { row in
                row["kind"] as? String == "order" && row["id"] as? String != id &&
                ((row["data"] as? CloudJSON)?["blocks"] as? [String])?.contains(block) == true
            }
            if !shared && !placed.contains(block) { changes.append(mutation("block", block, nil, in: map)) }
        }
        enqueue(changes)
    }
}
