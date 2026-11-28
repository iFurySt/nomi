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
  ArrowLeft,
  ArrowRight,
  PanelLeft,
  Settings,
} from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { workspacePages, type WorkspacePage } from "@nomi/core";
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
function WorkspaceSearch({
  onChoose,
}: {
  onChoose: (page: WorkspacePage) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const matches = workspacePages.filter((page) =>
    pageLabels[page].toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = matches[index];
  function handleKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (
      !selected ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (event.key === "Enter") {
      event.preventDefault();
      onChoose(selected);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
        matches.length;
      setIndex(next);
      document
        .getElementById("workspace-result-" + matches[next])
        ?.scrollIntoView({ block: "nearest" });
    }
  }
  return (
    <>
      <input
        className="workspace-search-input"
        role="combobox"
        aria-expanded={true}
        aria-controls="workspace-search-results"
        aria-autocomplete="list"
        aria-activedescendant={
          selected ? "workspace-result-" + selected : undefined
        }
        aria-label="Search workspace content"
        placeholder="Search Nomi"
        value={query}
        onKeyDown={handleKey}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
      />
      <div className="search-results">
        {matches.length > 0 && (
          <div className="search-group-label" aria-hidden="true">
            Pages
          </div>
        )}
        <div id="workspace-search-results" role="listbox" aria-label="Pages">
          {matches.map((page, i) => {
            const Icon =
              destinations.find((item) => item.page === page)?.icon ?? Settings;
            return (
              <button
                type="button"
                role="option"
                id={"workspace-result-" + page}
                key={page}
                aria-selected={page === selected}
                tabIndex={-1}
                title={pageLabels[page]}
                onPointerMove={() => setIndex(i)}
                onClick={() => onChoose(page)}
              >
                <Icon size={16} strokeWidth={1.7} />
                <span>{pageLabels[page]}</span>
              </button>
            );
          })}
        </div>
        {matches.length === 0 && (
          <p role="status" className="search-empty">
            No matches.
          </p>
        )}
      </div>
    </>
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  const toolbarActions = (
    <div className="topbar-actions">
      <button
        className="search-trigger"
        onClick={() => {
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
          overlayClassName="workspace-search-overlay"
          hideHeader
          initialFocus="input"
        >
          <WorkspaceSearch
            onChoose={(target) => {
              navigate(target);
              setSearchOpen(false);
            }}
          />
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
