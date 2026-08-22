import XCTest

@MainActor
final class NomiUploadFlowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testAuthenticationAndInvitationEntryPoints() {
        let app = launchApp()

        XCTAssertTrue(app.textFields.matching(identifier: "auth-email").firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields.matching(identifier: "auth-password").firstMatch.exists)
        XCTAssertTrue(app.buttons["登录"].exists)

        app.buttons["第一次使用？用邀请码注册"].tap()
        XCTAssertTrue(app.textFields.matching(identifier: "auth-invite").firstMatch.waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["创建账号"].exists)
    }

    func testRealFamilyLoginShowsMobileShell() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let email = environment["NOMI_E2E_EMAIL"],
              let password = environment["NOMI_E2E_PASSWORD"],
              !email.isEmpty, !password.isEmpty else {
            throw XCTSkip("Set NOMI_E2E_EMAIL and NOMI_E2E_PASSWORD for the authenticated smoke")
        }

        let app = launchApp()
        let emailField = app.textFields.matching(identifier: "auth-email").firstMatch
        let passwordField = app.secureTextFields.matching(identifier: "auth-password").firstMatch
        emailField.tap()
        emailField.typeText(email)
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons.matching(identifier: "auth-submit").firstMatch.tap()

        XCTAssertTrue(app.buttons["资料"].waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(app.buttons["对话"].exists)
        XCTAssertTrue(app.buttons["家庭"].exists)
        XCTAssertTrue(app.navigationBars["健康资料"].exists)

        app.buttons["家庭"].tap()
        XCTAssertTrue(app.navigationBars["家庭"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["添加家庭成员"].exists)
        XCTAssertTrue(app.buttons["退出登录"].exists)
    }

    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["NOMI_API_BASE_URL"] = ProcessInfo.processInfo.environment["NOMI_E2E_API_BASE_URL"] ?? "http://127.0.0.1:18088"
        app.launch()
        return app
    }
}
