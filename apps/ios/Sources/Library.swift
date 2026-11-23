import Foundation
import Observation

struct CloudPart: Identifiable {
    let id: String
    let editable: Bool
    var text: String
}

struct Manuscript: Identifiable {
    let id: UUID
    var title = ""
    var body = ""
    var revision = 0
    var modified = Date()
    var parentID: UUID?
    var childOrder: [String] = []
    var remoteID: String?
    var usesBlockEditor = false
    var parts: [CloudPart] = []
    var cloudVersions: [String: Int] = [:]

    init(id: UUID = UUID()) { self.id = id }

    mutating func toggleTask(in field: String, at offset: Int) -> Bool {
        func toggled(_ value: String) -> String? {
            let source = value as NSString
            guard offset >= 0, offset < source.length else { return nil }
            let remaining = NSRange(location: offset, length: source.length - offset)
            let marker = source.range(of: #"^(?:[-+*]|\d+[.)])[ \t]+\[[ xX]\]"#, options: [.regularExpression, .anchored], range: remaining)
            guard marker.location != NSNotFound else { return nil }
            let check = NSRange(location: NSMaxRange(marker) - 2, length: 1)
            return source.replacingCharacters(in: check, with: source.substring(with: check) == " " ? "x" : " ")
        }
        if usesBlockEditor {
            let index = field.isEmpty ? parts.indices.first : parts.firstIndex { $0.id == field }
            guard let index, parts[index].editable, let text = toggled(parts[index].text) else { return false }
            parts[index].text = text
        } else {
            guard let text = toggled(body) else { return false }
            body = text
        }
        return true
    }

    var shareText: String { [title, body].filter { !$0.isEmpty }.joined(separator: "\n\n") }

    // Only parents in the same library outside this note's subtree are valid destinations.
    func destinationIDs(in notes: [Manuscript]) -> Set<UUID> {
        let sameLibrary = notes.filter { ($0.remoteID == nil) == (remoteID == nil) }
        let children = Dictionary(grouping: sameLibrary, by: \.parentID)
        var candidates = children[nil] ?? []
        var ids = Set<UUID>()
        while let candidate = candidates.popLast() {
            guard candidate.id != id, ids.insert(candidate.id).inserted else { continue }
            candidates.append(contentsOf: children[candidate.id] ?? [])
        }
        if let parentID { ids.remove(parentID) }
        return ids
    }

    func canMove(to destination: UUID?, in notes: [Manuscript]) -> Bool {
        if let destination { return destinationIDs(in: notes).contains(destination) }
        return parentID != nil
    }

    var fileName: String { id.uuidString.lowercased() + ".nomi" }
    var blockID: String { "text." + id.uuidString.lowercased() }
    var noteID: String { "note." + id.uuidString.lowercased() }

    var manifest: [String: Any] {
        let document: [String: Any] = [
            "schema": "nomi-document-ir/draft-1", "id": "document.mobile",
            "title": title, "revision": revision,
            "notes": [["id": noteID, "title": title, "blocks": [blockID]] as [String: Any]],
            "blocks": [["id": blockID, "type": "markdown", "source": "text/\(blockID).md"]],
            "board": ["id": "board.mobile", "placements": [], "connectors": []] as [String: Any],
            "assets": []
        ]
        return [
            "format": "nomi-package", "version": 1, "kind": "note", "packageId": noteID,
            "fileName": fileName, "publishedTitle": title, "references": [:], "childOrder": childOrder,
            "noteOrder": [], "assetPaths": [:], "document": document
        ]
    }

    init(package url: URL) throws {
        guard let uuid = UUID(uuidString: url.deletingPathExtension().lastPathComponent) else {
            throw LibraryError.unsupported
        }
        self.init(id: uuid)
        let data = try Data(contentsOf: url.appending(path: "document.json"))
        guard let json = try JSONSerialization.jsonObject(with: data) as? NSDictionary,
              let document = json["document"] as? [String: Any],
              let title = document["title"] as? String, let revision = document["revision"] as? Int,
              revision > 0 else { throw LibraryError.unsupported }
        guard let order = json["childOrder"] as? [String] else { throw LibraryError.unsupported }
        childOrder = order
        self.title = title
        self.revision = revision
        // Only the exact text-only format written by this client is editable.
        guard json.isEqual(to: manifest) else { throw LibraryError.unsupported }
        body = try String(contentsOf: url.appending(path: "text/\(blockID).md"), encoding: .utf8)
        modified = try url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate ?? .distantPast
    }
}

enum LibraryError: LocalizedError {
    case unsupported, tooLong, conflict, hasChildren

