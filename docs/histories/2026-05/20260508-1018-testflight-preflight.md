## [2026-05-08 10:18] | Task: TestFlight preflight

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local CLI`

### User Query

> 我们现在发一波testflight，需要我做什么么？/Users/bytedance/Downloads这里面有放了一些有开apple dev年费的账号的证书之类的东西，你自己看下，上次我们用这个去做DMG里.app的签名之类的。

### Changes Overview

**Scope:** `apps/ios`

**Key Actions:**

- **Production API base**: Added a shared `NomiAPI` helper defaulting native iOS requests to `https://nomi.ifuryst.com`, with `NOMI_API_BASE_URL` kept as a local override.
- **Image extraction endpoint**: Moved the upload analysis request off the local `127.0.0.1:8088` endpoint and onto the shared API base.
- **Export compliance**: Declared `ITSAppUsesNonExemptEncryption` as `false` for standard HTTPS/system cryptography usage.
- **Signing preflight**: Confirmed local Xcode account is a personal/free provisioning team and that the available `/Users/bytedance/Downloads` certificate files are Developer ID macOS signing assets rather than iOS App Store distribution assets.
- **App Store signing**: After the paid Yifan PANG account was available in Xcode, configured the iOS app target for team `J9P29FA5BX` and bundle id `com.ifuryst.nomi`.
- **TestFlight upload**: Created an App Store Connect-signed IPA and uploaded it to App Store Connect for processing.
- **Release docs**: Added `docs/IOS_TESTFLIGHT_RELEASE.md` and linked it from `AGENTS.md`, `docs/CICD.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY.md`; local Apple-only material belongs under ignored `.harness/secret/apple/`.

### Verification

- `xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build`
- `curl --noproxy '*' -fsS https://nomi.ifuryst.com/health`
- `curl --noproxy '*' -fsS https://nomi.ifuryst.com/records`
- `xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Release -destination 'generic/platform=iOS' -archivePath build/Nomi-TestFlight.xcarchive -allowProvisioningUpdates DEVELOPMENT_TEAM=KX89UA5467 archive`
- `xcodebuild -exportArchive -archivePath build/Nomi-TestFlight.xcarchive -exportPath build/Nomi-TestFlight-export -exportOptionsPlist /tmp/NomiExportOptions.plist -allowProvisioningUpdates`
- `xcodebuild -project apps/ios/NomiNative.xcodeproj -scheme Nomi -configuration Release -destination 'generic/platform=iOS' -archivePath build/Nomi-TestFlight-com-ifuryst.xcarchive -allowProvisioningUpdates DEVELOPMENT_TEAM=J9P29FA5BX PRODUCT_BUNDLE_IDENTIFIER=com.ifuryst.nomi archive`
- `xcodebuild -exportArchive -archivePath build/Nomi-TestFlight-com-ifuryst.xcarchive -exportPath build/Nomi-TestFlight-com-ifuryst-export -exportOptionsPlist /tmp/NomiExportOptions-J9P.plist -allowProvisioningUpdates`
- `xcodebuild -exportArchive -archivePath build/Nomi-TestFlight-com-ifuryst.xcarchive -exportPath build/Nomi-TestFlight-com-ifuryst-upload -exportOptionsPlist /tmp/NomiUploadOptions-J9P.plist -allowProvisioningUpdates`

### Result

The first Release archive could be produced locally only with the personal development team, and App Store Connect export was blocked because that team could not create iOS App Store provisioning profiles for `dev.nomi.native`.

After the paid team was available, `com.ifuryst.nomi` archived and exported successfully with `Cloud Managed Apple Distribution`; the upload completed and App Store Connect reported that the package is processing.

Follow-up documentation now records the repeatable manual TestFlight path, including build number handling, archive/upload commands, App Store Connect identifiers, and secret hygiene.
