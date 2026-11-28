# Nomi 移动文稿

SwiftUI 的 iPhone / iPad 客户端，开发与验收设备是 iPhone Duo。目录收起时按钮显示两横，展开时显示 ×。点按钮或从左边缘向内拖动都可以打开目录。文稿列表直接排在 Nomi 标志下方。资料库为空时，正文中央仅显示文稿图标，点正文空白处即可新建文稿。

折叠外屏、横放内屏和竖放内屏的目录开合、按钮顺序与点击行为统一见 [Duo 文稿操作栏规范](../../docs/UIUX_REFERENCE.md#duo-文稿操作栏)。

纵向操作栏随系统状态区换边。分享调用系统分享面板，内容为当前文稿的标题和正文。「更多」提供锁定或解除编辑锁定、文内查找、移动文稿和删除。编辑锁保存在本设备，锁定后仍可阅读、查找和分享。文内查找使用系统查找栏，可在整篇文稿的匹配处前后跳转。移动会在同一资料库内保留文稿及其子文稿，可选根目录或其他文稿作为目标。编辑时点 ✓ 保存；当键盘或音乐播放占用操作栏空间，点系统「…」可完成编辑或撤销输入。新建文稿默认位于根层，长按目录中的文稿，选择「新建子文稿」即可添加子项。

根文稿沿目录左边缘对齐。子文稿每深入一层向内缩进 12 pt，最多六级。叠页图标表示有子文稿，单页图标表示末级文稿。点父文稿会打开正文并展开子级，再点同一行会收起子级。横放内屏可同时看到目录和正文。临时目录中，点父文稿后可继续选子项，也可关闭目录阅读当前正文；点末级文稿会直接收起目录。目录记住已展开的分支，同一姿态下重新打开也保留滚动位置。父文稿正文后列出可直接打开的一级子文稿。通过正文或搜索打开后代文稿时，目录会展开它的上级。

## 运行

本地开发与回归统一复用一台 iPhone Duo 模拟器和现有的 iOS 27.1 运行时。命令行 UI 测试指定这台设备，并传入 `-parallel-testing-enabled NO`，避免 Xcode 创建模拟器副本。先在仓库根目录用 Node 24 和 `pnpm install --frozen-lockfile` 安装依赖。Xcode 构建时会把 Markdown 解析器和公式排版打入应用，阅读时可离线使用。在此目录执行以下命令，生成的工程留在本机。

```sh
xcodegen generate
open NomiMobile.xcodeproj
```

在 Xcode 选择 NomiMobile 和 iPhone Duo，运行。工程最低目标为 iOS 18，实际验收环境为 Xcode 27.2、iOS 27.1 模拟器。

## 文稿与同步

本机资料库无需账号，每篇文稿使用应用私有目录内的 v1 `.nomi` 包，子文稿存入父包的 `children/` 并更新 `childOrder`。有子文稿的本机文稿须先移除子项才能删除。Duo 折叠外屏从标题和正文开始。点标题或正文可在点按位置输入，点文末空白可续写。基础段落的阅读和编辑使用同一个原生文本视图。包含列表、表格或公式的文稿在阅读和编辑时共用离线排版。从其他应用切回时，如果系统已回收 Markdown 排版进程，会用当前文稿和草稿恢复正文及阅读位置。点文字可在原位输入，周围的标题、清单、表格和公式保留排版。普通文稿第一行是标题，回车进入正文，在正文开头退格可以接着编辑标题。从正文向下拖过键盘上沿，键盘会随手指移动。完全收起后自动保存并回到阅读，操作栏的 ✓ 同时消失。编辑时旋转屏幕也会保存当前文稿、收起键盘并退出编辑。也可以点 ✓ 完成编辑，点回正文即可续写。保存失败时保留编辑内容。本机文稿在同目录原子替换，删除前确认。手机管理自己创建的纯文本包；桌面已有的文稿通过云库读取。

正文默认 17 pt，文稿标题 23 pt，三级小标题依次为 20、18、16 pt，随系统字体大小缩放。宽屏正文居中，每行最多占 620 pt；窄屏的外侧页边距为 24 pt，靠 Duo 操作栏的一侧从操作栏内缘留 12 pt。在系统安全区内，首行上方留 8 pt，单篇文稿末尾留 24 pt。默认正文行高 26 pt，段后留 12 pt，章节标题前留 24 pt；行高和段距随字号缩放。滚动条位于屏幕最右侧。正文避开 Duo 浮动操作栏，宽表格可以横向滑到操作栏下方。点进编辑后沿用阅读时的栏宽和文字位置。[Duo 正文间距对照](../../docs/generated/verification/mobile-documents/duo-manuscript-spacing.png) · [Duo 文稿排版与滚动条截图](../../docs/generated/verification/mobile-documents/duo-reading-typography.png)

阅读时，标题、列表、待办、引用、表格、代码、链接和 LaTeX 公式按 Markdown 排版。点待办框可直接切换完成状态，点链接可打开目标。屏幕键盘打开时，格式工具在可用正文区域居中悬浮，正文可滚到按钮下方。工具栏首页提供 Aa、待办、表格、附件链接和列表。选中文字后自动滑到文字样式页，可点粗体、斜体、下划线或删除线，左右滑动可切回另一页。回形针用于插入文件的共享链接。点 Aa 后，「格式」（Format）面板接替键盘。可按字号预览选择标题或正文，也可在分段按钮组里叠加粗体、斜体、下划线和删除线。面板距窗口左右和底边各 8 pt，底角随折叠和旋转后的屏幕轮廓调整。可在正文中换选文字，连续应用段落和文字样式。点面板上的关闭按钮回到输入。待办、表格、编号和项目列表从工具栏直接作用于正文。表格默认两行两列，插入后光标进入第一格；点单元格可编辑文字，通过上方的列操作或左侧的行操作在当前位置前后插入或删除行列。点按行内或独立公式后，可直接在键盘上方输入 LaTeX。正文高亮当前公式，输入框上方同步显示排版预览。独立公式上下采用正文段距。表达式尚未写完整时保留上一次的排版。点勾保存，或点另一处继续编辑。编辑锁会同时关闭格式操作和待办勾选。[Duo 正文实测截图](../../docs/generated/verification/mobile-documents/duo-rich-manuscript.png)

打开目录，点账号图标（Duo 外屏位于新建按钮上方，内屏位于目录右下），使用内置邮箱密码表单登录。登录后头像打开个人设置，账号区显示邮箱。「退出登录」紧跟「通用」和「数据管理」，随列表滚动。通用设置提供跟随系统、浅色、深色外观和系统 App 语言入口；访客也可从登录页进入。点工具栏的 ⓘ 可打开支持与隐私政策，并复制当前安装版本与构建号。首次使用 Google 或 Apple 登录时，系统按已验证邮箱找到原账号，或自动创建新账号。移动端固定使用官网服务。设备会话存钥匙串。目录和搜索统一显示设备上已有的文稿以及当前账号的文稿。已有文稿继续使用原来的存储位置；登录并连接同步服务后新建的根文稿自动同步，子文稿继承父文稿的存储位置。退出登录后仍可打开设备上的独立文稿。

云库缓存以服务地址、账号、云库 ID 隔离。编辑后先原子保存待提交事务，空闲约 3 秒上传，前台每 15 秒对账，恢复前台时即检查。首次从快照建立基线，后续拉取连续的增量日志；游标过期重新读取快照。提交重试沿用请求 ID，同块并发修改保留待同步内容，个人设置可将本机修改另存后采用云端版本。退出登录保留隔离缓存和待提交事务。

移动端可按块编辑桌面 Markdown，也可修改标题。画布、交互和附件显示为占位，保留原实体与引用。删除有子文稿或有关联画布摆放的文稿需要在桌面端完成。开发构建可直接安装到已配对的 Duo 真机。本版未提供后台持续联网或 TestFlight 分发。

## 验证

从仓库根目录运行。若存在同名设备，用现有 iOS 27.1 Duo 的 UDID 指定目标。

```sh
(cd apps/ios && xcodegen generate)
xcodebuild -project apps/ios/NomiMobile.xcodeproj -scheme NomiMobile \
  -destination 'platform=iOS Simulator,name=iPhone Duo,OS=27.1' -parallel-testing-enabled NO \
  -only-testing:NomiMobileUITests/ManuscriptTests/testDocumentLifecycle test
node scripts/check-sync-package.mjs --mobile
```

在 Device Hub 中用同一台 Duo 验证操作栏，把上述 `-only-testing` 的方法名换成对应测试。

用 `testDocumentScrollsBehindFloatingButtons` 检查原生文稿与 Markdown 的滚动视口，阅读时两者均延伸到底部按钮下方。编辑时滚动视口延伸到键盘上沿。打开和收起屏幕键盘，检查格式栏是否随键盘显隐，并核对它在正文区域的水平位置。[七种姿态的编辑截图](../../docs/generated/verification/mobile-documents/duo-keyboard-formatting.png)

验证目录滚动时，选中一篇长标题文稿，将该行缓慢拖到与 Nomi 标志同高。图形和字母应保持清楚，标志旁的标题和选中底色应继续可见。外屏检查竖放和左右横放，内屏检查四个方向。[七向实测截图](../../docs/generated/verification/mobile-documents/duo-sidebar-scroll-fade.png)

- 折叠外屏运行 `testFoldedSidebarActions`，检查目录开合前后的按钮顺序，以及搜索、个人和新文稿入口。
- 点「Open」后在两个横屏方向分别运行 `testWideSidebarControls`，检查侧边操作栏的位置、目录底部的按钮组，以及开合时分享、更多和新文稿是否留在原位。
- 用「Rotate Right」切换到两个竖屏方向，分别运行 `testUnfoldedPortraitControls`，检查目录页头、搜索与个人的顺序、点击露出按钮先收起目录，以及编辑时的完成按钮。

播放音乐的外屏回归使用折叠的 Duo 真机。先保持音乐播放，在上述测试命令前设置 `TEST_RUNNER_NOMI_CHECK_PLAYBACK_RAIL=1`，目标改为真机，测试项改为 `NomiMobileUITests/ManuscriptTests/testFoldedSidebarActions`，会同时检查目录按钮避开下移的 Wi-Fi 指示并可点按。播放音乐并使用英文屏幕键盘时，运行 `NomiMobileUITests/ManuscriptTests/testFoldedEditingOverflow` 验证点按「…」完成编辑和重开后的保存内容。

同步专项需要已启动的 Duo、Go、Docker、桌面 renderer / preload 构建产物（`pnpm build`）。可用 `NOMI_IOS_DEVICE` 指定模拟器 UDID。测试启动独立 PostgreSQL、Go 服务和 Electron 进程，使用测试网站账号、独立钥匙串项和目录。截图见 [Duo 文稿验收](../../docs/generated/verification/mobile-documents/)。

## 第三方登录配置

Google Cloud 项目为 `nomi-ifuryst`，OAuth 客户端类型为 iOS，绑定 `com.ifuryst.nomi`。系统认证窗口负责选择 Google 账号。服务端提供客户端 ID，App 的 URL Types 注册反向客户端 ID。测试阶段可在 Google Auth Platform 的 Audience 管理测试用户。

Apple 已在既有 App ID `com.ifuryst.nomi` 启用 Sign in with Apple，并设为主 App ID。官网的 Services ID `com.ifuryst.nomi.web` 归入该组。真机开发构建的描述文件包含 Apple 登录 entitlement。手机和网页共用同一账号匹配规则。Apple 隐藏邮箱时使用其提供的中继地址。

[Duo 账号界面截图](../../docs/generated/verification/mobile-account/)包括访客入口、登录页、已登录的设置页、数据管理、ⓘ 菜单及通用页的深浅色外观。

首版提供英文和简体中文。Nomi 使用系统中为 App 选择的语言，跟随系统时取第一首选语言。简体中文和繁体中文都显示简体中文，其他语言都显示英文。原生界面、文稿阅读器和错误提示共用这一规则。用 `testAppLanguageFallback` 检查语言优先顺序。

在同一台 Duo 上运行 `testGeneralSettings` 可核对英文界面、外观持久化和系统设置跳转。`testNativeAccount` 在隔离服务上检查注销确认与取消、信息菜单及退出登录。`testDeleteDisposableAppleAccount` 只用于本机回环服务，需另传 `TEST_RUNNER_NOMI_DISPOSABLE_APPLE_EMAIL` 指定可永久删除的 Apple 关联测试账号。

如要验证官网与 Google 的在线入口，在上述 xcodebuild 命令前设置 `TEST_RUNNER_NOMI_CHECK_GOOGLE_CONSENT=1`，将测试项改为 `NomiMobileUITests/GoogleConsentTests/testAuthorizationPage`。此项在系统认证窗口出现 Google 账号选择或登录表单时完成；个人账号授权由账号持有者操作。

## App Store 首发

发行 Scheme 为 NomiMobile。使用当前工程生成 Release archive，Bundle ID 为 `com.ifuryst.nomi`。首发使用现有 iOS 1.0 商店草稿。登录页与个人设置提供 [隐私政策](https://nomi.ifuryst.com/privacy/) 和 [使用支持](https://nomi.ifuryst.com/support/)。已登录用户可在「个人设置 → 数据管理 → 永久注销账号」发起注销并确认。账号数据和云库从服务器移除，本机独立文稿保留。应用使用 Apple 的身份令牌核验身份，未持有 Apple 的访问令牌或刷新令牌。注销成功后为关联 Apple 的账号提供[手动撤销授权指引](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)。
