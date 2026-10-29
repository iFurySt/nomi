import AppKit
import Foundation

struct Snapshot: Codable {
    let changeCount: Int
    let items: [[String: Data]]
}
let args = CommandLine.arguments
let pasteboard = NSPasteboard.general
let file = URL(fileURLWithPath: args[2])
if args[1] == "save" {
    let items = (pasteboard.pasteboardItems ?? []).map { item in
        Dictionary(uniqueKeysWithValues: item.types.compactMap { type in
            item.data(forType: type).map { (type.rawValue, $0) }
        })
    }
    try JSONEncoder().encode(Snapshot(changeCount: pasteboard.changeCount, items: items)).write(to: file, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
} else {
    let saved = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: file))
    var recovered = pasteboard.changeCount == saved.changeCount
    // Never overwrite a new clipboard value copied by the user during the check.
    if pasteboard.changeCount != saved.changeCount && pasteboard.string(forType: .string) == args[3] {
        let items = saved.items.map { formats in
            let item = NSPasteboardItem()
            for (type, data) in formats { item.setData(data, forType: NSPasteboard.PasteboardType(type)) }
            return item
        }
        pasteboard.clearContents()
        if !items.isEmpty { pasteboard.writeObjects(items) }
        recovered = true
    }
    // Keep the backup available if an unexpected clipboard value prevented recovery.
    if recovered { try FileManager.default.removeItem(at: file) }
}
