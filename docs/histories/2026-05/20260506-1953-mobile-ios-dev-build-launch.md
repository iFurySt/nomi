## [2026-05-06 19:53] | Task: Mobile iOS dev build launch

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `local shell, Xcode 26.3, iOS Simulator`

### User Query

> Open the mobile app in the iOS Simulator, inspect the Xcode/simulator path, and install the app.

### Changes Overview

**Scope:** `apps/mobile`

**Key Actions:**

- **[iOS launch fix]**: Guarded web-only hash access so the React Native iOS runtime does not read `window.location.hash` when `window.location` is unavailable.
- **[Safe area fix]**: Switched the app shell to `react-native-safe-area-context` so the iOS development build no longer shows the deprecated React Native `SafeAreaView` warning overlay.
- **[Verification]**: Built and installed the Expo iOS development build on the booted `iPhone 16e` simulator; verified the screen rendered after reload.

### Design Intent (Why)

The upload workbench keeps URL hash shortcuts for web screenshot states, but iOS development builds do not provide a browser `window.location`. A small helper preserves web behavior while returning the default app state on native.

### Files Modified

- `apps/mobile/App.tsx`
- `apps/mobile/package.json`
- `apps/mobile/package-lock.json`
- `docs/histories/2026-05/20260506-1953-mobile-ios-dev-build-launch.md`
