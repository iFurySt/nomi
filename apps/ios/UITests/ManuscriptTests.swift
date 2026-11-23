import XCTest

final class ManuscriptTests: XCTestCase {
    @MainActor func testDocumentLifecycle() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertFalse(app.staticTexts["还没有文稿"].exists)
        app.buttons["emptyManuscript"].tap()
        let editor = app.textViews["manuscriptText"]
        editor.typeText("River walk\nA morning by the river.")
        app.buttons["finishEditing"].tap()
        let reader = app.textViews["manuscriptReader"]
        XCTAssertTrue(reader.waitForExistence(timeout: 8))
        XCTAssertEqual(reader.value as? String, "River walk\nA morning by the river.")
        reader.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: reader.frame.width - 3, dy: 12)).tap()
        editor.typeText(" notes")
        app.buttons["finishEditing"].tap()
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        XCTAssertEqual(reader.value as? String, "River walk notes\nA morning by the river.")
        app.terminate()
        app.launch()
        XCTAssertTrue(reader.waitForExistence(timeout: 8))
        XCTAssertEqual(reader.value as? String, "River walk notes\nA morning by the river.")
        let pinned = app.buttons["收起目录"].exists
        if pinned { app.buttons["收起目录"].tap() }
        app.buttons["打开目录"].tap()
        XCTAssertFalse(app.textFields["searchField"].exists)
        app.buttons["openSearch"].tap()
        let search = app.textFields["searchField"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.typeText("missing")
        XCTAssertTrue(app.staticTexts["没有匹配的文稿"].waitForExistence(timeout: 5))
        app.buttons["清空搜索"].tap()
        search.typeText("morning")
        let result = app.buttons["searchResult"].firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 5))
        capture("duo-search-typing")
        app.buttons["标题"].tap()
        XCTAssertTrue(app.staticTexts["没有匹配的文稿"].exists)
        app.buttons["正文"].tap()
        search.tap()
        search.typeText("\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(result.exists)
        capture("duo-search-submitted")
        result.tap()
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        XCTAssertEqual(reader.value as? String, "River walk notes\nA morning by the river.")
        XCTAssertTrue(app.buttons[pinned ? "收起目录" : "打开目录"].exists)
        func deleteFromMenu() {
            if app.buttons["更多操作"].isHittable { app.buttons["更多操作"].tap() }
            else {
                if !app.buttons["noteRow"].firstMatch.isHittable { app.buttons["打开目录"].tap() }
                app.buttons["noteRow"].firstMatch.press(forDuration: 0.8)
            }
            app.buttons["删除文稿"].tap()
        }
        deleteFromMenu()
        app.alerts.buttons["取消"].tap()
        if !pinned && app.buttons["收起目录"].exists { app.buttons["收起目录"].tap() }
        XCTAssertEqual(reader.value as? String, "River walk notes\nA morning by the river.")
        deleteFromMenu()
        app.alerts.buttons["删除"].tap()
        if !pinned && app.buttons["收起目录"].exists { app.buttons["收起目录"].tap() }
        XCTAssertTrue(app.buttons["emptyManuscript"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["emptyManuscript"].exists)
    }

    @MainActor func testManuscriptActions() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        let reader = app.textViews["manuscriptReader"]
        let editor = app.textViews["manuscriptText"]
        let menu = app.buttons["更多操作"]
        let done = app.buttons["finishEditing"]
        func create(_ text: String) {
            app.buttons["newRoot"].tap()
            XCTAssertTrue(editor.waitForExistence(timeout: 5))
            editor.typeText(text)
            done.tap()
            XCTAssertTrue(reader.waitForExistence(timeout: 5))
        }
        create("Destination")
        create("Field notes\nNeedle in this note.")
        menu.tap()
        app.buttons["锁定编辑"].tap()
        app.terminate()
        app.launch()
        reader.tap()
        XCTAssertFalse(editor.exists)
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        menu.tap()
        XCTAssertTrue(app.buttons["解除编辑锁定"].exists)
        app.buttons["文内查找"].tap()
        XCTAssertTrue(app.textViews["findManuscriptText"].waitForExistence(timeout: 5))
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.typeText("Needle")
        XCTAssertTrue((field.value as? String)?.contains("Needle") == true)
        app.buttons["关闭"].tap()
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        menu.tap()
        app.buttons["移动文稿"].tap()
        app.buttons["Destination"].tap()
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        menu.tap()
        app.buttons["解除编辑锁定"].tap()
        reader.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        done.tap()
        let child = app.buttons.matching(identifier: "noteRow").matching(NSPredicate(format: "label == %@", "Field notes")).firstMatch
        if !child.isHittable { app.buttons["打开目录"].tap() }
        XCTAssertEqual(child.value as? String, "第2层")
        child.tap()
        app.buttons["分享文稿"].tap()
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 5))
    }

    @MainActor func testRootAndChildAfterRotation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .landscapeLeft
        app.launch()
        let compose = app.buttons["newRoot"]
        func title(_ name: String) {
            let field = app.textViews["manuscriptText"]
            XCTAssertTrue(field.waitForExistence(timeout: 5))
            XCTAssertFalse(app.sheets.firstMatch.exists)
            field.tap()
            field.typeText(name)
            app.buttons["finishEditing"].tap()
            XCTAssertTrue(field.waitForNonExistence(timeout: 5))
        }
        func row(_ name: String) -> XCUIElement {
            app.buttons.matching(identifier: "noteRow").matching(NSPredicate(format: "label == %@", name)).firstMatch
        }
        func showDirectory() {
            if !app.buttons["noteRow"].firstMatch.isHittable && app.buttons["打开目录"].isHittable {
                app.buttons["打开目录"].tap()
                XCTAssertTrue(app.buttons["noteRow"].firstMatch.waitForExistence(timeout: 5))
            }
        }
        func checkCorner() {
            XCTAssertTrue(compose.isHittable)
            let window = app.windows.firstMatch.frame
            let nearestEdge = min(compose.frame.minX - window.minX, window.maxX - compose.frame.maxX)
            XCTAssertEqual(nearestEdge, 24, accuracy: 3)
            XCTAssertTrue((17...45).contains(window.maxY - compose.frame.maxY))
            print("Duo compose", compose.frame, "window", window)
        }

        checkCorner()
        compose.tap()
        title("Research")
        showDirectory()
        XCTAssertTrue(row("Research").exists)
        row("Research").press(forDuration: 0.9)
        let addChild = app.buttons["新建子文稿"]
        XCTAssertTrue(addChild.waitForExistence(timeout: 5))
        capture("duo-child-menu")
        addChild.tap()
        title("Reading")
        showDirectory()
        XCTAssertEqual(row("Reading").value as? String, "第2层")
        row("Reading").tap()
        compose.tap()
        title("Inbox")
        showDirectory()
        XCTAssertEqual(row("Inbox").value as? String, "根文稿")
        capture("duo-compose-landscape")
        let parent = row("Research")
        let child = row("Reading")
        parent.tap()
        XCTAssertTrue(parent.isSelected)
        XCTAssertTrue(child.isHittable)
        XCTAssertEqual(parent.frame.minX, child.frame.minX, accuracy: 1)
        XCTAssertEqual(parent.frame.minX, row("Inbox").frame.minX, accuracy: 1)
        parent.tap()
        XCTAssertTrue(child.waitForNonExistence(timeout: 5))
        XCTAssertTrue(parent.isSelected)
        row("Inbox").tap()
        showDirectory()
        parent.tap()
        XCTAssertTrue(child.isHittable)
        let link = app.buttons.matching(identifier: "childDocument").firstMatch
        if !link.isHittable { app.buttons["收起目录"].tap() }
        XCTAssertTrue((app.textViews["manuscriptReader"].value as? String)?.hasPrefix("Research") == true)
        XCTAssertEqual(link.label, "Reading")
        link.tap()
        XCTAssertTrue((app.textViews["manuscriptReader"].value as? String)?.hasPrefix("Reading") == true)
        showDirectory()
        XCTAssertTrue(child.isSelected)
        app.terminate()
        app.launch()
        showDirectory()
        XCTAssertEqual(row("Reading").value as? String, "第2层")
        XCUIDevice.shared.orientation = .portrait
        if !compose.isHittable && app.buttons["收起目录"].isHittable { app.buttons["收起目录"].tap() }
        checkCorner()
        capture("duo-compose-portrait")
    }

    @MainActor func testWideSidebarControls() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        let window = app.windows.firstMatch.frame
        guard window.width >= 700, window.width > window.height else {
            throw XCTSkip("需要展开的横屏窗口")
        }
        let close = app.buttons["收起目录"]
        let open = app.buttons["打开目录"]
        let search = app.buttons["openSearch"]
        let account = app.buttons["sidebarAccount"]
        let logo = app.images["Nomi"]
        XCTAssertTrue(close.isHittable)
        XCTAssertTrue(logo.exists)
        XCTAssertGreaterThanOrEqual(logo.frame.minX - window.minX, 28)
        XCTAssertGreaterThanOrEqual(logo.frame.minY - window.minY, 24)
        let list = app.scrollViews["sidebarResults"].frame
        if close.frame.midX < window.midX {
            XCTAssertLessThanOrEqual(close.frame.maxX, list.minX)
        } else {
            XCTAssertGreaterThanOrEqual(close.frame.minX, list.maxX)
        }
        XCTAssertLessThan(search.frame.midX, account.frame.midX)
        XCTAssertEqual(search.frame.midY, account.frame.midY, accuracy: 2)
        XCTAssertLessThan(account.frame.maxX, list.maxX)
        let share = app.buttons["分享文稿"]
        let more = app.buttons["更多操作"]
        let shareFrame = share.frame
        let moreFrame = more.frame
        XCTAssertLessThan(close.frame.midY, shareFrame.midY)
        XCTAssertLessThan(shareFrame.midY, moreFrame.midY)
        let compose = app.buttons["newRoot"]
        XCTAssertTrue(compose.isHittable)
        XCTAssertEqual(compose.frame.midX, close.frame.midX, accuracy: 2)
        XCTAssertEqual(compose.frame.midY, search.frame.midY, accuracy: 2)
        let composeFrame = compose.frame
        XCTAssertLessThan(moreFrame.midY, composeFrame.midY)
        let railX = close.frame.midX
        let toggleSize = close.frame.size
        capture("duo-wide-sidebar-open")
        close.tap()
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        XCTAssertEqual(open.frame.midX, railX, accuracy: 2)
        XCTAssertEqual(open.frame.size, toggleSize)
        XCTAssertTrue(open.isHittable)
        XCTAssertFalse(search.exists)
        XCTAssertFalse(account.exists)
        XCTAssertEqual(share.frame, shareFrame)
        XCTAssertEqual(more.frame, moreFrame)
        XCTAssertEqual(compose.frame, composeFrame)
        capture("duo-wide-sidebar-closed")
        open.tap()
        search.tap()
        XCTAssertTrue(app.textFields["searchField"].waitForExistence(timeout: 5))
        app.buttons["关闭搜索"].tap()
        account.tap()
        XCTAssertTrue(app.textFields["loginEmail"].waitForExistence(timeout: 5))
    }

    // Run in each tall inner-display pose selected in Device Hub.
    @MainActor func testUnfoldedPortraitControls() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        let window = app.windows.firstMatch.frame
        guard window.width >= 600, window.height > window.width else {
            throw XCTSkip("需要竖长的 Duo 展开内屏")
        }
        let close = app.buttons["收起目录"]
        let open = app.buttons["打开目录"]
        let search = app.buttons["openSearch"]
        let account = app.buttons["sidebarAccount"]
        let create = app.buttons["newRoot"]
        XCTAssertTrue(open.isHittable)
        XCTAssertLessThan(open.frame.midY, window.minY + window.height / 4)
        XCTAssertGreaterThan(create.frame.midY, window.midY)
        XCTAssertGreaterThan(create.frame.midX, window.midX)
        let headerY = open.frame.midY
        let more = app.buttons["更多操作"]
        let origin = app.windows.firstMatch.coordinate(withNormalizedOffset: .zero)
        func point(_ button: XCUIElement) -> XCUICoordinate {
            origin.withOffset(CGVector(dx: button.frame.midX - window.minX, dy: button.frame.midY - window.minY))
        }
        let morePoint = point(more)
        let createPoint = point(create)
        XCTAssertTrue(app.buttons["分享文稿"].exists)
        open.tap()
        XCTAssertTrue(close.isHittable)
        XCTAssertEqual(close.frame.midY, headerY, accuracy: 6)
        XCTAssertTrue(search.isHittable)
        XCTAssertLessThan(search.frame.midX, account.frame.midX)
        XCTAssertEqual(search.frame.midY, account.frame.midY, accuracy: 2)
        point(search).tap()
        XCTAssertTrue(app.textFields["searchField"].waitForExistence(timeout: 3))
        app.buttons["关闭搜索"].tap()
        morePoint.tap()
        XCTAssertTrue(open.isHittable)
        XCTAssertFalse(app.buttons["删除文稿"].exists)
        open.tap()
        createPoint.tap()
        XCTAssertTrue(open.isHittable)
        XCTAssertTrue(search.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.buttons["emptyManuscript"].exists)
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        create.tap()
        let editor = app.textViews["manuscriptText"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let done = app.buttons["finishEditing"]
        XCTAssertEqual(done.frame.midY, open.frame.midY, accuracy: 4)
        XCTAssertGreaterThan(done.frame.midX, open.frame.midX)
        done.tap()
        XCTAssertTrue(app.textViews["manuscriptReader"].waitForExistence(timeout: 5))
        XCTAssertFalse(done.exists)
        let sharePoint = point(app.buttons["分享文稿"])
        open.tap()
        capture("duo-portrait-drawer")
        sharePoint.tap()
        XCTAssertTrue(open.isHittable)
        XCTAssertFalse(app.otherElements["ActivityListView"].exists)
        more.tap()
        XCTAssertTrue(app.buttons["移动文稿"].isHittable)
    }

    @MainActor func testWideSidebarFooterDuringEditing() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        let window = app.windows.firstMatch
        guard window.frame.width >= 700, window.frame.width > window.frame.height else {
            throw XCTSkip("需要展开的横屏窗口")
        }
        let editor = app.textViews["manuscriptText"]
        let reader = app.textViews["manuscriptReader"]
        let search = app.buttons["openSearch"]
        let account = app.buttons["sidebarAccount"]
        let searchY = search.frame.midY
        let accountY = account.frame.midY
        let railX = app.buttons["收起目录"].frame.midX
        XCTAssertLessThan(search.frame.midX, account.frame.midX)
        XCTAssertEqual(accountY, searchY, accuracy: 2)
        app.buttons["newRoot"].tap()
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        XCTAssertTrue(editor.exists)
        let done = app.buttons["finishEditing"]
        let editingAction = done.exists ? done : app.buttons["BottomOverflowBarButtonItem"]
        XCTAssertTrue(editingAction.exists)
        XCTAssertEqual(editingAction.frame.midX, railX, accuracy: 2)
        let keyboardFrame = keyboard.frame
        let docked = keyboardFrame.maxY >= window.frame.maxY - 1
            && keyboardFrame.width >= window.frame.width - 1
        if docked {
            XCTAssertLessThanOrEqual(editor.frame.maxY, keyboardFrame.minY + 1)
        }
        XCTAssertEqual(search.frame.midY, searchY, accuracy: 1)
        XCTAssertEqual(account.frame.midY, accountY, accuracy: 1)

        app.buttons["noteRow"].firstMatch.tap()
        XCTAssertTrue(keyboard.waitForNonExistence(timeout: 5))
        XCTAssertTrue(reader.exists)
        XCTAssertEqual(search.frame.midY, searchY, accuracy: 1)
        XCTAssertEqual(account.frame.midY, accountY, accuracy: 1)
    }

    @MainActor func testWideSidebarEdgeDrag() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .landscapeLeft
        app.launch()
        let close = app.buttons["收起目录"]
        let open = app.buttons["打开目录"]
        let sidebar = app.scrollViews["sidebarResults"]
        guard close.waitForExistence(timeout: 8), app.windows.firstMatch.frame.width >= 700 else {
            throw XCTSkip("需要展开的横屏窗口")
        }
        let width = sidebar.frame.width
        let origin = app.windows.firstMatch.coordinate(withNormalizedOffset: .zero)
        func drag(_ start: CGFloat, _ end: CGFloat) {
            origin.withOffset(CGVector(dx: start, dy: 180))
                .press(forDuration: 0.08, thenDragTo: origin.withOffset(CGVector(dx: end, dy: 180)),
                       withVelocity: .slow, thenHoldForDuration: 0.3)
        }

        drag(width + 110, width - 70)
        XCTAssertTrue(close.isHittable)
        drag(width - 12, width - 48)
        XCTAssertTrue(close.isHittable)
        drag(width - 12, 30)
        XCTAssertTrue(open.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["openSearch"].exists)
        drag(80, width - 12)
        XCTAssertTrue(open.isHittable)
        drag(12, 48)
        XCTAssertTrue(open.isHittable)
        drag(12, width - 12)
        XCTAssertTrue(close.waitForExistence(timeout: 3))
        XCTAssertTrue(close.isHittable)
        XCTAssertEqual(sidebar.frame.minX, app.windows.firstMatch.frame.minX, accuracy: 1)
        XCTAssertTrue(app.buttons["openSearch"].exists)
    }

    @MainActor func testFoldedSidebarActions() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        let window = app.windows.firstMatch.frame
        guard window.size == CGSize(width: 466, height: 678) else {
            throw XCTSkip("需要折叠的 Duo 外屏，当前窗口为 \(window)")
        }
        let open = app.buttons["打开目录"]
        let close = app.buttons["收起目录"]
        let compose = app.buttons["newRoot"]
        let account = app.buttons["sidebarAccount"]
        let toggleFrame = open.frame
        let actionFrame = compose.frame
        XCTAssertEqual(toggleFrame.midX, window.maxX - 48, accuracy: 2)
        if ProcessInfo.processInfo.environment["NOMI_CHECK_PLAYBACK_RAIL"] == "1" {
            // With Now Playing expanded, the Wi-Fi indicator extends to y = 222 pt.
            XCTAssertGreaterThan(toggleFrame.minY, window.minY + 222)
        } else {
            XCTAssertGreaterThanOrEqual(toggleFrame.midY, window.minY + 196)
        }
        XCTAssertTrue(open.isHittable)
        XCTAssertEqual(actionFrame.midX, toggleFrame.midX, accuracy: 2)
        XCTAssertEqual(actionFrame.midY, window.maxY - 48, accuracy: 2)
        XCTAssertFalse(account.exists)
        let share = app.buttons["分享文稿"]
        let more = app.buttons["更多操作"]
        XCTAssertLessThan(toggleFrame.midY, share.frame.midY)
        XCTAssertLessThan(share.frame.midY, more.frame.midY)
        XCTAssertLessThan(more.frame.midY, actionFrame.midY)
        capture("duo-cover-closed")
        func drag(from start: CGFloat, to end: CGFloat) {
            let window = app.windows.firstMatch
            window.coordinate(withNormalizedOffset: CGVector(dx: start, dy: 0.45))
                .press(forDuration: 0.08, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: end, dy: 0.45)))
        }
        drag(from: 0.035, to: 0.67)
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        XCTAssertFalse(app.textFields["searchField"].exists)
        XCTAssertEqual(close.frame.midX, toggleFrame.midX, accuracy: 2)
        XCTAssertEqual(close.frame.midY, toggleFrame.midY, accuracy: 2)
        let searchButton = app.buttons["openSearch"]
        XCTAssertEqual(compose.frame, actionFrame)
        XCTAssertEqual(searchButton.frame.midX, actionFrame.midX, accuracy: 2)
        XCTAssertLessThan(searchButton.frame.maxY, actionFrame.minY)
        XCTAssertLessThan(account.frame.maxY, searchButton.frame.minY)
        XCTAssertFalse(app.buttons["分享文稿"].exists)
        XCTAssertFalse(app.buttons["更多操作"].exists)
        capture("duo-cover-open")
        drag(from: 0.18, to: 0.72)
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        open.tap()
        drag(from: 0.68, to: 0.1)
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        open.tap()
        searchButton.tap()
        XCTAssertTrue(app.textFields["searchField"].waitForExistence(timeout: 5))
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        capture("duo-search-empty")
        app.buttons["关闭搜索"].tap()
        XCTAssertTrue(account.waitForExistence(timeout: 5))
        account.tap()
        XCTAssertTrue(app.textFields["loginEmail"].waitForExistence(timeout: 5))
        app.buttons["关闭"].tap()
        close.tap()
        XCTAssertTrue(compose.waitForExistence(timeout: 5))
        compose.tap()
        XCTAssertTrue(app.textViews["manuscriptText"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["保存"].exists)
        XCTAssertFalse(app.buttons["取消"].exists)
        XCTAssertFalse(app.staticTexts["文稿"].exists)
        let editor = app.textViews["manuscriptText"]
        editor.typeText("Drafx\na")
        editor.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 3))
        editor.typeText("t\nWritten on Duo.")
        XCTAssertEqual(editor.value as? String, "Draft\nWritten on Duo.")
        let done = app.buttons["finishEditing"]
        XCTAssertEqual(done.frame.midX, toggleFrame.midX, accuracy: 2)
        XCTAssertEqual(done.frame.midY, open.frame.midY + 60, accuracy: 2)
        capture("duo-edit-keyboard")
        done.tap()
        XCTAssertTrue(keyboard.waitForNonExistence(timeout: 5))
        let reader = app.textViews["manuscriptReader"]
        XCTAssertEqual(reader.value as? String, "Draft\nWritten on Duo.")
        XCTAssertFalse(app.buttons["编辑文稿"].exists)
        XCTAssertTrue(app.buttons["更多操作"].isHittable)
        XCTAssertTrue(app.buttons["分享文稿"].isHittable)
        capture("duo-reading")
        reader.coordinate(withNormalizedOffset: CGVector(dx: 0.40, dy: 0.70)).tap()
        editor.typeText(" More.")
        done.tap()
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        XCTAssertEqual(reader.value as? String, "Draft\nWritten on Duo. More.")
        reader.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 1, dy: 52)).tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.typeText("Still ")
        XCTAssertEqual(editor.value as? String, "Draft\nStill Written on Duo. More.")
    }

    @MainActor func testRotationFinishesManuscriptEditing() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        app.launch()
        app.buttons["newRoot"].tap()
        let keyboard = app.keyboards.firstMatch
        let editor = app.textViews["manuscriptText"]
        let reader = app.textViews["manuscriptReader"]
        let done = app.buttons["finishEditing"]
        var title = ""
        for orientation in [UIDeviceOrientation.landscapeLeft, .landscapeRight, .portrait] {
            XCTAssertTrue(editor.waitForExistence(timeout: 5))
            editor.typeText("a")
            title = try XCTUnwrap(editor.value as? String).trimmingCharacters(in: .newlines)
            XCTAssertTrue(done.exists)
            XCUIDevice.shared.orientation = orientation
            let rotated = NSPredicate { _, _ in
                let frame = app.windows.firstMatch.frame
                return (frame.width > frame.height) == orientation.isLandscape
            }
            let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: rotated, object: nil)], timeout: 6)
            if result != .completed && app.windows.firstMatch.frame.size == CGSize(width: 466, height: 678) {
                throw XCTSkip("模拟设备旋转了未启用的内屏，折叠外屏仍为竖屏")
            }
            XCTAssertEqual(result, .completed)
            XCTAssertTrue(reader.waitForExistence(timeout: 5))
            XCTAssertTrue(keyboard.waitForNonExistence(timeout: 5))
            XCTAssertFalse(done.exists)
            XCTAssertEqual(reader.value as? String, title + "\n")
            if orientation.isLandscape {
                reader.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 4, dy: 10)).tap()
            }
        }
        app.terminate()
        app.launch()
        XCTAssertEqual(reader.value as? String, title + "\n")
    }

    @MainActor func testDragDownToDismissManuscriptKeyboard() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        app.buttons["newRoot"].tap()
        let editor = app.textViews["manuscriptText"]
        editor.tap()
        let keyboard = app.keyboards.firstMatch
        let key = keyboard.keys.matching(NSPredicate(format: "label ==[c] %@", "a")).firstMatch
        XCTAssertTrue(key.waitForExistence(timeout: 5))
        key.tap()
        let draft = try XCTUnwrap(editor.value as? String)
        XCTAssertEqual(draft.lowercased(), "a")

        // Cross the keyboard edge from inside the editor, even on a one-line draft.
        let start = editor.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.60))
        start.press(forDuration: 0.08,
            thenDragTo: keyboard.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.92)))
        XCTAssertTrue(keyboard.waitForNonExistence(timeout: 5))
        let done = app.buttons["finishEditing"]
        XCTAssertTrue(done.waitForNonExistence(timeout: 5))
        let reader = app.textViews["manuscriptReader"]
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        XCTAssertEqual(reader.value as? String, draft + "\n")
        app.terminate()
        app.launch()
        XCTAssertEqual(reader.value as? String, draft + "\n")
        reader.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 100, dy: 8)).tap()
        XCTAssertTrue(key.waitForExistence(timeout: 5))
        key.tap()
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        XCTAssertEqual((reader.value as? String)?.lowercased(), "aa\n")
    }

    @MainActor func testFoldedEditingOverflow() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        guard app.windows.firstMatch.frame.size == CGSize(width: 466, height: 678) else {
            throw XCTSkip("需要折叠的 Duo 外屏")
        }
        guard app.buttons["打开目录"].frame.minY > 222 else {
            throw XCTSkip("需要播放音乐，使外屏状态区展开")
        }
        app.buttons["newRoot"].tap()
        let editor = app.textViews["manuscriptText"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        // Tapping the software keyboard keeps it on screen. typeText can switch to a hardware keyboard.
        let key = app.keyboards.keys.matching(NSPredicate(format: "label ==[c] %@", "a")).firstMatch
        XCTAssertTrue(key.isHittable)
        key.tap()
        let draft = try XCTUnwrap(editor.value as? String)
        XCTAssertEqual(draft.lowercased(), "a")
        let more = app.buttons["BottomOverflowBarButtonItem"]
        XCTAssertTrue(more.waitForExistence(timeout: 5))
        more.tap()
        let done = app.buttons["完成编辑"]
        XCTAssertTrue(done.waitForExistence(timeout: 3))
        let undo = app.buttons["撤销"]
        XCTAssertTrue(undo.isEnabled)
        capture("duo-edit-overflow")
        undo.tap()
        XCTAssertEqual(editor.value as? String, "")
        key.tap()
        more.tap()
        done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let reader = app.textViews["manuscriptReader"]
        XCTAssertEqual(reader.value as? String, draft + "\n")
        app.terminate()
        app.launch()
        XCTAssertEqual(reader.value as? String, draft + "\n")
    }

    @MainActor func testRichBodyToolbarAndPreview() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        app.buttons["newRoot"].tap()
        let editor = app.textViews["manuscriptText"]
        editor.typeText("Field guide\nOne task")
        app.buttons["finishEditing"].tap()
        app.buttons["format-task"].tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual(editor.value as? String, "Field guide\n- [ ] One task")
        editor.typeText(" ")
        app.buttons["format-bold"].tap()
        editor.typeText("today")
        XCTAssertEqual(editor.value as? String, "Field guide\n- [ ] One task **today**")
        capture("duo-body-formatting")
        app.buttons["finishEditing"].tap()
        let task = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "待办事项")).firstMatch
        XCTAssertTrue(task.waitForExistence(timeout: 8))
        app.terminate()
        app.launch()
        XCTAssertTrue(task.waitForExistence(timeout: 8))
        task.tap()
        capture("duo-body-preview")
        app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: 0.65)).tap()
        XCTAssertTrue(app.buttons["finishEditing"].waitForExistence(timeout: 5))
        XCTAssertTrue(task.exists)
        app.typeText("!")
        app.buttons["finishEditing"].tap()
        app.terminate()
        app.launch()
        let savedText = app.webViews.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "!")).firstMatch
        XCTAssertTrue(savedText.waitForExistence(timeout: 8))
        XCTAssertTrue(task.exists)
    }

    @MainActor func testTapRenderedFormulaAndReopen() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        app.buttons["newRoot"].tap()
        app.textViews["manuscriptText"].typeText("Observe\n$x+1$")
        app.buttons["finishEditing"].tap()
        let web = app.webViews.firstMatch
        let formula = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "编辑公式 ")).firstMatch
        func tapFormula() {
            XCTAssertTrue(formula.waitForExistence(timeout: 20))
            formula.tap()
        }
        tapFormula()
        let source = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "LaTeX")).firstMatch
        XCTAssertTrue(source.waitForExistence(timeout: 5))
        app.typeText("y")
        app.buttons["finishEditing"].tap()
        app.terminate()
        app.launch()
        tapFormula()
        XCTAssertTrue(source.waitForExistence(timeout: 5))
        XCTAssertTrue((source.value as? String)?.contains("y") == true)
        app.buttons["finishEditing"].tap()
    }

    @MainActor func testTypographyOnFocus() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        app.buttons["newRoot"].tap()
        let editor = app.textViews["manuscriptText"]
        editor.typeText("On typography\n## A heading\nPlain, **bold** and *italic*.\nSecond paragraph.\nTap below to continue.")
        app.buttons["finishEditing"].tap()
        let reader = app.textViews["manuscriptReader"]
        XCTAssertTrue(reader.waitForExistence(timeout: 5))
        // Crop upstream of the insertion point, excluding the system rail and keyboard.
        func glyphs(_ field: XCUIElement) throws -> Data {
            let screenshot = field.screenshot().image
            let scale = CGFloat(try XCTUnwrap(screenshot.cgImage).width) / field.frame.width
            let bounds = CGRect(x: 0, y: 0, width: min(270, field.frame.width), height: 108)
            let image = try XCTUnwrap(screenshot.cgImage?.cropping(to: bounds.applying(.init(scaleX: scale, y: scale))))
            return try XCTUnwrap(UIImage(cgImage: image).pngData())
        }
        let before = try glyphs(reader)
        let origin = reader.frame.origin
        capture("duo-type-reading")
        reader.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.65)).tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual(editor.frame.origin, origin)
        let after = try glyphs(editor)
        capture("duo-type-focused")
        XCTAssertTrue(before == after, "标题、正文与 Markdown 排版应逐像素相同")
        app.buttons["finishEditing"].tap()
        if app.buttons["打开目录"].isHittable { app.buttons["打开目录"].tap() }
        capture("duo-sidebar-type")
    }

    @MainActor private func capture(_ name: String) {
        for (index, screen) in XCUIScreen.screens.enumerated() {
            let image = XCTAttachment(screenshot: screen.screenshot())
            image.name = "\(name)-display-\(index)"
            image.lifetime = .keepAlways
            add(image)
        }
    }

    @MainActor func testNativeAccount() throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NOMI_SYNC_TEST_URL"], URL(string: url)?.host == "127.0.0.1",
              let password = env["NOMI_SYNC_TEST_PASSWORD"] else { throw XCTSkip("需要隔离的同步服务") }
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_TEST_SITE"] = url
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        app.buttons["newRoot"].tap()
        app.textViews["manuscriptText"].typeText("Guest draft")
        app.buttons["finishEditing"].tap()
        func row(_ title: String) -> XCUIElement {
            app.buttons.matching(identifier: "noteRow").matching(NSPredicate(format: "label == %@", title)).firstMatch
        }
        func account() {
            if !app.buttons["sidebarAccount"].isHittable { app.buttons["打开目录"].tap() }
            app.buttons["sidebarAccount"].tap()
        }
        if !app.buttons["sidebarAccount"].isHittable { app.buttons["打开目录"].tap() }
        capture("duo-account-entry")
        account()
        XCTAssertTrue(app.textFields["loginEmail"].waitForExistence(timeout: 5))
        capture("duo-sign-in")
        XCTAssertTrue(app.buttons["googleSignIn"].exists)
        XCTAssertFalse(app.textFields["serverField"].exists)
        app.textFields["loginEmail"].tap()
        app.textFields["loginEmail"].typeText("test@example.invalid")
        let secret = app.secureTextFields["loginPassword"]
        secret.tap()
        secret.typeText(password + "\n")
        XCTAssertTrue(app.textFields["loginEmail"].waitForNonExistence(timeout: 15))
        XCTAssertTrue(app.buttons["sidebarAccount"].waitForExistence(timeout: 15))
        XCTAssertTrue(row("Guest draft").waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["云端文稿"].exists)
        XCTAssertFalse(app.staticTexts["本机文稿"].exists)
        row("Guest draft").press(forDuration: 0.8)
        app.buttons["新建子文稿"].tap()
        app.textViews["manuscriptText"].typeText("Child of guest draft")
        app.buttons["finishEditing"].tap()
        if !app.buttons["sidebarAccount"].isHittable { app.buttons["打开目录"].tap() }
        XCTAssertEqual(row("Child of guest draft").value as? String, "第2层")
        account()
        XCTAssertTrue(app.staticTexts["test@example.invalid"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["立即同步"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["当前资料库"].exists)
        capture("duo-personal-settings")
        app.buttons["versionInfo"].tap()
        let version = app.buttons.matching(NSPredicate(format: "label MATCHES %@", #"Nomi v[0-9.]+ \([0-9]+\)"#)).firstMatch
        XCTAssertTrue(version.waitForExistence(timeout: 5))
        capture("duo-version-info")
        version.tap()
        app.buttons["退出登录"].tap()
        XCTAssertTrue(app.buttons["sidebarAccount"].waitForExistence(timeout: 8))
        XCTAssertTrue(row("Guest draft").exists)
        XCTAssertTrue(row("Child of guest draft").exists)
        account()
        XCTAssertTrue(app.textFields["loginEmail"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        account()
        XCTAssertTrue(app.textFields["loginEmail"].waitForExistence(timeout: 5))
    }
}

final class GoogleConsentTests: XCTestCase {
    // Explicit live smoke against the official Nomi service and Google's account selector.
    @MainActor func testAuthorizationPage() throws {
        guard ProcessInfo.processInfo.environment["NOMI_CHECK_GOOGLE_CONSENT"] == "1" else { throw XCTSkip("需要在线 Google OAuth 验收") }
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_UI_LIBRARY"] = UUID().uuidString
        app.launch()
        if !app.buttons["sidebarAccount"].isHittable { app.buttons["打开目录"].tap() }
        app.buttons["sidebarAccount"].tap()
        XCTAssertTrue(app.buttons["googleSignIn"].waitForExistence(timeout: 10))
        app.buttons["googleSignIn"].tap()
        let spring = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let consent = spring.alerts.buttons.matching(NSPredicate(format: "label IN %@", ["Continue", "继续"])).firstMatch
        if consent.waitForExistence(timeout: 10) { consent.tap() }
        let prompt = app.webViews.descendants(matching: .any).matching(NSPredicate(
            format: "label MATCHES[c] %@", ".*(Email or phone|Choose an account|电子邮件地址或电话号码|选择帐号|選擇帳戶|Use your Google Account).*")).firstMatch
        XCTAssertTrue(prompt.waitForExistence(timeout: 35))
    }
}
