import XCTest

@MainActor
final class NomiUploadFlowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testAuthenticationAndInvitationEntryPoints() {
        let app = launchApp(resetSession: true)
        defer { app.terminate() }

        XCTAssertTrue(app.textFields.matching(identifier: "auth-email").firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields.matching(identifier: "auth-password").firstMatch.exists)
        XCTAssertTrue(app.buttons["登录"].exists)

        app.buttons["邀请码注册"].tap()
        XCTAssertTrue(app.textFields.matching(identifier: "auth-invite").firstMatch.waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["创建账号"].exists)
    }

    func testRealFamilyLoginShowsMobileShell() throws {
        let app = launchApp(resetSession: true)
        defer { app.terminate() }
        if !app.buttons.matching(identifier: "upload-open").firstMatch.waitForExistence(timeout: 3) {
            let environment = ProcessInfo.processInfo.environment
            guard let email = environment["NOMI_E2E_EMAIL"],
                  let password = environment["NOMI_E2E_PASSWORD"],
                  !email.isEmpty, !password.isEmpty else {
                throw XCTSkip("Set NOMI_E2E_EMAIL and NOMI_E2E_PASSWORD for the authenticated smoke")
            }

            let emailField = app.textFields.matching(identifier: "auth-email").firstMatch
            let passwordField = app.secureTextFields.matching(identifier: "auth-password").firstMatch
            emailField.tap()
            emailField.typeText(email)
            passwordField.tap()
            passwordField.typeText(password)
            app.buttons.matching(identifier: "auth-submit").firstMatch.tap()
        }

        XCTAssertTrue(app.buttons.matching(identifier: "upload-open").firstMatch.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(app.navigationBars["资料"].exists || app.staticTexts["资料"].exists)
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "knowledge-entry").firstMatch.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertFalse(app.alerts.firstMatch.exists, app.debugDescription)

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 3), app.debugDescription)
        XCTAssertGreaterThanOrEqual(tabBar.buttons.count, 3, app.debugDescription)
        tabBar.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(app.textFields["问 Nomi"].waitForExistence(timeout: 3) || app.staticTexts["新对话"].exists)
        tabBar.buttons.element(boundBy: 2).tap()
        XCTAssertTrue(app.navigationBars["家庭"].waitForExistence(timeout: 3) || app.staticTexts["家庭"].exists)
        XCTAssertTrue(app.buttons["添加成员"].exists)
        XCTAssertTrue(app.buttons["退出登录"].exists)
    }

    private func launchApp(resetSession: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_API_BASE_URL"] = ProcessInfo.processInfo.environment["NOMI_E2E_API_BASE_URL"] ?? "http://127.0.0.1:18088"
        if resetSession {
            app.launchEnvironment["NOMI_UI_TEST_RESET_SESSION"] = "1"
        }
        app.launch()
        return app
    }
}