    var errorDescription: String? {
        switch self {
        case .unsupported: "这篇文稿需要用支持其内容的客户端打开。"
        case .tooLong: "标题或正文过长，请缩短后再保存。"
        case .conflict: "文稿已更改，请重新打开。"
        case .hasChildren: "请先移除子文稿，再删除这篇文稿。"
        }
    }
}

@MainActor @Observable
final class Library {
    private let directory: URL
    private var locations: [UUID: URL] = [:]
    private(set) var notes: [Manuscript] = []
    var problem: String?

    convenience init() {
        let directory: URL
        let support = URL.applicationSupportDirectory
        #if DEBUG
        // UI tests get their own library without clearing any existing documents.
        if let suite = ProcessInfo.processInfo.environment["NOMI_UI_LIBRARY"], let uuid = UUID(uuidString: suite) {
            directory = support.appending(path: "UITests/\(uuid.uuidString)")
        } else {
            directory = support.appending(path: "Manuscripts")
        }
        #else
        directory = support.appending(path: "Manuscripts")
        #endif
        self.init(directory: directory)
    }

    init(directory: URL) {
        self.directory = directory
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try load(directory, parent: nil)
            notes.sort { $0.modified > $1.modified }
        } catch { problem = error.localizedDescription }
    }

    private func load(_ directory: URL, parent: UUID?) throws {
        let entries = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isSymbolicLinkKey],
                                                                   options: .skipsHiddenFiles)
        for url in entries where url.pathExtension == "nomi" {
            do {
                guard try url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { continue }
                var note = try Manuscript(package: url)
                guard locations[note.id] == nil else { throw LibraryError.unsupported }
                note.parentID = parent
                locations[note.id] = url
                notes.append(note)
                let children = url.appending(path: "children")
                if FileManager.default.fileExists(atPath: children.path),
                   try children.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true {
                    try load(children, parent: note.id)
                }
            } catch { problem = "部分文稿无法读取，原文件已保留。" }
        }
    }

    private func writeManifest(_ note: Manuscript, into package: FileWrapper) throws {
        let json = try JSONSerialization.data(withJSONObject: note.manifest, options: [.sortedKeys])
        if let old = package.fileWrappers?["document.json"] { package.removeFileWrapper(old) }
        package.addRegularFile(withContents: json, preferredFilename: "document.json")
    }

    // Commit the child and its parent's ordering together. Preserve sibling packages and attachments.
    private func updateChild(_ note: Manuscript, of parentID: UUID, package: FileWrapper?) throws {
        guard let index = notes.firstIndex(where: { $0.id == parentID }), let url = locations[parentID] else {
            throw LibraryError.conflict
        }
        var parent = notes[index]
        let wrapper = try FileWrapper(url: url)
        let children = wrapper.fileWrappers?["children"] ?? FileWrapper(directoryWithFileWrappers: [:])
        guard children.isDirectory else { throw LibraryError.unsupported }
        if wrapper.fileWrappers?["children"] == nil {
            children.preferredFilename = "children"
            wrapper.addFileWrapper(children)
        }
        if let package {
            guard children.fileWrappers?[note.fileName] == nil else { throw LibraryError.conflict }
            package.preferredFilename = note.fileName
            children.addFileWrapper(package)
            parent.childOrder.insert(note.noteID, at: 0)
        } else {
            guard let child = children.fileWrappers?[note.fileName] else { throw LibraryError.conflict }
            children.removeFileWrapper(child)
            parent.childOrder.removeAll { $0 == note.noteID }
        }
        try writeManifest(parent, into: wrapper)
        try wrapper.write(to: url, options: .atomic, originalContentsURL: url)
        notes[index] = parent
    }

    func save(_ draft: Manuscript) throws {
        var note = draft
        note.title = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if note.title.isEmpty { note.title = "无标题" }
        guard note.title.utf16.count <= 200, note.body.utf16.count <= 200_000 else { throw LibraryError.tooLong }
        let existing = notes.first { $0.id == draft.id }
        guard (existing?.revision ?? 0) == draft.revision else { throw LibraryError.conflict }
        if let existing, existing.title == note.title && existing.body == note.body { return }
        note.revision += 1
        note.modified = Date()
        note.childOrder = existing?.childOrder ?? []
        let package: FileWrapper
        if let url = locations[note.id] { package = try FileWrapper(url: url) }
        else { package = FileWrapper(directoryWithFileWrappers: [:]) }
        try writeManifest(note, into: package)
        let text = package.fileWrappers?["text"] ?? FileWrapper(directoryWithFileWrappers: [:])
        guard text.isDirectory else { throw LibraryError.unsupported }
        if package.fileWrappers?["text"] == nil {
            text.preferredFilename = "text"
            package.addFileWrapper(text)
        }
        let file = note.blockID + ".md"
        if let old = text.fileWrappers?[file] { text.removeFileWrapper(old) }
        text.addRegularFile(withContents: Data(note.body.utf8), preferredFilename: file)
        if existing == nil, let parent = note.parentID {
            try updateChild(note, of: parent, package: package)
            locations[note.id] = locations[parent]?.appending(path: "children").appending(path: note.fileName)
        } else {
            let url = locations[note.id] ?? directory.appending(path: note.fileName)
            try package.write(to: url, options: .atomic, originalContentsURL: locations[note.id])
            locations[note.id] = url
        }
        notes.removeAll { $0.id == note.id }
        notes.insert(note, at: 0)
    }

    func move(_ note: Manuscript, to parentID: UUID?) throws {
        guard let index = notes.firstIndex(where: { $0.id == note.id }),
              notes[index].parentID == note.parentID, notes[index].canMove(to: parentID, in: notes),
              let source = locations[note.id] else { throw LibraryError.conflict }
        let fm = FileManager.default
        let staging = directory.deletingLastPathComponent().appending(path: ".move-" + UUID().uuidString)
        defer { try? fm.removeItem(at: staging) }
        // Publish both parent manifests and the subtree in one directory replacement.
        try fm.copyItem(at: directory, to: staging)
        func staged(_ url: URL) -> URL {
            url.pathComponents.dropFirst(directory.pathComponents.count).reduce(staging) { $0.appending(path: $1) }
        }
        var updated = notes
        var destination = directory
        for id in [note.parentID, parentID].compactMap({ $0 }) {
            guard let i = updated.firstIndex(where: { $0.id == id }), let folder = locations[id] else {
                throw LibraryError.conflict
            }
            updated[i].childOrder.removeAll { $0 == note.noteID }
            if id == parentID {
                updated[i].childOrder.append(note.noteID)
                destination = folder.appending(path: "children")
                let children = staged(destination)
                if fm.fileExists(atPath: children.path) {
                    let attributes = try children.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
                    guard attributes.isDirectory == true, attributes.isSymbolicLink != true else { throw LibraryError.unsupported }
                } else {
                    try fm.createDirectory(at: children, withIntermediateDirectories: false)
                }
            }
            let manifest = try JSONSerialization.data(withJSONObject: updated[i].manifest, options: [.sortedKeys])
            try manifest.write(to: staged(folder).appending(path: "document.json"), options: .atomic)
        }
        destination.append(path: note.fileName)
        try fm.moveItem(at: staged(source), to: staged(destination))
        _ = try fm.replaceItemAt(directory, withItemAt: staging)
        for (id, url) in locations where url.pathComponents.starts(with: source.pathComponents) {
            locations[id] = url.pathComponents.dropFirst(source.pathComponents.count).reduce(destination) { $0.appending(path: $1) }
        }
        updated[index].parentID = parentID
        notes = updated
    }

    func delete(_ note: Manuscript) throws {
        guard let url = locations[note.id] else { throw LibraryError.conflict }
        let children = url.appending(path: "children")
        if FileManager.default.fileExists(atPath: children.path),
           try !FileManager.default.contentsOfDirectory(atPath: children.path).isEmpty {
            throw LibraryError.hasChildren
        }
        if let parent = note.parentID { try updateChild(note, of: parent, package: nil) }
        else { try FileManager.default.removeItem(at: url) }
        locations[note.id] = nil
        notes.removeAll { $0.id == note.id }
    }
}
