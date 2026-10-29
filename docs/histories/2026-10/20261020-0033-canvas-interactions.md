## [2026-10-20 00:33] | Task: 画布选框、对齐与连接

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex Desktop

### 📥 User Query

> 精简八个锚点，修正四边 / 四角 hover 光标；参考成熟画布补齐拖动对齐参考线、形状连接、箭头 / 虚线等功能，并自行截图检查。

### 🛠 Changes Overview

**Scope:** 画布领域契约、几何、共享 UI、样例和真实 Electron 验证。

- 选中态改为四个轻量角点，保留八方向热区；显式覆盖全局按钮光标，角点 / 命中区随 zoom 保持屏幕大小。
- 新增视口内边缘 / 中心吸附与瞬态参考线，6 屏幕像素阈值；Alt 临时关闭、Shift 锁轴。
- Board 增加可选 Connector 数组，端点绑定 Placement / side；新增创建、更新、改接、标签、曲线 / 折线 / 直线、实虚线、起终箭头与删除；实际框高度变更后几何随动。
- 删除摆放原子清除关联连接，Undo 同时恢复；严格校验端点 / 枚举 / 唯一 ID / 数量预算，旧文档无连接字段仍可打开。
- 新增矩形 / 椭圆 / 菱形、文字、颜色、层级、方向键微移与复制快捷键；形状本体可拖动并双击编辑。
- 体验区从 8 项扩展至 11 项，追加三种形状与两条示例连接，不重置已编辑正文、位置和参数。
- 新增 9 个核心几何 / 连接测试，扩充原生鼠标吸附 / 锁轴 / Alt、光标、四角可见性、形状编辑 / 拖动、连线 / 改接 / 样式 / 跟随、关联删除撤销及刷新恢复测试。

### 🧠 Design Intent (Why)

缩放控制、连接端口与内容编辑各有清楚的用途；几何反馈保留在视图层，最终关系与位置写入平台中立 DSL。参考成熟产品的交互边界，继续使用自有语义模型，避免引入第二份编辑器真相源。

### 📁 Files Modified

- `packages/core/src/canvas/document.ts`、`geometry.ts`、`geometry.test.ts`、`index.ts`
- `packages/ui/src/pages/Canvas.tsx`
- `packages/ui/src/canvas/CanvasConnections.tsx`、`CanvasContent.tsx`、`canvas.css`
- `packages/ui/src/canvas/examples.ts`、`examples.test.ts`
- `scripts/check-canvas.mjs`
- `docs/design-docs/canvas-workspace-runtime.md`、`notes-canvas-dsl.md`、`notes-infinite-canvas.md`
- `docs/references/canvas-interactions.md`、`docs/references/README.md`
- `docs/ARCHITECTURE.md`、`docs/DESKTOP.md`、`docs/QUALITY_SCORE.md`、`docs/releases/feature-release-notes.md`
- `docs/exec-plans/completed/20261020-canvas-interactions.md`、`docs/exec-plans/tech-debt-tracker.md`

### 验证与视觉复查

- `pnpm check`、`pnpm test`（49 文件 / 277 个测试）、`pnpm build`、完整 `pnpm smoke:desktop` 通过；类型 / 格式和仓库基础 CI 检查通过。
- Electron 合成 profile 中使用原生鼠标拖动 / 连线 / 改接，检查全部八方向 cursor 与只有四个可见锚点；没有发起外部网络请求。
- 实际查看浅色、深色、窄屏和拖动参考线截图，发现已有 `.tone-blue` 全局样式污染形状背景，改为专用类名后重新截图确认椭圆外部透明；同时调整合成笔记高度避免示例被截断。
- 截图：`docs/generated/verification/nomi-canvas-alignment-2026-10-20.png`、`nomi-canvas-connections-2026-10-20.png`、`nomi-canvas-connections-dark-2026-10-20.png`、`nomi-canvas-interactions-narrow-2026-10-20.png`。
- 实际 App 已加载新工具，新增示例保存到本机，停在第 09 项，旧正文与布局保留。

### 当前边界

折线是简单方向路由，尚未避障。多选 / 分组、等距分布、旋转、锁定、手写和协作同步继续留在后续清单；不宣称本轮等同完整成熟白板产品。

### 后续调整：选框上层与直接拖线

- 按用户提供的参考，选中态改为蓝色矩形选框 / 四个白底蓝边方形角点，放入独立控制层，保证形状和正文不会遮住锚点。
- 选中对象即显示四边浅蓝圆点；24 屏幕像素命中区围绕 10 像素圆点，圆心距边界 24 像素。选择工具下可直接拖出箭头，拖动中其他对象显示目标连接点。
- 使用指针位置命中真实端口，解决圆点外偏后松手无法绑定的问题；连接最终仍绑定 Placement / side，线端落在对象边界。形状浮动操作栏上移，避开顶部连接点。
- 扩充 Electron 回归：控制层命中不被内容覆盖、选中时四点可见、选择模式直接拖线与拖动目标显隐；原有八方向缩放、撤销、改接和刷新恢复继续验证。

验证：`pnpm check`、`pnpm build` 和扩充后的 `pnpm smoke:canvas` 通过；格式与 diff 检查通过。复查实际 App 的第 09 项矩形样例，以及合成 profile 的椭圆选框 / 四侧圆点 / 对齐线截图，已保存 `docs/generated/verification/nomi-canvas-selection-ports-2026-10-20.png`。实际 App 已刷新并停在第 09 项，可直接拖点体验。

用户补充交付约定：以后每次完成 App 修改都需要重启，让用户直接看到最新版本。已写入 `docs/REPO_COLLAB_GUIDE.md`，要求构建、确认保存、退出重启并前台验证，保留用户数据。

### 后续修正：形状边界与选框重合

- 用户指出矩形四角和选框仍与形状有间隙。原因是 SVG 图形使用 1% 内缩和较大圆角，选框却使用完整摆放边界。
- 图形几何改为覆盖完整 viewBox，矩形改为直角；选框描边以相同边界为中心，四角锚点中心与矩形顶点重合。连接关系、摆放坐标和用户内容保持原值。
- Electron 回归增加缩小 / 100% / 放大时三种形状的几何、选框和角点坐标一致性，并检查矩形直角和选框描边位置。

验证：`pnpm check`、`pnpm build`、扩充后的 `pnpm smoke:canvas` 通过；已查看矩形选框截图，确认没有内外双框间隙。截图归档为 `docs/generated/verification/nomi-canvas-rectangle-bounds-2026-10-20.png`。

已确认本机画布保存后退出并重启 Nomi；在前台实际截图中确认矩形边界、蓝色选框和四角方点贴合。
