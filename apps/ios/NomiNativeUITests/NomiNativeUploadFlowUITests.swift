import XCTest

@MainActor
final class NomiNativeUploadFlowUITests: XCTestCase {
    private let uploadTimeout: TimeInterval = 12

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testPhotosUploadCreatesRealTimelineEntry() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_DISABLE_RECORD_SYNC"] = "1"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "empty-timeline").firstMatch.waitForExistence(timeout: 5))

        app.buttons.matching(identifier: "bottom-add").firstMatch.tap()
        let primaryButton = app.buttons.matching(identifier: "upload-primary-button").firstMatch
        XCTAssertTrue(primaryButton.waitForExistence(timeout: 5))
        primaryButton.tap()

        selectFirstPhoto()

        XCTAssertTrue(primaryButton.waitForExistence(timeout: 8), app.debugDescription)
        primaryButton.tap()

        XCTAssertTrue(app.staticTexts["Food input"].waitForExistence(timeout: uploadTimeout))
        XCTAssertTrue(app.staticTexts["1 item"].waitForExistence(timeout: 2))
        saveScreenshot(named: "nomi-native-real-upload-photos-2026-05-07.png")
    }

    func testFilesUploadCreatesRealTimelineEntry() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_DISABLE_RECORD_SYNC"] = "1"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "empty-timeline").firstMatch.waitForExistence(timeout: 5))

        app.buttons.matching(identifier: "bottom-add").firstMatch.tap()
        let fileButton = app.buttons.matching(identifier: "upload-source-file").firstMatch
        XCTAssertTrue(fileButton.waitForExistence(timeout: 5))
        fileButton.tap()

        selectPreparedFile(named: "IMG_7624")

        let primaryButton = app.buttons.matching(identifier: "upload-primary-button").firstMatch
        XCTAssertTrue(primaryButton.waitForExistence(timeout: 8), app.debugDescription)
        primaryButton.tap()

        XCTAssertTrue(app.staticTexts["Food input"].waitForExistence(timeout: uploadTimeout))
        XCTAssertTrue(app.staticTexts["1 item"].waitForExistence(timeout: 2))
        saveScreenshot(named: "nomi-native-real-upload-files-2026-05-07.png")
    }

    func testBottomFloatingControlsOpenUploadAndLanguageSettings() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_DISABLE_RECORD_SYNC"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons.matching(identifier: "bottom-today").firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons.matching(identifier: "bottom-me").firstMatch.waitForExistence(timeout: 2), app.debugDescription)

        app.buttons.matching(identifier: "bottom-add").firstMatch.tap()
        XCTAssertTrue(app.buttons.matching(identifier: "upload-primary-button").firstMatch.waitForExistence(timeout: 5), app.debugDescription)

        app.buttons.matching(identifier: "upload-close-button").firstMatch.tap()
        XCTAssertFalse(app.buttons.matching(identifier: "upload-primary-button").firstMatch.waitForExistence(timeout: 2))

        app.buttons.matching(identifier: "bottom-me").firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "my-view").firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        saveScreenshot(named: "nomi-native-gray-my-2026-05-08.png")

        app.buttons.matching(identifier: "my-language-row").firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "language-sheet").firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons.matching(identifier: "language-english").firstMatch.waitForExistence(timeout: 2), app.debugDescription)
        saveScreenshot(named: "nomi-native-gray-language-sheet-2026-05-08.png")
    }

    func testMyLanguageSheetSwitchesBetweenChineseAndEnglish() throws {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_DISABLE_RECORD_SYNC"] = "1"
        app.launchEnvironment["NOMI_RESET_LANGUAGE_PREFERENCE"] = "1"
        app.launch()

        app.buttons.matching(identifier: "bottom-me").firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "my-view").firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        app.buttons.matching(identifier: "my-language-row").firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "language-sheet").firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Current language"].waitForExistence(timeout: 2))

        app.buttons.matching(identifier: "language-simplifiedChinese").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["当前语言"].waitForExistence(timeout: 2))
        saveScreenshot(named: "nomi-native-my-language-zh-2026-05-08.png")

        app.buttons.matching(identifier: "language-english").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Current language"].waitForExistence(timeout: 2))
    }

    private func selectFirstPhoto() {
        let app = XCUIApplication()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        tapIfExists(springboard.buttons["Continue"])
        tapIfExists(springboard.buttons["Allow Full Access"])
        tapIfExists(springboard.buttons["Allow Access to All Photos"])

        Thread.sleep(forTimeInterval: 1.2)

        let firstCell = app.collectionViews.cells.firstMatch
        if firstCell.waitForExistence(timeout: 3), firstCell.isHittable {
            firstCell.tap()
        } else {
            let firstImage = app.images.firstMatch
            if firstImage.waitForExistence(timeout: 1), firstImage.isHittable {
                firstImage.tap()
            } else {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.46)).tap()
            }
        }

        Thread.sleep(forTimeInterval: 0.7)

        tapFirstButton(containing: "Add", in: app)
        tapFirstButton(containing: "Done", in: app)
        tapFirstButton(containing: "Choose", in: app)
    }

    private func selectPreparedFile(named fileName: String) {
        let app = XCUIApplication()

        if tapFirstElement(containing: fileName, in: app, timeout: 4) {
            return
        }

        tapIfExists(app.buttons["Browse"])
        _ = tapFirstElement(containing: "On My iPhone", in: app, timeout: 1)

        if tapFirstElement(containing: fileName, in: app, timeout: 4) {
            return
        }

        let firstCell = app.collectionViews.cells.firstMatch
        if firstCell.waitForExistence(timeout: 2), firstCell.isHittable {
            firstCell.tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.25)).tap()
        }
    }

    private func tapIfExists(_ element: XCUIElement) {
        if element.waitForExistence(timeout: 1), element.isHittable {
            element.tap()
        }
    }

    private func tapFirstButton(containing text: String, in app: XCUIApplication) {
        let predicate = NSPredicate(format: "label CONTAINS[c] %@", text)
        let button = app.buttons.matching(predicate).firstMatch
        if button.waitForExistence(timeout: 1) {
            if button.isHittable {
                button.tap()
            } else {
                button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
        }
    }

    @discardableResult
    private func tapFirstElement(containing text: String, in app: XCUIApplication, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "label CONTAINS[c] %@", text)
        let element = app.descendants(matching: .any).matching(predicate).firstMatch
        if element.waitForExistence(timeout: timeout), element.isHittable {
            element.tap()
            return true
        }
        return false
    }

    private func saveScreenshot(named fileName: String) {
        Thread.sleep(forTimeInterval: 1.8)

        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = fileName
        attachment.lifetime = .keepAlways
        add(attachment)

        let directory = ProcessInfo.processInfo.environment["NOMI_SCREENSHOT_DIR"].flatMap { value in
            value.isEmpty ? nil : URL(fileURLWithPath: value, isDirectory: true)
        } ?? URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "docs/generated/verification", directoryHint: .isDirectory)

        let url = directory.appendingPathComponent(fileName)
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try screenshot.pngRepresentation.write(to: url)
        } catch {
            XCTFail("Could not save screenshot \(fileName): \(error)")
        }
    }
}
