## [2026-05-06 18:43] | Task: mobile upload UI redesign

### Execution Context

- Agent ID: `Codex`
- Base Model: `GPT-5`
- Runtime: `Codex CLI`

### User Query

> 重做当前糟糕的 UI/UX：iPhone 优先，底部导航中央圆形按钮，点开后顺时针动画出现拍摄、相册选择、文件选择三个入口；选择后继续上传，上传时调用 iPhone 端侧抠图能力；当前只需要原图 AI 分类和单独 cutout 产物。
>
> Follow-up: 三个展开按钮太丑；保留页面功能，Original 和 Cutout 保留原来的结构。
>
> Follow-up: 基于 iPhone simulator 截图继续判断问题并调整。
>
> Follow-up: 中间 ICON 点开后，如果失去焦点或主动点击 X，需要关闭菜单。

### Changes Overview

**Scope:** `apps/mobile`, `docs`

**Key Actions:**

- Reworked `apps/mobile/App.tsx` from multi-tab Snap / Log / Review into a single upload workbench with bottom-center FAB and animated three-source action fan.
- Added `expo-image-picker` and `expo-document-picker` so camera, photo library, and image file selection use real Expo picker boundaries.
- Added iOS camera / photo-library permission copy and disabled tablet support for the current iPhone-first target.
- Added local Expo iOS module `NomiImageCutout`, which uses iOS 17+ Vision foreground instance mask to render a transparent PNG cutout in development builds.
- Added upload processing and review states showing AI category, original asset, separate cutout slot, and local record save.
- Extended capture drafts with original / cutout asset metadata so upload records preserve both artifact states.
- Updated architecture, frontend, and quality docs for the upload-only mobile direction.
- Captured verification screenshots for idle, menu-open, processing, and review states under `docs/generated/verification/`.
- Verified native autolinking and Swift compilation in a temporary prebuilt iOS workspace with `xcodebuild ... iphonesimulator`; the temporary native project was not copied back into the repo.
- Refined the three menu actions from large text cards into compact circular icon buttons, preserving camera / photos / files behavior and leaving Original / Cutout navigation intact.
- Replaced the idle-state nested phone mock with a real Original -> Cutout preview pair so the app no longer shows an iPhone inside the iPhone simulator.
- Added menu dismissal behavior: tapping the X closes the menu, tapping outside the open fan closes it, and choosing a source closes it before the picker opens.
- Fixed the action fan touch layer so its empty area no longer blocks the center X button while the menu is open.

### Design Intent (Why)

The user requested a hard reset away from the previous broader UI. This change narrows the product surface to the upload moment: one central action, three iPhone-native source choices, visible processing, and a result focused only on original image, AI category, and cutout. The Apple cutout capability is implemented as a local native module for iOS development builds while Expo web keeps an explicit unavailable state.

The follow-up visual refinement removes the bulky source cards because they competed with the page headline. The source labels remain in accessibility labels while the visible control becomes a lighter iOS-style icon fan.

The simulator screenshot made the nested phone mock the dominant issue. The idle state now uses artifact panels instead, which keeps the product focused on the actual original/cutout output rather than a decorative device frame.

The menu now treats the open action fan as a focused transient control. A transparent dismiss layer sits below the nav/fan while open, so stray taps on the page collapse the menu without blocking the actual action buttons.

### Files Modified

- `apps/mobile/App.tsx`
- `apps/mobile/package.json`
- `apps/mobile/package-lock.json`
- `apps/mobile/app.json`
- `apps/mobile/src/domain/capture.ts`
- `apps/mobile/src/native/imageCutout.ts`
- `modules/nomi-image-cutout/`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/QUALITY_SCORE.md`
- `docs/generated/verification/mobile-upload-redesign-idle-2026-05-06.png`
- `docs/generated/verification/mobile-upload-redesign-menu-2026-05-06.png`
- `docs/generated/verification/mobile-upload-redesign-processing-2026-05-06.png`
- `docs/generated/verification/mobile-upload-redesign-review-2026-05-06.png`
- `docs/generated/verification/mobile-upload-redesign-menu-refined-2026-05-06.png`
- `docs/generated/verification/mobile-upload-redesign-simulator-tuned-2026-05-06.png`
