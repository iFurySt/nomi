import { WorkspaceTitleTarget } from "./WorkspaceTitle";
import { Tooltip } from "./Tooltip";
import { UpdateIndicator } from "./UpdateIndicator";
import {
  PanelsTopLeft,
  FileText,
  Search,
  Menu,
  Sun,
  Moon,
  FolderOpen,
  ArrowLeft,
  ArrowRight,
  PanelLeft,
  Settings,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { workspacePages } from "@nomi/core";
import { useWorkspace, pageLabels } from "../workspace-context";
import { IconButton, Logo, Modal } from "./primitives";
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useWorkspaceHistory } from "./useWorkspaceHistory";
import { ProfileMenu } from "./ProfileMenu";
import { SettingsSidebar } from "./SettingsSidebar";
import {
  workspaceShortcut,
  workspaceShortcuts,
  shortcutModifier,
} from "./workspace-shortcuts";
const destinations = [
  { page: "notes", icon: FileText },
  { page: "canvas", icon: PanelsTopLeft },
] as const;
function AppNavigation({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { page } = useWorkspace();
  return (
    <nav
      className={mobile ? "mobile-app-navigation" : "rail-destinations"}
      aria-label="Main navigation"
    >
      {destinations.map(({ page: target, icon: Icon }) => (
        <Tooltip
          key={target}
          label={pageLabels[target]}
          side="right"
          disabled={mobile}
        >
          <a
            href={`#/${target}`}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            className={`rail-button ${page === target ? "selected" : ""}`}
            aria-label={pageLabels[target]}
            aria-current={page === target ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon size={21} strokeWidth={1.7} />
            {mobile && <span>{pageLabels[target]}</span>}
          </a>
        </Tooltip>
      ))}
    </nav>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const {
    resolvedTheme,
    update,
    page,
    navigate,
    storageError,
    settingsSection,
  } = useWorkspace();
  const desktop = !!window.nomiDesktop;
  const [titleTarget, setTitleTarget] = useState<HTMLDivElement | null>(null);
  const drawerQuery = "(max-width: 899px)";
  const PageIcon =
    destinations.find((destination) => destination.page === page)?.icon ??
    Settings;
  useLayoutEffect(() => {
    document
      .getElementById("main-content")
      ?.scrollTo({ top: 0, behavior: "instant" });
  }, [page, settingsSection]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("nomi.sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("nomi.sidebar-collapsed", String(sidebarCollapsed));
    } catch {
      /* Session-only when storage is unavailable. */
    }
  }, [sidebarCollapsed]);
  const routeHistory = useWorkspaceHistory();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia(drawerQuery);
    const closeWideDrawer = () => {
      if (!query.matches) setMobileOpen(false);
    };
    closeWideDrawer();
    query.addEventListener("change", closeWideDrawer);
    return () => query.removeEventListener("change", closeWideDrawer);
  }, [drawerQuery]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchResults = useRef<HTMLDivElement>(null);
  const modifier = shortcutModifier();
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const action = workspaceShortcut(event, desktop);
      if (!action || (action === "sidebar" && page === "settings")) return;
      const editing =
        event.target instanceof HTMLElement &&
        !!event.target.closest(
          "input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]",
        );
      // Preserve editor formatting and avoid changing a form behind a dialog.
      if (
        (action === "sidebar" && editing) ||
        (action === "sidebar" &&
          !mobileOpen &&
          document.querySelector('[role="dialog"],[role="alertdialog"]'))
      )
        return;
      event.preventDefault();
      if (event.repeat) return;
      setSearchOpen(action === "search" ? !searchOpen : false);
      setShortcutsOpen(action === "help" ? !shortcutsOpen : false);
      setMobileOpen(false);
      switch (action) {
        case "search":
          if (!searchOpen) setSearch("");
          break;
        case "settings":
          navigate("settings");
          break;
        case "back":
          routeHistory.back();
          break;
        case "forward":
          routeHistory.forward();
          break;
        case "sidebar":
          if (matchMedia(drawerQuery).matches) setMobileOpen(!mobileOpen);
          else setSidebarCollapsed((value) => !value);
          break;
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    desktop,
    page,
    drawerQuery,
    navigate,
    routeHistory,
    searchOpen,
    shortcutsOpen,
    mobileOpen,
  ]);
  function searchKeys(event: ReactKeyboardEvent) {
    if (
      event.altKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    const buttons = [
      ...(searchResults.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    if (!buttons.length) return;
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Enter" && current < 0) {
      event.preventDefault();
      buttons[0].click();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        current < 0
          ? event.key === "ArrowDown"
            ? 0
            : buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
      buttons[next].focus();
      buttons[next].scrollIntoView({ block: "nearest" });
    }
  }
  const matches = workspacePages.filter((p) =>
    pageLabels[p].toLowerCase().includes(search.toLowerCase()),
  );
  const toolbarActions = (
    <div className="topbar-actions">
      <button
        className="search-trigger"
        onClick={() => {
          setSearch("");
          setSearchOpen(true);
        }}
        aria-label="Search workspace"
        aria-keyshortcuts="Meta+k Control+k"
      >
        <Search size={17} />
        <span>Search</span>
        <kbd>{modifier} K</kbd>
      </button>
      <IconButton
        label={
          resolvedTheme === "light"
            ? "Switch to dark theme"
            : "Switch to light theme"
        }
        onClick={() =>
          update((w) => ({
            ...w,
            theme: resolvedTheme === "light" ? "dark" : "light",
          }))
        }
      >
        {resolvedTheme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </IconButton>
      <ProfileMenu mobile />
    </div>
  );
  const navigationToggle =
    page === "settings" ? null : (
      <>
        <span className="sidebar-toggle">
          <IconButton
            label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (${modifier}B)`}
            aria-keyshortcuts="Meta+b Control+b"
            aria-expanded={!sidebarCollapsed}
            aria-controls={
              page === "notes" ? "notes-library" : "workspace-sidebar"
            }
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <PanelLeft size={18} />
          </IconButton>
        </span>
        <span className="mobile-menu">
          <IconButton
            label="Open navigation"
            title={`Open navigation (${modifier}B)`}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </IconButton>
        </span>
      </>
    );
  return (
    <WorkspaceTitleTarget.Provider value={titleTarget}>
      <div
        className={`app-shell ${sidebarCollapsed && page !== "settings" ? "sidebar-collapsed" : ""} ${desktop ? "desktop-shell" : "web-shell"} ${page === "notes" ? "notes-shell" : page === "canvas" ? "canvas-shell" : "settings-shell"}`}
      >
        {desktop && (
          <header className="window-toolbar">
            <div className="window-navigation">
              <span className="native-window-space" aria-hidden="true" />
              <IconButton
                label="Go back"
                title={`Go back (${modifier}[)`}
                aria-keyshortcuts="Meta+[ Control+["
                disabled={!routeHistory.canGoBack}
                onClick={routeHistory.back}
              >
                <ArrowLeft size={18} />
              </IconButton>
              <IconButton
                label="Go forward"
                title={`Go forward (${modifier}])`}
                aria-keyshortcuts="Meta+] Control+]"
                disabled={!routeHistory.canGoForward}
                onClick={routeHistory.forward}
              >
                <ArrowRight size={18} />
              </IconButton>
              {navigationToggle}
            </div>
            <span className="window-toolbar-divider" aria-hidden="true" />
            <div className="workspace-title-slot" ref={setTitleTarget} />
            <div className="window-title workspace-title-fallback">
              {page !== "notes" && <PageIcon size={18} strokeWidth={1.7} />}
              <span>Nomi</span>
              <span className="breadcrumb-divider">/</span>
              <span>{pageLabels[page]}</span>
            </div>
            {toolbarActions}
          </header>
        )}
        <div className="workspace-body">
          <div className="tool-rail" aria-label="Workspace tools">
            <div className="rail-brand">
              <Logo small />
            </div>
            <AppNavigation />
            <span className="rail-separator" />
            <Tooltip label="Search" side="right">
              <button
                className="rail-button rail-search"
                aria-label="Search the workspace"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(true);
                }}
              >
                <Search size={20} />
              </button>
            </Tooltip>
            <div className="rail-footer">
              <UpdateIndicator />
              <ProfileMenu />
            </div>
          </div>
          <div className="workspace-panel">
            <aside className="sidebar" id="workspace-sidebar">
              {page === "settings" && <SettingsSidebar />}
            </aside>
            <div className="main-shell">
              {!desktop && (
                <header className="topbar">
                  <div className="topbar-left">
                    {navigationToggle}
                    <span
                      className="window-toolbar-divider"
                      aria-hidden="true"
                    />
                    <div
                      className="workspace-title-slot"
                      ref={setTitleTarget}
                    />
                    <div className="window-title workspace-title-fallback">
                      {page !== "notes" && (
                        <PageIcon size={18} strokeWidth={1.7} />
                      )}
                      <span className="page-label">{pageLabels[page]}</span>
                    </div>
                  </div>
                  {toolbarActions}
                </header>
              )}
              {storageError && (
                <div className="storage-warning" role="alert">
                  {storageError}
                  <button onClick={() => navigate("settings")}>
                    Open Settings
                  </button>
                </div>
              )}
              <main
                tabIndex={-1}
                id="main-content"
                className={`main-content ${page === "settings" ? "settings-main" : ""}`}
              >
                {children}
              </main>
            </div>
          </div>
        </div>
        <Modal
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          title="Navigation"
          sheet
        >
          <AppNavigation mobile onNavigate={() => setMobileOpen(false)} />
          {page === "settings" && (
            <SettingsSidebar onSelect={() => setMobileOpen(false)} />
          )}
        </Modal>
        <Modal
          open={searchOpen}
          onOpenChange={setSearchOpen}
          title="Search"
          className="workspace-search-dialog"
        >
          <label className="search-field" onKeyDown={searchKeys}>
            <Search size={18} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Canvas, 文稿, Settings…"
              aria-label="Search workspace content"
            />
          </label>
          <div
            className="search-results"
            ref={searchResults}
            onKeyDown={searchKeys}
          >
            {matches.map((target) => (
              <button
                key={target}
                onClick={() => {
                  navigate(target);
                  setSearchOpen(false);
                }}
              >
                <FolderOpen size={17} />
                <span>{pageLabels[target]}</span>
                <small>Page</small>
              </button>
            ))}
            {matches.length === 0 && <p className="muted">No matches.</p>}
          </div>
          <footer className="search-footer">
            <button
              onClick={() => {
                setSearchOpen(false);
                setShortcutsOpen(true);
              }}
            >
              Shortcuts <kbd>{modifier} /</kbd>
            </button>
          </footer>
        </Modal>
        <Modal
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          title="Keyboard shortcuts"
        >
          <dl className="shortcut-list">
            {workspaceShortcuts
              .filter(
                (s) =>
                  (!("desktopOnly" in s) || desktop) &&
                  (page !== "settings" || s.action !== "sidebar"),
              )
              .map((s) => (
                <div key={s.action}>
                  <dt>{s.label}</dt>
                  <dd>
                    <kbd>
                      {modifier} {s.display}
                    </kbd>
                  </dd>
                </div>
              ))}
            <div>
              <dt>Close dialog or menu</dt>
              <dd>
                <kbd>Esc</kbd>
              </dd>
            </div>
          </dl>
        </Modal>
      </div>
    </WorkspaceTitleTarget.Provider>
  );
}
