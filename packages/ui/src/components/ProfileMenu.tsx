import { SyncActions } from "../pages/SyncActions";
import { Button, Modal } from "./primitives";
import { Tooltip } from "./Tooltip";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUpRight, GitFork, Settings, LogOut } from "lucide-react";
import { NOMI_REPOSITORY_URL } from "@nomi/core";
import { useWorkspace } from "../workspace-context";
import type { CloudSyncStatus } from "../../../core/src/sync/settings";
import { workspaceShortcut, shortcutModifier } from "./workspace-shortcuts";

export function ProfileMenu({ mobile = false }: { mobile?: boolean }) {
  const { navigate } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [syncAction, setSyncAction] = useState<"connect" | "conflict">();
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorAction, setErrorAction] = useState<"signIn" | "logout">("signIn");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    if (signingIn || status?.signingIn) return;
    setSigningIn(true);
    setErrorAction("signIn");
    setError("");
    try {
      const next = (await window.nomiDesktop?.requestSync?.("signIn")) as
        CloudSyncStatus | undefined;
      if (next) {
        setStatus(next);
        if (!next.binding || !next.enabled) setSyncAction("connect");
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Couldn’t sign in. Try again.";
      if (!/abort/i.test(message)) setError(message);
    } finally {
      setSigningIn(false);
      window.dispatchEvent(new Event("nomi-account-changed"));
    }
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    setErrorAction("logout");
    try {
      setStatus(
        (await window.nomiDesktop?.requestSync?.("logout")) as CloudSyncStatus,
      );
      setSyncAction(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t log out.");
    } finally {
      setLoggingOut(false);
      window.dispatchEvent(new Event("nomi-account-changed"));
    }
  }
  const [status, setStatus] = useState<CloudSyncStatus>();
  const pending = signingIn || status?.signingIn;
  useEffect(() => {
    let active = true,
      generation = 0;
    const refresh = () => {
      const current = ++generation;
      window.nomiDesktop?.requestSync?.("status").then(
        (value) => {
          if (active && generation === current)
            setStatus(value as CloudSyncStatus);
        },
        () => {},
      );
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    window.addEventListener("nomi-account-changed", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("nomi-account-changed", refresh);
    };
  }, []);
  const connected = !!status?.account && status.phase !== "auth";
  const name = pending
    ? "Signing in…"
    : connected
      ? status.account!.email
      : "Sign in to Nomi";
  const initials = connected ? name.trim().slice(0, 1).toLocaleUpperCase() : "";
  const avatar = (
    <span
      className={`profile-avatar${initials ? "" : " profile-avatar-placeholder"}`}
      aria-hidden="true"
    >
      {initials || (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0v.5h-15Z" />
        </svg>
      )}
    </span>
  );
  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <Tooltip label={name} side="right" disabled={mobile || open}>
          <DropdownMenu.Trigger asChild>
            <button
              className={`profile-trigger ${mobile ? "mobile-profile" : "rail-profile"}`}
              aria-label="Account menu"
              title={mobile ? name : undefined}
            >
              {avatar}
            </button>
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="dropdown-menu workspace-menu"
            side={mobile ? "bottom" : "right"}
            align="end"
            sideOffset={6}
            collisionPadding={10}
            aria-label="Account"
            onKeyDown={(event) => {
              if (workspaceShortcut(event.nativeEvent, !!window.nomiDesktop))
                setOpen(false);
            }}
          >
            {connected ? (
              <div className="workspace-menu-identity">
                {avatar}
                <span className="workspace-menu-name">
                  <strong>{name}</strong>
                </span>
              </div>
            ) : (
              <DropdownMenu.Item
                className="workspace-menu-identity dropdown-item"
                disabled={!!pending || loggingOut}
                onSelect={() => void signIn()}
              >
                {avatar}
                <span className="workspace-menu-name">
                  <strong>{name}</strong>
                </span>
              </DropdownMenu.Item>
            )}
            {connected && (!status.binding || !status.enabled) && (
              <DropdownMenu.Item
                className="dropdown-item"
                disabled={!!pending || loggingOut}
                onSelect={() => setSyncAction("connect")}
              >
                Continue sign-in
              </DropdownMenu.Item>
            )}
            {connected && status.conflicts > 0 && (
              <DropdownMenu.Item
                className="dropdown-item"
                onSelect={() => setSyncAction("conflict")}
              >
                Review changes
              </DropdownMenu.Item>
            )}
            {pending && (
              <DropdownMenu.Item
                className="dropdown-item"
                onSelect={() => {
                  void window.nomiDesktop?.requestSync?.("cancelSignIn");
                }}
              >
                Cancel sign-in
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Separator className="workspace-menu-separator" />

            <DropdownMenu.Item
              className="dropdown-item"
              onSelect={() => navigate("settings")}
            >
              <Settings size={17} strokeWidth={1.7} />
              Settings
              <kbd className="account-shortcut">{shortcutModifier()} ,</kbd>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" asChild>
              <a
                href={NOMI_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitFork size={17} strokeWidth={1.7} />
                GitHub
                <ArrowUpRight
                  size={14}
                  className="account-shortcut"
                  aria-hidden="true"
                />
              </a>
            </DropdownMenu.Item>
            {status?.account && (
              <>
                <DropdownMenu.Separator className="workspace-menu-separator" />
                <DropdownMenu.Item
                  className="dropdown-item"
                  disabled={loggingOut || !!pending}
                  onSelect={() => void logout()}
                >
                  <LogOut size={17} strokeWidth={1.7} />
                  {loggingOut ? "Logging out…" : "Log out"}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {syncAction && (
        <SyncActions
          mode={syncAction}
          onClose={() => setSyncAction(undefined)}
        />
      )}
      <Modal
        open={!!error}
        onOpenChange={(value) => {
          if (!value) setError("");
        }}
        title={
          errorAction === "logout" ? "Couldn’t log out" : "Couldn’t sign in"
        }
      >
        <p role="alert">{error}</p>
        <Button
          variant="primary"
          onClick={() => void (errorAction === "logout" ? logout() : signIn())}
        >
          Try again
        </Button>
      </Modal>
    </>
  );
}
