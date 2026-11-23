import Foundation

struct ManuscriptOutline {
    struct Row: Identifiable {
        let note: Manuscript
        let depth: Int
        var id: UUID { note.id }
    }

    private(set) var rows: [Row] = []
    private(set) var children: [UUID: [Manuscript]] = [:]
    private var parents: [UUID: UUID] = [:]

    init(_ notes: [Manuscript]) {
        let ids = Set(notes.map(\.id))
        let grouped = Dictionary(grouping: notes, by: \.parentID)
        var seen = Set<UUID>()
        func append(_ note: Manuscript, under parent: UUID?, depth: Int) {
            guard seen.insert(note.id).inserted else { return }
            rows.append(Row(note: note, depth: depth))
            if let parent {
                parents[note.id] = parent
                children[parent, default: []].append(note)
            }
            var direct = grouped[note.id] ?? []
            if !note.childOrder.isEmpty {
                let order = Dictionary(note.childOrder.enumerated().map { ($1, $0) },
                                       uniquingKeysWith: min)
                direct.sort { order[$0.noteID, default: .max] < order[$1.noteID, default: .max] }
            }
            for child in direct { append(child, under: note.id, depth: depth + 1) }
        }
        for note in notes where note.parentID.map(ids.contains) != true {
            append(note, under: nil, depth: 0)
        }
        // A partial or cyclic replica should still let the user reach every document once.
        for note in notes where !seen.contains(note.id) { append(note, under: nil, depth: 0) }
    }

    func ancestors(of id: UUID) -> [UUID] {
        var result: [UUID] = []
        var next = parents[id]
        while let parent = next {
            result.append(parent)
            next = parents[parent]
        }
        return result
    }

    func visibleRows(expanded: Set<UUID>) -> [Row] {
        var visibleDepth = 0
        return rows.filter { row in
            guard row.depth <= visibleDepth else { return false }
            visibleDepth = row.depth + (expanded.contains(row.id) ? 1 : 0)
            return true
        }
    }
}
