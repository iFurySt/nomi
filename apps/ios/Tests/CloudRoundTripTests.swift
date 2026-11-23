import XCTest
@testable import NomiMobile

final class CloudRoundTripTests: XCTestCase {
    // Run with scripts/check-sync-package.mjs --mobile against its disposable server.
    @MainActor func testDesktopRoundTrip() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["NOMI_SYNC_TEST_URL"], let password = env["NOMI_SYNC_TEST_PASSWORD"],
              let site = URL(string: raw), site.host == "127.0.0.1",
              UUID(uuidString: env["NOMI_UI_LIBRARY"] ?? "") != nil else { throw XCTSkip("需要隔离的同步服务") }
        let cloud = MobileCloud()
        XCTAssertNil(cloud.session)
        try await cloud.signIn(site: site, email: "test@example.invalid", password: password)
        await cloud.sync()
        let existing = try XCTUnwrap(cloud.notes.first { $0.title == "From Mac" }, cloud.message ?? "")
        var edit = existing
        XCTAssertTrue(edit.usesBlockEditor)
        edit.parts[0].text = "Edited on Duo"
        try cloud.save(edit, original: existing)
        var new = Manuscript()
        new.parentID = existing.id
        new.title = "From Duo"
        new.body = "Created on Duo"
        try cloud.save(new, original: nil)
        XCTAssertEqual(cloud.replica.pending.count, 2)
        // A second instance must be able to recover both queued operations and the session from disk.
        cloud.pause()
        let restarted = MobileCloud()
        XCTAssertEqual(restarted.replica.pending.count, 2)
        await restarted.sync()
        XCTAssertTrue(restarted.replica.pending.isEmpty, restarted.message ?? "")
        for _ in 0..<30 {
            await restarted.sync()
            if restarted.notes.contains(where: { $0.body == "Edited on Mac" }) { break }
            try await Task.sleep(for: .milliseconds(400))
        }
        let received = try XCTUnwrap(restarted.notes.first { $0.body == "Edited on Mac" }, restarted.message ?? "")
        var ack = received
        ack.title = "Duo received Mac edit"
        try restarted.save(ack, original: received)
        // The normal save debounce must publish this edit without a manual sync.
        for _ in 0..<40 {
            if restarted.replica.pending.isEmpty { break }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTAssertTrue(restarted.replica.pending.isEmpty, restarted.message ?? "")
        // Peer updates this same block after observing the new title. Keep the old draft offline.
        let identity = try XCTUnwrap(restarted.session)
        let space = try XCTUnwrap(identity.spaceID)
        var peerCommitted = false
        for _ in 0..<60 {
            let snapshot = try await CloudAPI.request(site, "v1/spaces/\(space)/snapshot", token: identity.token) as? CloudJSON
            if (snapshot?["records"] as? [CloudJSON])?.contains(where: {
                ($0["data"] as? CloudJSON)?["source"] as? String == "Concurrent Mac edit"
            }) == true { peerCommitted = true; break }
            try await Task.sleep(for: .milliseconds(400))
        }
        XCTAssertTrue(peerCommitted)
        var concurrent = received
        concurrent.body = "Offline Duo edit"
        do {
            try restarted.save(concurrent, original: received)
            await restarted.sync()
            XCTAssertTrue(restarted.conflict, restarted.message ?? "")
            let local = Library()
            try await restarted.resolveKeepingCopies(in: local)
            XCTAssertTrue(local.notes.contains { $0.body == "Offline Duo edit" })
        } catch LibraryError.conflict {
            // A pull that wins the race rejects the stale editor before accepting its draft.
            XCTAssertEqual(concurrent.body, "Offline Duo edit")
        }
        await restarted.sync()
        XCTAssertTrue(restarted.notes.contains { $0.body == "Concurrent Mac edit" })
        let fresh = try XCTUnwrap(restarted.notes.first { $0.title == ack.title })
        try restarted.remove(fresh)
        await restarted.sync()
        XCTAssertTrue(restarted.replica.pending.isEmpty, restarted.message ?? "")
        XCTAssertFalse(restarted.notes.contains { $0.remoteID == fresh.remoteID })
        try await restarted.signOut()
        XCTAssertNil(try CredentialVault.load())
    }
}
