# Duo 格式面板的边距与圆角

按备忘录录屏的轮廓调整 Aa 面板。原面板依附于文稿列，宽度上限为 620 pt，底部留白还包含安全区。现在由当前文稿提供面板和格式命令，工作区将其固定在整个窗口底部。展开内屏常驻目录时仍可利用目录下方的空间。

面板左右和底边各留 8 pt。上面两个角的半径均为 38 pt，下面两个角通过 SwiftUI 的 `ConcentricRectangle` 分别适配相邻屏幕边缘，直边一侧最小半径为 8 pt。主要改动在 `ManuscriptEditor.swift`、`ManuscriptFormat.swift` 与 `NomiMobileApp.swift`。[Apple 对备忘录格式面板同心圆角的说明](https://developer.apple.com/documentation/swiftui/concentricrectangle)

Duo 模拟器折叠三向、展开四向均从正文调出键盘并打开 Aa。逐张比对系统报告的面板边框与截图，七种状态的左、右、下间距均为 8 pt。折叠竖向左下小、右下大；外屏 90° 两个底角较大，270° 两个底角较小；内屏四向两个底角均为大圆角。原生文稿编辑界面回归通过，包含三条边距断言、面板开闭、应用粗体及重开文稿的检查。开发构建已安装到配对 Duo。[七种姿态的实测截图](../../generated/verification/mobile-documents/duo-format-panel-edges.jpg)
