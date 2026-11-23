import XCTest
@testable import NomiMobile

final class ManuscriptMoveTests: XCTestCase {
    func testNestedSidebarDepthSurvivesClosingAndReopeningParent() {
        let root = Manuscript(), sibling = Manuscript()
        var child = Manuscript(), grandchild = Manuscript()
        child.parentID = root.id
        grandchild.parentID = child.id
        let outline = ManuscriptOutline([root, child, grandchild, sibling])
        let closed = outline.visibleRows(expanded: [child.id])
        XCTAssertEqual(closed.map(\.id), [root.id, sibling.id])
        let open = outline.visibleRows(expanded: [root.id, child.id])
        XCTAssertEqual(open.map(\.id), [root.id, child.id, grandchild.id, sibling.id])
        XCTAssertEqual(open.map(\.leadingIndent), [0, 12, 24, 0])
    }

    func testOutlineUsesPackageOrderAndRetainsOrphanedBranches() {
        var root = Manuscript(), first = Manuscript(), second = Manuscript(), orphan = Manuscript()
        first.parentID = root.id
        second.parentID = root.id
        root.childOrder = [second.noteID, first.noteID]
        orphan.parentID = UUID()
        var cyclic = Manuscript()
        cyclic.parentID = cyclic.id
        let outline = ManuscriptOutline([first, root, orphan, second, cyclic])
        XCTAssertEqual(outline.children[root.id]?.map(\.id), [second.id, first.id])
        XCTAssertEqual(outline.visibleRows(expanded: []).map(\.id), [root.id, orphan.id, cyclic.id])
        XCTAssertEqual(outline.visibleRows(expanded: [root.id]).map(\.id), [root.id, second.id, first.id, orphan.id, cyclic.id])
        XCTAssertEqual(outline.ancestors(of: first.id), [root.id])
        XCTAssertNil(outline.children[cyclic.id])
    }

    @MainActor func testMoveLocalSubtreeAndReopen() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let library = Library(directory: directory)
        func make(_ title: String, parent: Manuscript? = nil) throws -> Manuscript {
            var draft = Manuscript()
            draft.title = title
            draft.body = title + " body"
            draft.parentID = parent?.id
            try library.save(draft)
            return try XCTUnwrap(library.notes.first { $0.id == draft.id })
        }
        let first = try make("First")
        let second = try make("Second")
        let child = try make("Child", parent: first)
        let grandchild = try make("Grandchild", parent: child)
        XCTAssertThrowsError(try library.move(first, to: grandchild.id))
        try library.move(child, to: second.id)
        let moved = Library(directory: directory)
        XCTAssertNil(moved.problem)
        XCTAssertEqual(moved.notes.count, 4)
        XCTAssertEqual(moved.notes.first { $0.id == first.id }?.childOrder, [])
        XCTAssertEqual(moved.notes.first { $0.id == second.id }?.childOrder, [child.noteID])
        XCTAssertEqual(moved.notes.first { $0.id == grandchild.id }?.body, "Grandchild body")
        XCTAssertThrowsError(try library.move(child, to: nil))
        let current = try XCTUnwrap(library.notes.first { $0.id == child.id })
        try library.move(current, to: nil)
        var edit = grandchild
        edit.body = "After move"
        try library.save(edit)
        let reopened = Library(directory: directory)
        XCTAssertNil(reopened.problem)
        XCTAssertNil(reopened.notes.first { $0.id == child.id }?.parentID)
        XCTAssertEqual(reopened.notes.first { $0.id == grandchild.id }?.body, edit.body)
    }

    func testMoveCloudNoteQueuesParentAndOrderTogether() throws {
        var replica = CloudReplica()
        replica.initialized = true
        func make(_ title: String, parent: Manuscript? = nil) throws -> Manuscript {
            var draft = Manuscript()
            draft.title = title
            draft.parentID = parent?.id
            let id = try replica.edit(draft, original: nil)
            return try XCTUnwrap(replica.manuscripts().first { $0.remoteID == id })
        }
        let root = try make("Root")
        let child = try make("Child", parent: root)
        let target = try make("Target")
        let count = replica.pending.count
        XCTAssertThrowsError(try replica.move(root, to: child.id))
        try replica.move(root, to: target.id)
        XCTAssertEqual(replica.pending.count, count + 1)
        let mutations = try XCTUnwrap(replica.pending.last?["mutations"] as? [CloudJSON])
        XCTAssertEqual(mutations.compactMap { $0["kind"] as? String }, ["note", "document"])
        let moved = try XCTUnwrap(replica.manuscripts().first { $0.id == root.id })
        XCTAssertEqual(moved.parentID, target.id)
        XCTAssertEqual(replica.manuscripts().first { $0.id == child.id }?.parentID, root.id)
        try replica.move(moved, to: nil)
        XCTAssertNil(replica.manuscripts().first { $0.id == root.id }?.parentID)
    }
}
