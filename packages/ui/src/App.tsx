import {
  initialWorkspaceRoute,
  lastRouteKey,
  validWorkspaceRoute,
} from "./components/workspace-route";
import { UpdateProvider } from "./update-context";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createDemoWorkspace,
  decodeWorkspace,
  workspacePages,
  parseSettingsSection,
} from "@nomi/core";
import type { Workspace, WorkspacePage } from "@nomi/core";
import { getRuntimeInfo, readWorkspace, writeWorkspace } from "@nomi/platform";
import type { StoragePort } from "@nomi/platform";
import { WorkspaceContext } from "./workspace-context";
import { ChatGPTProvider } from "./chatgpt-context";
import { CanvasDocumentSession } from "./canvas/CanvasDocumentSession";
import { Shell } from "./components/Shell";
import { WorkspaceLoading } from "./writing/NotesLoading";
import { useResolvedTheme } from "./use-resolved-theme";
import { Settings } from "./pages/Settings";
const NotesWorkspace = lazy(() =>
  import("./pages/NotesWorkspace").then((m) => ({ default: m.NotesWorkspace })),
);
const storage: StoragePort = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
function currentPage(): WorkspacePage {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(lastRouteKey);
  } catch {
    /* Optional view preference. */
  }
  const route = initialWorkspaceRoute(location.hash, saved);
  if (location.hash !== route) history.replaceState(history.state, "", route);
  const candidate = location.hash
    .replace(/^#\/?/, "")
    .split("?")[0]
    ?.split("/")[0];
  return workspacePages.includes(candidate as WorkspacePage)
    ? (candidate as WorkspacePage)
    : "notes";
}
export function App() {
  const [loaded] = useState(() =>
    readWorkspace(storage, createDemoWorkspace, decodeWorkspace),
  );
  const [workspace, setWorkspace] = useState(loaded.value);
  const resolvedTheme = useResolvedTheme(workspace.theme);
  const [storageError, setStorageError] = useState(loaded.error);
  const dirty = useRef(false);
  const [page, setPage] = useState(currentPage);
  const [settingsSection, setSettingsSection] = useState(() =>
    parseSettingsSection(location.hash),
  );
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const navigate = useCallback((target: WorkspacePage) => {
    location.hash = `/${target}`;
  }, []);
  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  }, []);
  const update = useCallback((change: (current: Workspace) => Workspace) => {
    dirty.current = true;
    setWorkspace(change);
  }, []);
  useEffect(() => {
    const change = () => {
      const nextPage = currentPage();
      const route = validWorkspaceRoute(location.hash);
      try {
        if (route) localStorage.setItem(lastRouteKey, route);
      } catch {
        /* Optional view preference. */
      }
      setPage(nextPage);
      setSettingsSection(parseSettingsSection(location.hash));
    };
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    if (dirty.current && !loaded.error)
      setStorageError(writeWorkspace(storage, workspace));
  }, [workspace, loaded.error]);
  useEffect(() => {
    void getRuntimeInfo()
      .then((info) => {
        document.documentElement.dataset.runtime = info.kind;
        document.documentElement.dataset.platform = info.platform;
      })
      .catch(() => notify("Window controls may be limited."));
    return () => clearTimeout(toastTimer.current);
  }, [notify]);
  return (
    <UpdateProvider>
      <ChatGPTProvider>
        <CanvasDocumentSession>
          <WorkspaceContext.Provider
            value={{
              workspace,
              resolvedTheme,
              update,
              page,
              navigate,
              settingsSection,
              notify,
              storageError,
            }}
          >
            <a
              className="skip-link"
              href="#main-content"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById("main-content")?.focus();
              }}
            >
              Skip to content
            </a>
            <Shell>
              {(page === "canvas" || page === "notes") && (
                <Suspense fallback={<WorkspaceLoading page={page} />}>
                  <NotesWorkspace page={page} />
                </Suspense>
              )}
              {page === "settings" && <Settings />}
            </Shell>
            <div
              className={`toast ${toast ? "visible" : ""}`}
              role="status"
              aria-live="polite"
            >
              {toast}
            </div>
          </WorkspaceContext.Provider>
        </CanvasDocumentSession>
      </ChatGPTProvider>
    </UpdateProvider>
  );
}
