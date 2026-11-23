import SwiftUI

@main
struct NomiMobileApp: App {
    @State private var library = Library()
    @State private var cloud = MobileCloud()

    var body: some Scene {
        WindowGroup { Workspace(library: library, cloud: cloud).tint(.primary) }
    }
}

private extension EnvironmentValues {
    var manuscriptToolbarEdge: HorizontalEdge? {
        if #available(iOS 27.1, *) { return toolbarVerticalEdge }
        return nil
    }
}

struct Workspace: View {
    @Environment(\.manuscriptToolbarEdge) private var toolbarEdge
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let library: Library
    let cloud: MobileCloud
    @State private var accountPanel = false
    @Environment(\.scenePhase) private var scene
    private var syncConnected: Bool { cloud.session?.spaceID != nil }
    private var needsSyncAttention: Bool { syncConnected && (!cloud.replica.pending.isEmpty || cloud.message != nil) }
    private var notes: [Manuscript] { cloud.notes + library.notes }
    @AppStorage("lastManuscript") private var lastID = ""
    @AppStorage("expandedManuscriptBranches") private var branchData = Data()
    @State private var pinned = true
    @State private var drawer = false
    @State private var sidebarScrollRow: UUID?
    @Observable final class EditSession {
        var draft: Manuscript
        let original: Manuscript
        let caret: ManuscriptCaret?
        let format: ManuscriptFormat?
        weak var input: UITextView?
        var canUndo = false
        weak var richWindow: UIWindow?
        var richUndo: (() -> Void)?

        init(draft: Manuscript, original: Manuscript, caret: ManuscriptCaret? = nil, format: ManuscriptFormat? = nil) {
            self.draft = draft
            self.original = original
            self.caret = caret
            self.format = format
        }
    }

    @State private var editing: EditSession?
    @State private var deleting: Manuscript?
    @State private var finding: Manuscript?
    @State private var moving: Manuscript?
    @AppStorage("manuscriptEditLocks") private var editLockData = Data()
    @State private var searchPresented = false
    @State private var dragDistance: CGFloat?
    @State private var closedToRight = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var current: Manuscript? {
        notes.first { $0.id.uuidString == lastID } ?? notes.first
    }

