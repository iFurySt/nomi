# HTML 交互块：隔离与跨端方案

状态：2026-11-15 设计提案，尚未实现或通过安全验收。本轮只设计，不开放 HTML / JS 执行。承接 [交互块 v2](interactive-content-v2.md)，不改变当前严格 DSL、主界面 CSP 和附件不执行代码的边界。

## 决策建议

保留 portable DSL，新增可选的 `web.sandbox` 运行模式。HTML 不是 DSL 的输入中间件，不要求先翻译组件树再展示。已调好的 HTML / CSS / JS 在受控浏览器环境中运行；文稿、身份、资源引用、复制、同步、版本和预览沿用 Nomi 内容块契约。

| 选择 | 适合 | 代价 |
| --- | --- | --- |
| Portable DSL | 原生控件、明确语义、可验证计算、长期跨端内容 | 表达能力受已实现的组件 / 运算限制；HTML 转换可能丢失细节 |
| 隔离 HTML | 已有 HTML 原稿、定制布局、连续动画和复杂演示 | 需要浏览器内核；隔离和资源治理成本更高；不能保证各端像素完全一致 |
| HTML 自动转原生 | 不作为通用承诺 | 任意 DOM / CSS / JS 没有可靠的一对一 Swift / Java 映射 |

两者共用外层内容模型，内部只有一份权威程序。首个 HTML 切片采用独立 Web 程序；可选的“DSL 计算 + HTML 视图”后做，避免为同一 BPE 维护两套计算和学习状态。HTML→DSL Skill 作为主动迁移工具，输出须重新验收，不成为每次导入的必经步骤。

## 内容如何进入 Nomi

作者交付自包含 HTML，或 HTML 与本地资源目录。导入器执行确定性的打包：解析依赖、拒绝未声明资源、锁定库版本、生成摘要及最小运行清单，形成一个可复制的交互块。无需 AI 重画一遍。

- 原始 HTML 是作者源；运行产物从该源确定性派生，记录源摘要，不形成另一份可独立覆盖的主文稿。适配 CSP 可能需要提取内联脚本 / 事件绑定；不支持的写法报告具体原因，不静默删掉交互。
- 拟议清单包含 profile / runtime 版本、入口资产、完整依赖及摘要、必需能力、状态 schema 版本、静态预览和可访问的文本摘要。字段名和 schema 待原型后冻结；不能通过现有未知 JSON 字段夹带脚本。
- 程序定义仍由 `interactive/<blockId>.nomi-ui.json` 引用内容寻址资产。精确路径与 MIME 扩展需更新 [包格式](nomi-package-format.md) 后才支持；当前 `.html` 附件不会因此获得执行权限。
- 无需连接网络即可运行。CDN 链接不能直接执行；依赖在导入准备阶段解析并随包或版本化 runtime 分发，检查摘要和许可证。运行期间不安装 npm、拉取脚本或执行构建命令。
- 导入的代码和 AI 生成的代码同等不可信。完整候选通过结构检查并在隔离环境验证后原子替换；失败保留旧版本。流式生成只显示骨架 / 状态，不执行未收齐的脚本。
- 先交付未知 profile 的安全保留 / 预览 / 往返，再允许产生新内容。旧客户端当前可能拒绝未知程序，不能把“以后可以回退”当成已有兼容能力。同步服务只保存原件和校验引用，不运行代码生成预览。

## 各端运行方式

原生 App 可以包含 WebView；“外壳原生”和“交互内容使用 Web”可以同时成立。

| 平台 | 拟议容器 | 必须处理的差异 |
| --- | --- | --- |
| macOS / Windows / Linux | 单独的 Electron `WebContentsView`，独立临时 session 与来源 | 主进程负责位置 / 裁切 / 焦点；系统字体、缩放、GPU 和输入法仍需逐端验收 |
| iOS，Swift 外壳 | `WKWebView`，新建非持久化 data store，本地资源映射 | WebKit 兼容性、触摸 / 键盘、内存压力、内容进程退出恢复 |
| Android，Java 外壳 | Android WebView，本地 `WebViewAssetLoader` 路线 | 系统 WebView 版本差异、桥来源校验、存储隔离、共享 renderer 与退出恢复 |

