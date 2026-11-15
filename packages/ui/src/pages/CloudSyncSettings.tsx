import { useEffect, useState } from "react";
import type { CloudSyncStatus } from "../../../core/src/sync/settings";
import { Button } from "../components/primitives";
import "./cloud-sync.css";

export function CloudSyncSettings() {
  const request = window.nomiDesktop?.requestSync;
  const [saved, setSaved] = useState<string>();
  const [server, setServer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      failures = 0;
    let retry: ReturnType<typeof setTimeout>;
    async function load() {
      if (!request) return;
      try {
        const status = (await request("status")) as CloudSyncStatus;
        if (!active) return;
        if (status.error && !status.server) throw Error(status.error);
        const url =
          status.server ?? status.account?.server ?? "https://nomi.ifuryst.com";
        setSaved(url);
        setServer(url);
        setError("");
      } catch {
        if (!active) return;
        if (++failures >= 3)
          setError("Couldn’t load server settings. Retrying…");
        retry = setTimeout(load, failures < 3 ? 500 : 3000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [request]);
  if (!request) return <p>Configure Cloud Sync in the desktop app.</p>;
  return (
    <section className="setting-group cloud-sync-settings">
      <form
        className="setting-card"
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || saved === undefined) return;
          setBusy(true);
          setError("");
          try {
            const status = (await request("configure", {
              server,
            })) as CloudSyncStatus;
            setSaved(status.server);
            setServer(status.server!);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Couldn’t save server settings.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="setting-row cloud-server-row">
          <label htmlFor="sync-base-url">Base URL</label>
          <div className="setting-control">
            <input
              id="sync-base-url"
              aria-label="Base URL"
              type="url"
              placeholder="https://nomi.ifuryst.com"
              value={server}
              disabled={busy || saved === undefined}
              onChange={(e) => setServer(e.target.value)}
              spellCheck={false}
            />
            <Button
              type="submit"
              disabled={busy || saved === undefined || server === saved}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
