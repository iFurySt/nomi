import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "../components/primitives";
import type {
  CloudSyncStatus,
  CloudSyncConflictView,
} from "../../../core/src/sync/settings";
import type { SyncSpace } from "../../../core/src/sync/protocol";
import "./cloud-sync.css";
function content(data: Record<string, unknown> | null | undefined) {
  if (!data) return "已删除";
  return typeof data.source === "string"
    ? data.source
    : JSON.stringify(data, null, 2);
}
// Only exceptional sync setup / conflict review needs a dialog; account identity does not.
export function SyncActions({
  mode,
  onClose,
}: {
  mode: "connect" | "conflict";
  onClose: () => void;
}) {
  const request = window.nomiDesktop!.requestSync!;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [spaces, setSpaces] = useState<SyncSpace[]>(),
    [space, setSpace] = useState("");
  const [conflict, setConflict] = useState<CloudSyncConflictView>();
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>(
    {},
  );
  const [structural, setStructural] = useState<"local" | "remote">();
  const working = useRef(false),
    started = useRef(false);
  async function run(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      working.current = false;
      setBusy(false);
      window.dispatchEvent(new Event("nomi-account-changed"));
    }
  }
  async function prepare() {
    if (mode === "conflict") {
      setConflict((await request("conflict")) as CloudSyncConflictView);
      return;
    }
    const status = (await request("status")) as CloudSyncStatus;
    if (status.binding) {
      await request("enabled", { enabled: true });
      onClose();
      return;
    }
    const list = (await request("spaces")) as SyncSpace[];
    if (list.length > 1) {
      setSpaces(list);
      return;
    }
    await request(
      "bind",
      list.length
        ? { mode: "download", space: list[0].id }
        : { mode: "upload" },
    );
    onClose();
  }
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void run(prepare);
    }
  }, []);
  async function resolve(params: unknown) {
    await run(async () => {
      try {
        await request("resolve", params);
        onClose();
      } catch (e) {
        setConflict((await request("conflict")) as CloudSyncConflictView);
        setChoices({});
        setStructural(undefined);
        throw e;
      }
    });
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !working.current) onClose();
      }}
      title={mode === "connect" ? "Choose your documents" : "Review changes"}
      className="cloud-sync-connect"
    >
      {busy && !spaces && !conflict && (
        <div className="cloud-sync-loading" aria-label="Loading sync details" />
      )}
      {error && <p role="alert">{error}</p>}
      {error && !spaces && !conflict && (
        <Button onClick={() => void run(prepare)}>Try again</Button>
      )}
      {spaces && (
        <>
          <label className="cloud-sync-download">
            Documents
            <select
              aria-label="Cloud documents"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose…</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <p>本机内容会先备份。</p>
          <div className="cloud-sync-connect-actions">
            <Button disabled={busy} variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !space}
              onClick={() =>
                void run(async () => {
                  await request("bind", { mode: "download", space });
                  onClose();
                })
              }
            >
              Continue
            </Button>
          </div>
        </>
      )}
      {conflict && (
        <div className="cloud-sync-conflicts">
          <h2>确认修改</h2>
          {conflict.structuralError ? (
            <>
              <p>文稿结构发生冲突，两个版本均已保留。</p>
              <div className="cloud-sync-compare">
                <label>
                  <input
                    type="radio"
                    name="structure"
                    checked={structural === "local"}
                    onChange={() => setStructural("local")}
                  />
                  保留本机版本
                  <pre>{JSON.stringify(conflict.local, null, 2)}</pre>
                </label>
                <label>
                  <input
                    type="radio"
                    name="structure"
                    checked={structural === "remote"}
                    onChange={() => setStructural("remote")}
                  />
                  使用云端版本
                  <pre>{JSON.stringify(conflict.remote.records, null, 2)}</pre>
                </label>
              </div>
            </>
          ) : (
            conflict.conflicts.map((item) => (
              <div key={item.key} className="cloud-sync-conflict">
                <h3>{(item.local?.data.title as string) || item.key}</h3>
                <div className="cloud-sync-compare">
                  {(["local", "remote"] as const).map((side) => (
                    <label key={side}>
                      <input
                        type="radio"
                        name={item.key}
                        checked={choices[item.key] === side}
                        onChange={() =>
                          setChoices((v) => ({ ...v, [item.key]: side }))
                        }
                      />
                      {side === "local" ? "本机修改" : "云端修改"}
                      <pre>{content(item[side]?.data)}</pre>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
          <Button
            disabled={
              busy ||
              (conflict.structuralError
                ? !structural
                : conflict.conflicts.some((c) => !choices[c.key]))
            }
            onClick={() =>
              void resolve({
                choices,
                structural,
                reviewId: conflict.reviewId,
              })
            }
          >
            应用所选版本
          </Button>
        </div>
      )}
    </Modal>
  );
}