不采用 Electron `<webview>` 标签作为新基础；官方推荐考虑其他嵌入方案。`WebContentsView` 不在 DOM 中，内嵌长文稿会有滚动、弹层遮挡和选区协调成本，不能只凭一个静态 demo 宣称完成。[Electron 嵌入指南](https://www.electronjs.org/docs/latest/tutorial/web-embeds/)

统一的是 HTML 程序、资源、状态协议和能力基线，不是统一浏览器二进制。首版支持响应式 HTML / CSS、DOM / SVG / Canvas 2D、常规 JavaScript 和锁定版本的动画库。WebGL / WebGPU、Worker、Service Worker、WASM、任意网络和原生设备能力不列入首版可用能力；不能只靠清单声明或替换 JS 全局变量宣称已禁用，须有对应平台的强制策略与反例测试，不能可靠收敛的平台不启用该 profile。

窄屏重排、触摸替代 hover、系统大字号、深色、减少动态效果和中文输入必须能用。用 feature detection + runtime 版本协商决定能否执行，不用 UA 猜测。字体可随包提供合法子集；不承诺系统字体下完全相同的换行。纯浏览器预览也不能直接继承 Electron 的安全认证。

## 安全边界

威胁模型包含恶意导入、AI 生成错误、依赖被替换，以及合法代码的死循环 / 内存暴涨。结构校验、AI 审查、代码签名和摘要均不能证明任意 JS 安全。摘要证明字节一致，不证明代码可信。

### 1. 内容与应用分离

```text
Nomi 文稿与宿主：保存、身份、账号、撤销、运行 / 停止入口
    │ 仅本块有界消息；由宿主绑定 blockId / revision
独立 Web 容器：受信启动页、资源策略、最小桥接
    │ 绑定实例的 MessagePort
不可信 HTML：opaque-origin sandbox frame，仅 allow-scripts
```

以上是待验证的共同拓扑。iframe 提供 DOM / 来源和能力约束，外层专用容器提供宿主控制与生命周期；二者都不是自动的 CPU / 内存配额。

- Electron 显式保留 `sandbox:true`、`contextIsolation:true`、`nodeIntegration:false`、`webSecurity:true`。不复用应用 preload / IPC。若需要 preload，只给受信启动页专用的最小传输实现，不导出任意 IPC、文件、shell 或网络代理。主应用 CSP 不放宽。
- 不可信 frame 不授予 `allow-same-origin`、顶层导航、弹窗、表单或下载权限。受信启动页自身不渲染用户 HTML，不用用户字符串构造可执行脚本。
- 容器不能读取主应用 Cookie、Token、文稿目录或其他块。本地资源 loader 只能查询本实例不可变资源表，校验规范化路径、摘要和大小，拒绝目录穿越、跨块资源和任意 `file:` / `content:` 路径。
- iOS 的非持久化 store 解决落盘及会话隔离的一部分；`WKContentWorld` 只隔离 JS 变量环境，不隔离 DOM，不能拿它代替来源隔离。Android 不能假设每个 WebView 自带独立 Cookie / 存储，必须验证 profile 或独立运行进程的数据隔离方案，且不与登录视图共用数据环境。

依据：[Electron 进程沙箱](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[WKContentWorld](https://developer.apple.com/documentation/webkit/wkcontentworld)、[非持久化 store](https://developer.apple.com/documentation/webkit/wkwebsitedatastore/nonpersistent())。

### 2. 默认离线，逐层限制出口

资源只从宿主登记的本地资产集合供应，不暴露资料库目录。策略由宿主在内容执行前施加，不能由 HTML 自行声明后再自行移除。CSP 默认拒绝，只允许已核验的必要脚本 / 样式 / 图像 / 字体；不使用 `unsafe-eval`。frame 自导航、子 frame、刷新跳转、外链、下载、JS dialog 与设备权限也必须受控。

Electron 在专用 session 拦截请求 / 权限和导航；iOS 组合本地 scheme handler、内容规则和导航委托；Android 组合 AssetLoader、请求 / 导航限制与权限拒绝。任何未命中本地资源表的请求失败，绝不回落到真实网络。拒绝外部协议调用和 localhost / 内网访问。

**这些 API 不等于通用防火墙。** Android 官方说明请求拦截不覆盖所有 URL 类型，且重定向只回调最初 URL；iOS 的导航委托也不能当作全部子资源拦截。CSP `connect-src` 单独不足以证明所有出站通道均被覆盖。要测试 fetch / XHR、图片 / 字体 / CSS、WebSocket、EventSource、beacon、导航 / 重定向、DNS 预取及 WebRTC 等路径，结合网络侧观测确认。只屏蔽 `fetch` 没有安全意义。

“无网络能力”是发行门槛，不是这份设计已经证明的事实。某平台无法强制收敛任意脚本的出口时，继续只读预览 / DSL，不通过文字免责声明开放执行。不承诺抵抗未修复的浏览器内核漏洞；内核更新和 runtime 紧急禁用机制属于维护成本。

依据：[Android 本地资源](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[请求拦截边界](https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest))。

### 3. 桥接只服务当前交互块

第一阶段先验证无持久化桥的 HTML；需要进度保存时再增加版本化、有界 JSON 契约：初始化快照、保存本块状态、报告准备完成 / 尺寸 / 错误。主题、语言、减少动画等由宿主单向传入。复制、导出和停止按钮由 Nomi 外层实现，不授予 guest 通用剪贴板 / 文件权限。

宿主校验实际 WebContents / frame、会话身份、协议版本、实例 revision、消息序号和大小 / 频率；opaque origin 的 `null` 不是身份。MessagePort 在受信握手后绑定实例，导航、销毁、源修改立即吊销。guest 自报的 blockId / documentId 不参与授权，不能要求读写别的块。HTML 自报 `ready` 不等于验收成功。

Android 不向不可信页面注入 `addJavascriptInterface`；该接口暴露给所有 frame，不能可靠判定调用来源。最小桥只接受受信启动页的精确来源和 frame，启动页再通过已绑定端口转发受校验消息。若平台无法满足此条件，保留无桥运行，不扩大匹配为 `*`。[Android 原生桥安全说明](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)

学习状态与 HTML 源分开保存。state schema 变化没有声明兼容迁移时保留旧进度、以新初值运行；不在宿主执行用户迁移 JS。修改代码是新源 revision；关闭 / 替换后到达的旧状态消息不能写回新程序。

### 4. 卡死与资源耗尽

外层宿主拥有启动、停止、销毁和预览回退，控制条永远不放在不可信页面内。首版一篇文稿最多一个活跃 HTML 块；其余静态预览。切换文稿 / 进入后台释放或冻结实例，不能只给 guest 发“请暂停”消息便相信它停止了。

独立 WebContents / WebView 不自动等于独占 OS 进程；必须确认正文与 guest 的实际进程关系。宿主 watchdog 在 guest 之外运行，检测失联 / 超预算，停止并恢复预览。心跳可被恶意脚本伪造，也不能覆盖 GPU / 内存耗尽，因此只能作为其中一个信号。关闭 UI 和终止执行是两个不同验收项。

Electron 沙箱本身不限制 CPU / 内存。Android 终止 renderer 可能影响多个 WebView，所有相关实例都需处理退出。iOS 提供内容进程退出通知，但不能据此承诺公开 API 可随时定点杀掉一个独占内容进程；销毁后的实际停止、回收和宿主响应必须实机验证。这也是先限制活跃实例和 2D 范围的原因。

包体、单资源、状态、消息大小 / 频率可以设置硬限额；CPU / RAM / GPU 预算须区分可观测阈值与可强制配额。数值由参考设备基准后固定，内容只能降低预算。不能用 guest 内 `setTimeout`、`Promise.race` 或代码扫描代替终止机制。

依据：[Electron 沙箱边界](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[Android renderer 终止](https://developer.android.com/reference/androidx/webkit/WebViewRenderProcess)、[WebKit 进程退出通知](https://developer.apple.com/documentation/webkit/wknavigationdelegate/webviewwebcontentprocessdidterminate(_:))。

## 使用体验与跨端状态

正常阅读先展示预览；用户点击后激活同一区域，外层保留停止 / 展开入口。新导入或新代码 revision 的预览不自动执行脚本，不给每个普通按钮重复弹确认。代码编辑与运行资格绑定同一摘要，不能修改后沿用旧验证结果。

隔离原型先在独立阅读面板验证安全与操作，再验证正文内嵌的滚动裁切、浮层、复制 / 删除、焦点和撤销。手机可以在正文显示预览，点击展开较大交互区域，避免小屏内多重滚动；HTML 本身仍要求响应式。原型面板不算最终内嵌体验已交付。

不支持的 runtime 显示静态预览、简短提示，完整保存源文件。回退预览仅限安全图片 / 文本，不能用另一个未经隔离的 HTML 做 fallback。暂不支持 HTML 的端仍可安全编辑周围正文，前提是未知内容保留契约已经交付。

## 原型、验收与停止条件

本轮不启动实现。确认后先落 execution plan，按以下门槛推进；桌面通过不等于手机通过，WebKit 浏览器模拟也不替代真实 WKWebView。

| 阶段 | 验收内容 | 通过条件 |
| --- | --- | --- |
| A：最小宿主 | Electron、Swift WKWebView、Java WebView 各一个隔离验证器，无账号和真实资料 | 同一自包含 HTML 能离线运行；记录引擎 / 系统 / 设备版本和实际进程边界 |
| B：安全反例 | 文稿 / Cookie / 文件探测、跨块消息、伪造来源、迟到状态、联网 / 跳转 / 权限、死循环、DOM / 内存 / 消息洪泛 | 越权与外联被阻断；停止后不继续运行；宿主正文可输入、保存且没有跨块状态污染 |
| C：视觉与教学 | 原版 BPE HTML、Temperature Lab、小矩阵动画 | BPE 拆分 / 计数 / 合并 / special token / 编号动画保留；快速前后 / 重置正确；手机触摸、大字号和减少动态效果可用 |
| D：文稿集成 | 预览 / 激活 / 停止、窄屏、复制 / 导入 / 源编辑、离线重开、未知版本往返、同步冲突 | 一份源可复现，旧内容不损坏；最终状态 / 规则与独立 fixture 一致；长文稿滚动和保存不中断 |

每端保留资源曲线和实际网络观测，不能只依赖页面自报。发生可复现越权、未阻断外联或无法停止的持续执行，该平台不开放任意 HTML。若产品要求完全原生控件或比浏览器沙箱更严格的可验证执行边界，继续 DSL；不要为了让样例跑起来削弱隔离。

iOS 发布前另核对实际分发模式对应的 App Review 2.5.2 / 4.7：HTML / JS 内容在特定条件下可提供，但不因此自动获准暴露原生 API 或任意分发软件。文稿附件的具体审核归类尚未确认，不把技术原型通过当成审核结论。[Apple 审核指南](https://developer.apple.com/app-store/review/guidelines/#mini-apps-mini-games-streaming-games-chatbots-plug-ins-and-game-emulators)

建议先完成 A / B，再投入 HTML 生成 Skill 和正文体验。现有 BPE DSL 保留作为基准与稳定版本，不进行批量替换。