    var body: some View {
        GeometryReader { geo in layout(in: geo) }
        .background {
            WorkspaceRotationObserver {
                editing?.input?.unmarkText()
                finishEditing()
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .task(id: "\(cloud.session?.spaceID ?? "")/\(scene == .active)") {
            guard cloud.session?.spaceID != nil, scene == .active else { return }
            while !Task.isCancelled {
                await cloud.sync()
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidHideNotification)) { event in
            // Commit only a completed dismissal in this editor's window. A cancelled drag
            // or a focus change between text blocks keeps the editing session alive.
            guard let session = editing, let window = session.richWindow ?? session.input?.window,
                  window.isKeyWindow,
                  (event.object as? UIScreen).map({ $0 == window.windowScene?.screen }) ?? true,
                  session.richWindow != nil || session.input?.isFirstResponder == false else { return }
            finishEditing()
        }
        .onChange(of: scene) { _, phase in if phase != .active { cloud.pause() } }
        .onChange(of: cloud.session?.spaceID) { _, _ in
            if editing?.original.remoteID != nil { editing = nil }
        }
        .fullScreenCover(isPresented: $searchPresented) {
            ManuscriptSearch(notes: notes, loading: syncConnected && cloud.busy && !cloud.replica.initialized) { note in
                open(note)
                searchPresented = false
            }
        }
        .fullScreenCover(isPresented: $accountPanel) { CloudPanel(cloud: cloud, library: library) }
        .sheet(item: $finding) { note in
            NavigationStack {
                ManuscriptFind(note: note)
                    .navigationTitle("文内查找")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("关闭") { finding = nil } }
                    }
            }
        }
        .sheet(item: $moving) { note in
            let destinations = note.destinationIDs(in: notes)
            NavigationStack {
                List {
                    if note.parentID != nil {
                        Button("根目录", systemImage: "folder") { move(note, to: nil) }
                    }
                    ForEach(outline.rows.filter { destinations.contains($0.id) }) { row in
                        Button { move(note, to: row.id) } label: {
                            Label(row.note.title, systemImage: "doc.text")
                                .padding(.leading, CGFloat(min(row.depth, 6)) * 12)
                        }
                    }
                }
                .overlay {
                    if note.parentID == nil && destinations.isEmpty {
                        ContentUnavailableView("没有可用的目标文稿", systemImage: "folder")
                    }
                }
                .navigationTitle("移动文稿")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { moving = nil } } }
            }
        }
        .onChange(of: editLockData) {
            if let editing, isLocked(editing.original) { finishEditing() }
        }
        .alert("删除文稿？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), presenting: deleting) { note in
            Button("取消", role: .cancel) { }
            Button("删除", role: .destructive) {
                do {
                    if note.remoteID == nil { try library.delete(note) } else { try cloud.remove(note) }
                } catch { library.problem = error.localizedDescription }
            }
        } message: { note in Text(note.remoteID == nil ? "“\(note.title)”将从此设备删除。" : "“\(note.title)”也会从其他已同步的设备删除。") }
        .alert("文稿资料库", isPresented: Binding(get: { library.problem != nil }, set: { if !$0 { library.problem = nil } })) {
            Button("好") { library.problem = nil }
        } message: { Text(library.problem ?? "") }
    }

    @ViewBuilder private func layout(in geo: GeometryProxy) -> some View {
        let regularPhone = horizontalSizeClass == .regular && UIDevice.current.userInterfaceIdiom == .phone
        let rail = toolbarEdge
        let wide = regularPhone ? rail != nil : geo.size.width >= 700 && geo.size.width > geo.size.height
        let inset: CGFloat = switch rail {
        case .leading: geo.safeAreaInsets.leading
        case .trailing: geo.safeAreaInsets.trailing
        case nil: 0
        }
        let usesRail = rail != nil
        let sideWidth: CGFloat = if wide {
            min(290, geo.size.width * 0.32)
        } else if usesRail {
            geo.size.width + inset - 96
        } else {
            min(310, geo.size.width * 0.85)
        }
        if #available(iOS 27.1, *), usesRail || regularPhone {
            let portraitDrawer = !wide && !usesRail
            NavigationStack {
                workspaceContent(wide: wide, rail: rail, nativeToolbar: true, sideWidth: sideWidth, inset: inset)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        if !portraitDrawer || !drawer {
                            ToolbarItem(placement: .cancellationAction) {
                                directoryToggle(expanded: wide ? pinned : drawer) {
                                    if wide { pinned.toggle() } else { toggleDrawer() }
                                }
                            }
                            .axisBehavior(.verticalPreferred)
                        }
                        if let editing, wide || !drawer {
                            // UIKit adds the navigation and completion actions here when the rail runs out of room.
                            ToolbarOverflowMenu {
                                Button("撤销", systemImage: "arrow.uturn.backward") {
                                    if let undo = editing.richUndo { undo() } else { editing.input?.undoManager?.undo() }
                                }
                                    .disabled(!editing.canUndo)
                            }
                            ToolbarItem(placement: .topBarPinnedTrailing) {
                                Button("完成编辑", systemImage: "checkmark") { finishEditing() }
                                    .buttonStyle(.borderedProminent)
                                    .tint(Color(red: 0.78, green: 0.62, blue: 0.18))
                                    .accessibilityHint("保存文稿并收起键盘")
                                    .accessibilityIdentifier("finishEditing")
                            }
                            .axisBehavior(.verticalPreferred)
                        } else if wide || !drawer || portraitDrawer {
                            ToolbarItemGroup(placement: .topBarTrailing) {
                                ShareLink(item: current?.shareText ?? "") {
                                    Label("分享文稿", systemImage: "square.and.arrow.up")
                                }
                                .disabled(current == nil)
                                .accessibilityHidden(portraitDrawer && drawer)
                                Menu("更多操作", systemImage: "ellipsis") {
                                    if let note = current { documentActions(note) }
                                    if needsSyncAttention {
                                        Button(cloud.message ?? "待同步", systemImage: "icloud") { accountPanel = true }
                                    }
                                }
                                .disabled(current == nil && !needsSyncAttention)
                                .accessibilityHidden(portraitDrawer && drawer)
                            }
                            .axisBehavior(.verticalPreferred)
                        }
                    }
            }
            .accessibilityHidden(portraitDrawer && drawer)
            .allowsHitTesting(!(portraitDrawer && drawer))
            .overlay(alignment: .leading) {
                if portraitDrawer {
                    drawerLayer(sideWidth: sideWidth, rail: nil, nativeToolbar: true)
                        .ignoresSafeArea(.container, edges: .vertical)
                        .accessibilityElement(children: .contain)
                        .accessibilityHidden(!drawer)
                        .allowsHitTesting(drawer)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: drawer)
                }
            }
            .gesture(sidebarPan(width: sideWidth, wide: wide))
            .ignoresSafeArea(.container, edges: usesRail ? (rail == .leading ? .leading : .trailing) : [])
        } else {
            workspaceContent(wide: wide, rail: rail, nativeToolbar: false, sideWidth: sideWidth, inset: inset)
                .gesture(sidebarPan(width: sideWidth, wide: wide))
        }
    }

    private let bottomActionInset: CGFloat = 24

    private func workspaceContent(wide: Bool, rail: HorizontalEdge?, nativeToolbar: Bool, sideWidth: CGFloat, inset: CGFloat) -> some View {
        let usesRail = rail != nil
        let leading = rail == .leading
        let railEdges: Edge.Set = usesRail ? (leading ? .leading : .trailing) : []
        let visibleWidth = min(sideWidth, max(0, (pinned ? sideWidth : 0) + (dragDistance ?? 0)))
        return ZStack(alignment: .leading) {
            HStack(spacing: 0) {
                if wide {
                    sidebar(compact: false, usesRail: usesRail, nativeToolbar: nativeToolbar)
                        .frame(width: sideWidth)
                        .ignoresSafeArea(.all, edges: .bottom)
                        .overlay(alignment: .trailing) {
                            Divider()
                                .background(Color(uiColor: .secondarySystemBackground), ignoresSafeAreaEdges: [])
                                .ignoresSafeArea(.container, edges: .vertical)
                        }
                        .modifier(SlidingSidebar(offset: visibleWidth - sideWidth, width: sideWidth))
                        .frame(width: visibleWidth, alignment: .leading)
                        .allowsHitTesting(pinned)
                        .accessibilityHidden(!pinned)
                }
                detail(wide: wide, nativeToolbar: nativeToolbar).frame(maxWidth: .infinity)
                    .accessibilityHidden(!wide && drawer)
            }
            .padding(railEdges, inset)
            if !wide && (usesRail || !nativeToolbar) {
                drawerLayer(sideWidth: sideWidth, rail: rail, nativeToolbar: nativeToolbar)
            }
            VStack(spacing: 12) {
                if usesRail && !wide && drawer {
                    accountAndSearch(vertical: true)
                }
                if editing == nil && (nativeToolbar || wide || !drawer) {
                    composeButton
                }
            }
            .padding(leading ? .leading : .trailing, 24)
            .padding(.bottom, bottomActionInset)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: leading ? .bottomLeading : .bottomTrailing)
            .ignoresSafeArea(wide ? .all : .container, edges: .bottom)
        }
        // Duo reserves a side rail for system controls. The floating controls use the rail while the reader respects its inset.
        .ignoresSafeArea(.container, edges: railEdges)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: drawer)
        .animation(reduceMotion ? nil : .snappy(duration: 0.24), value: pinned)
        .background { if wide { Color.clear.contentShape(Rectangle()) } }
        .onChange(of: wide) { _, _ in drawer = false; dragDistance = nil; closedToRight = false }
    }

    private func drawerLayer(sideWidth: CGFloat, rail: HorizontalEdge?, nativeToolbar: Bool) -> some View {
        let usesRail = rail != nil
        let shift = drawer ? min(sideWidth, max(-sideWidth, dragDistance ?? 0)) :
            dragDistance.map { min(sideWidth, max(0, $0)) - sideWidth } ?? (closedToRight ? sideWidth : -sideWidth)
        let reveal = 1 - abs(shift) / max(1, sideWidth)
        return ZStack(alignment: .leading) {
            Color.black.opacity((usesRail ? 0.21 : (nativeToolbar ? 0.5 : 0.24)) * reveal)
                .ignoresSafeArea().onTapGesture { drawer = false }
                .allowsHitTesting(drawer).accessibilityHidden(true)
            sidebar(compact: true, usesRail: usesRail, nativeToolbar: nativeToolbar)
                .frame(width: sideWidth)
                .modifier(SlidingSidebar(offset: shift, width: sideWidth))
                .frame(width: sideWidth)
                .mask { Rectangle().ignoresSafeArea(.container, edges: .vertical) }
                .padding(.leading, rail == .leading ? 96 : 0)
                .ignoresSafeArea(.container, edges: usesRail ? .vertical : .bottom)
                .allowsHitTesting(drawer)
                .accessibilityHidden(!drawer)
        }
    }

    private func toggleDrawer() {
        if drawer || finishEditing() { drawer.toggle() }
    }

    private func sidebarPan(width sideWidth: CGFloat, wide: Bool) -> SidebarPan {
        let isOpen = wide ? pinned : drawer
        return SidebarPan(isOpen: isOpen, columnWidth: wide ? sideWidth : nil) { distance in
            dragDistance = distance
        } onRelease: { distance, velocity, cancelled in
            let projected = distance + velocity * 0.16
            let progress = isOpen ? (wide ? -projected : abs(projected)) : projected
            let settle = progress > sideWidth * 0.45
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) {
                if !cancelled && settle {
                    if wide {
                        pinned.toggle()
                    } else {
                        closedToRight = drawer && distance > 0
                        toggleDrawer()
                    }
                }
                dragDistance = nil
            } completion: {
                if !drawer && dragDistance == nil { closedToRight = false }
            }
        }
    }

    private func save(_ note: Manuscript, original: Manuscript) throws -> UUID {
        if original.remoteID != nil { return try cloud.save(note, original: original) }
        try library.save(note)
        return note.id
    }

    @discardableResult private func finishEditing() -> Bool {
        guard let editing else { return true }
        do {
            lastID = try save(editing.draft, original: editing.original).uuidString
            self.editing = nil
            return true
        } catch {
            library.problem = error.localizedDescription
            return false
        }
    }

    private func create(under parent: Manuscript? = nil) {
        guard finishEditing() else { return }
        do {
            var blank = Manuscript()
            blank.parentID = parent?.id
            let createSynced = parent.map { $0.remoteID != nil } ?? syncConnected
            let id: UUID
            if createSynced {
                id = try cloud.save(blank, original: nil)
            } else {
                try library.save(blank)
                id = blank.id
            }
            guard let created = notes.first(where: { $0.id == id }) else { throw LibraryError.conflict }
            var draft = created
            draft.title = ""
            revealAncestors(of: created.id)
            lastID = id.uuidString
            drawer = false
            editing = EditSession(draft: draft, original: created, caret: .title)
        } catch { library.problem = error.localizedDescription }
    }

    private var outline: ManuscriptOutline { ManuscriptOutline(notes) }

    private var expandedBranches: Set<UUID> {
        (try? JSONDecoder().decode(Set<UUID>.self, from: branchData)) ?? []
    }

    private func setBranches(_ branches: Set<UUID>) {
        if let data = try? JSONEncoder().encode(branches) { branchData = data }
    }

    private func revealAncestors(of id: UUID) {
        let expanded = expandedBranches
        let updated = expanded.union(outline.ancestors(of: id))
        if expanded != updated { setBranches(updated) }
    }

    private func open(_ note: Manuscript) {
        guard finishEditing() else { return }
        revealAncestors(of: note.id)
        lastID = note.id.uuidString
        drawer = false
    }

    private var finishButton: some View {
        Button { finishEditing() } label: {
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(Color(red: 0.78, green: 0.62, blue: 0.18), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("完成编辑")
        .accessibilityHint("保存文稿并收起键盘")
        .accessibilityIdentifier("finishEditing")
    }

    private var composeButton: some View {
        Button { create() } label: {
            Image(systemName: "square.and.pencil").font(.system(size: 22, weight: .regular))
                .frame(width: 48, height: 48).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(CircularGlass())
        .accessibilityLabel("新建文稿")
        .accessibilityHint("在根目录下创建")
        .accessibilityIdentifier("newRoot")
        .disabled(syncConnected && !cloud.replica.initialized)
    }

    private func iconButton(_ label: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).frame(width: 44, height: 44).contentShape(Rectangle())
        }.accessibilityLabel(label).buttonStyle(.plain)
    }

    @ViewBuilder private func directoryToggle(expanded: Bool, action: @escaping () -> Void) -> some View {
        if expanded {
            Button("收起目录", systemImage: "xmark", action: action)
                .accessibilityIdentifier("收起目录")
        } else {
            Button("打开目录", image: .directoryMenu, action: action)
                .accessibilityIdentifier("打开目录")
        }
    }

    private func directoryButton(expanded: Bool, action: @escaping () -> Void) -> some View {
        let button = directoryToggle(expanded: expanded, action: action)
            .labelStyle(.iconOnly)
            .font(.title3)
            .controlSize(.large)
            .buttonBorderShape(.circle)
        return Group {
            if #available(iOS 26, *) { button.buttonStyle(.glass) }
            else { button.buttonStyle(.bordered) }
        }
    }

    @ScaledMetric(relativeTo: .title2) private var brandScale: CGFloat = 1

    private func brand(coverRail: Bool) -> some View {
        Image("SidebarWordmark")
            .resizable()
            .scaledToFit()
            .frame(height: (coverRail ? 40 : 29) * brandScale)
            .foregroundStyle(.primary)
            .accessibilityLabel("Nomi")
    }

    private var accountButton: some View {
        Button { if finishEditing() { accountPanel = true } } label: {
            Group {
                if let email = cloud.session?.email {
                    Text(String(email.prefix(1)).uppercased()).font(.headline)
                        .foregroundStyle(.white).frame(width: 32, height: 32)
                        .background(Color.indigo, in: Circle())
                } else { Image(systemName: "person.crop.circle").font(.title2) }
            }.frame(width: 48, height: 48)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(cloud.session == nil ? "登录 Nomi" : "个人设置")
        .accessibilityIdentifier("sidebarAccount")
    }

    private func accountAndSearch(vertical: Bool) -> some View {
        let layout = vertical ? AnyLayout(VStackLayout(spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
        return layout {
            if vertical { accountButton }
            Button {
                if finishEditing() { searchPresented = true }
            } label: {
                Image(systemName: "magnifyingglass").font(.title3)
                    .frame(width: 48, height: 48).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("搜索文稿")
            .accessibilityIdentifier("openSearch")
            if !vertical { accountButton }
        }
        .modifier(CapsuleGlass())
    }

    private func sidebar(compact: Bool, usesRail: Bool, nativeToolbar: Bool) -> some View {
        let coverRail = compact && usesRail
        let gutter: CGFloat = compact ? (coverRail ? 28 : 20) : 32
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                brand(coverRail: coverRail)
                Spacer()
                if coverRail && needsSyncAttention {
                    iconButton(cloud.message ?? "待同步", cloud.message == nil ? "icloud.and.arrow.up" : "exclamationmark.icloud") { accountPanel = true }
                }
                if !nativeToolbar || (compact && !usesRail) {
                    directoryButton(expanded: true) {
                        if compact { drawer = false } else { pinned = false }
                    }
                }
            }.padding(.leading, gutter).padding(.trailing, compact ? 8 : 24).frame(height: coverRail ? 62 : 50)
                .padding(.top, compact && !nativeToolbar ? 0 : (coverRail ? 20 : 24))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    let tree = outline
                    let expanded = expandedBranches
                    let selected = current?.id
                    ForEach(tree.visibleRows(expanded: expanded)) { row in
                        let note = row.note
                        let hasChildren = tree.children[note.id] != nil
                        let willCollapse = selected == note.id && expanded.contains(note.id)
                        Button {
                            if hasChildren {
                                guard finishEditing() else { return }
                                var next = expanded
                                if willCollapse { next.remove(note.id) } else { next.insert(note.id) }
                                setBranches(next)
                                lastID = note.id.uuidString
                            } else {
                                open(note)
                            }
                        } label: {
                            Label(note.title, systemImage: "doc.text")
                                .lineLimit(1)
                                .padding(.leading, 12)
                                .padding(.trailing, 8)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("noteRow")
                        .accessibilityAddTraits(selected == note.id ? .isSelected : [])
                        .accessibilityValue(row.depth == 0 ? "根文稿" : "第\(row.depth + 1)层")
                        .accessibilityHint(hasChildren ? (willCollapse ? "收起子文稿" : "打开文稿并展开子文稿") : "")
                        .contextMenu {
                            Button("新建子文稿", systemImage: "plus") { create(under: note) }
                            if usesRail && editing == nil { documentActions(note) }
                        }
                        .background(selected == note.id ? Color.primary.opacity(0.075) : .clear,
                                    in: RoundedRectangle(cornerRadius: 8))
                    }
                }.scrollTargetLayout().padding(.horizontal, gutter - 12)
            }.scrollPosition(id: $sidebarScrollRow, anchor: .top)
            .accessibilityIdentifier("sidebarResults").scrollDismissesKeyboard(.interactively)
            if !coverRail {
                HStack { Spacer(); accountAndSearch(vertical: false) }
                    .padding(.horizontal, compact ? 16 : 24)
                    .padding(.top, compact ? 8 : 16)
                    .padding(.bottom, bottomActionInset)
            }
        }
        .frame(maxHeight: .infinity)
        .background((coverRail ? Color(white: scheme == .dark ? 0.10 : 252 / 255) : Color(uiColor: .secondarySystemBackground)).ignoresSafeArea())
    }

    private var editLocks: Set<String> {
        (try? JSONDecoder().decode(Set<String>.self, from: editLockData)) ?? []
    }

    private func lockKey(_ note: Manuscript) -> String {
        if note.remoteID != nil, let identity = cloud.session {
            return "\(identity.site.absoluteString)/\(identity.userID)/\(identity.spaceID ?? "")/\(note.id)"
        }
        return "local/\(note.id)"
    }

    private func isLocked(_ note: Manuscript) -> Bool { editLocks.contains(lockKey(note)) }

    private func toggleEditLock(_ note: Manuscript) {
        var locks = editLocks
        let key = lockKey(note)
        if locks.contains(key) { locks.remove(key) } else { locks.insert(key) }
        do { editLockData = try JSONEncoder().encode(locks) }
        catch { library.problem = error.localizedDescription }
    }

    private func move(_ note: Manuscript, to parentID: UUID?) {
        moving = nil
        do {
            if note.remoteID == nil { try library.move(note, to: parentID) }
            else { try cloud.move(note, to: parentID) }
            if let current { revealAncestors(of: current.id) }
        } catch { library.problem = error.localizedDescription }
    }

    @ViewBuilder private func documentActions(_ note: Manuscript) -> some View {
        Button(isLocked(note) ? "解除编辑锁定" : "锁定编辑", systemImage: isLocked(note) ? "lock.open" : "lock") {
            toggleEditLock(note)
        }
        Button("文内查找", systemImage: "magnifyingglass") { finding = note }
        Button("移动文稿", systemImage: "folder") { moving = note }
        Button("删除文稿", systemImage: "trash", role: .destructive) { deleting = note }
    }

    private func detail(wide: Bool, nativeToolbar: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !nativeToolbar {
                HStack(spacing: 2) {
                    if wide && !pinned {
                        directoryButton(expanded: false) { pinned = true }
                    } else if !wide && editing == nil {
                        directoryButton(expanded: false) { drawer = true }
                    }
                    Spacer()
                    if editing != nil {
                        finishButton
                    } else {
                        if needsSyncAttention {
                            iconButton(cloud.message ?? "待同步", cloud.message == nil ? "icloud.and.arrow.up" : "exclamationmark.icloud") { accountPanel = true }
                        }
                        if let note = current {
                            iconButton("编辑文稿", "pencil") { editing = EditSession(draft: note, original: note, caret: .end) }
                                .disabled(isLocked(note))
                            Menu {
                                documentActions(note)
                            } label: {
                                Image(systemName: "ellipsis").frame(width: 44, height: 44).contentShape(Rectangle())
                            }.accessibilityLabel("更多操作")
                        }
                    }
                }.padding(.horizontal, wide ? 24 : 8).frame(height: 50)
                    .padding(.top, wide ? 24 : 0)
            }
            if let note = editing?.original ?? current {
                ManuscriptEditor(draft: Binding(get: { editing?.draft ?? note },
                                                set: { editing?.draft = $0 }),
                                 editing: editing != nil, readOnly: isLocked(note), caret: editing?.caret,
                                 children: outline.children[note.id] ?? [], openChild: open,
                                 beginEditing: { caret, format in
                                     guard editing == nil, !isLocked(note) else { return }
                                     editing = EditSession(draft: note, original: note, caret: caret, format: format)
                                 }, initialFormat: editing?.format, toggleTask: { key, offset in
                                     guard !isLocked(note) else { return }
                                     if let editing {
                                         _ = editing.draft.toggleTask(in: key, at: offset)
                                         return
                                     }
                                     var updated = note
                                     if updated.toggleTask(in: key, at: offset) {
                                         do { _ = try save(updated, original: note) }
                                         catch { library.problem = error.localizedDescription }
                                     }
                                 }, editingChanged: { field in
                    if editing == nil { editing = EditSession(draft: note, original: note) }
                    editing?.input = field
                    editing?.canUndo = field.undoManager?.canUndo == true
                }, richUndo: { enabled, window, undo in
                    editing?.richWindow = window
                    editing?.richUndo = undo
                    editing?.canUndo = enabled
                }, richLayout: note.usesBlockEditor
                    ? note.parts.contains { $0.editable && ManuscriptPreview.needed(for: $0.text) }
                    : ManuscriptPreview.needed(for: note.body))
                .id(note.id)
            } else if syncConnected && !cloud.replica.initialized {
                VStack(spacing: 12) {
                    if cloud.busy { ProgressView("正在读取文稿") }
                    else { Button(cloud.message ?? "读取文稿") { accountPanel = true } }
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Button { create() } label: {
                    Image(systemName: "doc.text")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("新建文稿")
                .accessibilityIdentifier("emptyManuscript")
            }
        }.frame(maxHeight: .infinity, alignment: .top)
        .background((scheme == .dark ? Color(white: 0.10) : Color(uiColor: .systemBackground)).ignoresSafeArea())
    }
}

// Observe the scene transition outside the adaptive layout. The old text view
// may already be detached by the time UIKit reports that its keyboard hid.
private struct WorkspaceRotationObserver: UIViewControllerRepresentable {
    var onRotation: () -> Void

    func makeUIViewController(context: Context) -> Controller { Controller() }

    func updateUIViewController(_ controller: Controller, context: Context) {
        controller.onRotation = onRotation
    }

    final class Controller: UIViewController {
        var onRotation: (() -> Void)?

        override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
            super.viewWillTransition(to: size, with: coordinator)
            if !coordinator.targetTransform.isIdentity { onRotation?() }
        }
    }
}

/// Release offscreen controls once the slide finishes. Workspace owns the scroll position.
private struct SlidingSidebar: ViewModifier, Animatable {
    var offset: CGFloat
    let width: CGFloat

    var animatableData: CGFloat {
        get { offset }
        set { offset = newValue }
    }

    func body(content: Content) -> some View {
        if abs(offset) < width { content.offset(x: offset) }
    }
}

private struct CircularGlass: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular.interactive(), in: Circle())
        } else {
            content.background(.regularMaterial, in: Circle())
        }
    }
}
