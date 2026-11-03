import { SkeletonRows } from "../components/Skeleton";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  LoaderCircle,
  X,
  ArrowUpRight,
  Check,
  Ellipsis,
  LogOut,
  Plus,
  UserRound,
} from "lucide-react";
import { useChatGPT } from "../chatgpt-context";
import { Button } from "../components/primitives";
import "./chatgpt-settings.css";

export function ChatGPTSettings() {
  const {
    available,
    status,
    busy,
    signingIn,
    signingInProfileId,
    error,
    errorMethod,
    dismissError,
    retry,
    action,
  } = useChatGPT();
  const profiles = (status?.profiles ?? []).filter(
    (p) => p.connected || p.name || p.email,
  );
  const pendingProfile = status?.profiles.find(
    (p) => !p.connected && !p.name && !p.email,
  );
  const active = profiles.find(
    (profile) => profile.id === status?.activeProfileId,
  );
  const pendingRow = (name?: string, key = "pending-connection") => (
    <div
      className="setting-row chatgpt-account-row chatgpt-pending-row"
      key={key}
    >
      <div className="chatgpt-account-person">
        <span className="profile-avatar" aria-hidden="true">
          <LoaderCircle size={20} className="chatgpt-spinner" />
        </span>
        <div className="chatgpt-account-identity" role="status">
          <strong>
            {name ? `Connecting ${name}` : "Connecting to ChatGPT"}
          </strong>
          <p>Complete sign-in in your browser.</p>
        </div>
      </div>
      <Button variant="ghost" onClick={() => void action("cancelSignIn")}>
        Cancel
      </Button>
    </div>
  );
  return (
    <section
      className="setting-group chatgpt-accounts"
      aria-label="ChatGPT accounts"
    >
      <div className="chatgpt-accounts-heading">
        <h2>Accounts</h2>
        {available && profiles.length > 0 && (
          <Button
            variant="ghost"
            disabled={busy || signingIn}
            onClick={() => void action("signIn", { newProfile: true })}
          >
            <Plus size={14} /> Add account
          </Button>
        )}
      </div>
      <div className="setting-card" aria-busy={available && !status && !error}>
        {!available ? (
          <div className="setting-row">
            <p>Sign in from the desktop app.</p>
          </div>
        ) : !status ? (
          error ? (
            <div className="setting-row">
              <p>Couldn’t load accounts.</p>
            </div>
          ) : (
            <SkeletonRows
              label="Loading accounts"
              rows={1}
              avatar
              className="skeleton-settings"
            />
          )
        ) : !profiles.length && signingIn ? (
          pendingRow()
        ) : !profiles.length ? (
          <div className="setting-row chatgpt-account-row">
            <div className="chatgpt-account-person">
              <span className="profile-avatar" aria-hidden="true">
                <UserRound size={21} strokeWidth={1.6} />
              </span>
              <div className="chatgpt-account-identity">
                <strong>Connect ChatGPT</strong>
                <p>Use your ChatGPT plan for AI in Nomi.</p>
              </div>
            </div>
            <Button
              variant="primary"
              disabled={busy || signingIn}
              onClick={() =>
                void action(
                  "signIn",
                  pendingProfile ? { profileId: pendingProfile.id } : undefined,
                )
              }
            >
              Sign in with ChatGPT
            </Button>
          </div>
        ) : (
          profiles.map((profile) => {
            const name = profile.name || profile.label.replace(/ · \d+$/, "");
            if (signingIn && signingInProfileId === profile.id)
              return pendingRow(name, profile.id);
            const isActive = profile.id === status?.activeProfileId;
            return (
              <div
                className="setting-row chatgpt-account-row"
                key={profile.id}
                data-account-id={profile.id}
              >
                <div className="chatgpt-account-person">
                  <span className="profile-avatar" aria-hidden="true">
                    {(profile.name || profile.email || profile.label)
                      .trim()
                      .slice(0, 1)
                      .toLocaleUpperCase()}
                  </span>
                  <div className="chatgpt-account-identity">
                    <strong>{name}</strong>
                    {profile.email && profile.email !== name && (
                      <p>{profile.email}</p>
                    )}
                  </div>
                </div>
                <div className="chatgpt-account-actions">
                  {!profile.connected || !profile.sharing ? (
                    <Button
                      disabled={busy || signingIn}
                      aria-label={`${profile.connected ? "Reconnect" : "Sign in to"} ${name}`}
                      onClick={() =>
                        void action("signIn", { profileId: profile.id })
                      }
                    >
                      {profile.connected ? "Reconnect" : "Sign in"}
                    </Button>
                  ) : isActive ? (
                    <span className="chatgpt-account-active">
                      <Check size={13} aria-hidden="true" /> Active
                    </span>
                  ) : (
                    <Button
                      disabled={busy || signingIn}
                      aria-label={`Use ${name} for Chat`}
                      onClick={() =>
                        void action("selectProfile", { profileId: profile.id })
                      }
                    >
                      Use account
                    </Button>
                  )}
                  {profile.connected && (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button
                          variant="ghost"
                          className="chatgpt-account-more"
                          disabled={busy || signingIn}
                          aria-label={`More options for ${name}`}
                        >
                          <Ellipsis size={17} />
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className="dropdown-menu"
                          align="end"
                          sideOffset={5}
                          collisionPadding={10}
                        >
                          <DropdownMenu.Item
                            className="dropdown-item"
                            onSelect={() =>
                              void action("signOut", { profileId: profile.id })
                            }
                          >
                            <LogOut size={15} /> Sign out
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  )}
                </div>
              </div>
            );
          })
        )}
        {signingIn &&
          profiles.length > 0 &&
          !profiles.some((p) => p.id === signingInProfileId) &&
          pendingRow()}
      </div>
      {error && !signingIn && (
        <div className="chatgpt-connection-feedback" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <div className="chatgpt-connection-message">
            <strong>
              {errorMethod === "signIn"
                ? "Couldn’t connect to ChatGPT"
                : errorMethod === "models"
                  ? "Couldn’t load models"
                  : "Connection needs attention"}
            </strong>
            <p>
              {errorMethod === "signIn" &&
              error ===
                "ChatGPT connection failed. Try again or reconnect your account."
                ? "The connection wasn’t completed. Please try again."
                : error}
            </p>
          </div>
          {errorMethod && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void retry()}
            >
              Try again
            </Button>
          )}
          <Button
            variant="ghost"
            className="chatgpt-feedback-dismiss"
            aria-label="Dismiss message"
            onClick={dismissError}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {active?.connected && (
        <Button
          variant="ghost"
          className="chatgpt-usage-link"
          disabled={busy}
          onClick={() => void action("openUsage")}
        >
          ChatGPT usage <ArrowUpRight size={13} />
        </Button>
      )}
    </section>
  );
}
