import { useEffect, useState } from "react";
import { Button } from "../components/primitives";
import type { CloudHistoryItems } from "../../../core/src/sync/settings";
import type { SyncRecord } from "../../../core/src/sync/protocol";
export function CloudSyncHistory() {
  const request = window.nomiDesktop!.requestSync!;
  const [items, setItems] = useState<CloudHistoryItems>(),
    [id, setId] = useState("");
  const [versions, setVersions] = useState<SyncRecord[]>([]),
    [selected, setSelected] = useState<SyncRecord>();
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [more, setMore] = useState(false);
  useEffect(() => {
    let active = true;
    request("historyItems").then(
      (v) => {
        if (active) {
          const value = v as CloudHistoryItems;
          setItems(value);
          setId(value.blocks[0]?.id ?? "");
          setNote(value.notes[0]?.id ?? "");
        }
      },
      () => {
        if (active) setError("无法读取历史。");
      },
    );
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setBusy(true);
    setSelected(undefined);
    setError("");
    request("history", { id })
      .then(
        (v) => {
          if (active) {
            const rows = v as SyncRecord[];
            setVersions(rows);
            setSelected(rows[0]);
            setMore(rows.length > 0);
          }
        },
        (e) => {
          if (active) setError(e.message);
        },
      )
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, request]);
  async function loadMore() {
    setBusy(true);
    try {
      const rows = (await request("history", {
        id,
        before: versions.at(-1)?.version,
      })) as SyncRecord[];
      setVersions((v) => [...v, ...rows]);
      setMore(rows.length > 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request("restore", {
        id,
        version: selected.version,
        expectedVersion: items?.blocks.find((b) => b.id === id)?.version,
        noteId: note,
      });
      await request("sync");
      setItems((await request("historyItems")) as CloudHistoryItems);
      const rows = (await request("history", { id })) as SyncRecord[];
      setVersions(rows);
      setSelected(undefined);
      setMore(rows.length > 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const block = items?.blocks.find((b) => b.id === id);
  return (
    <div className="cloud-sync-history">
      <h2>历史版本</h2>
      <p>保留最近 50 条，以及最近 30 天的全部版本。</p>
      <div className="cloud-sync-download">
        <select
          aria-label="选择历史内容块"
          value={id}
          disabled={busy}
          onChange={(e) => setId(e.target.value)}
        >
          {items?.blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.deleted ? "已删除 · " : ""}
              {b.title}
            </option>
          ))}
        </select>
      </div>
      <div className="cloud-sync-compare">
        <div className="cloud-history-list" aria-label="历史版本列表">
          {versions.map((v) => (
            <button
              key={v.version}
              aria-pressed={selected?.version === v.version}
              onClick={() => setSelected(v)}
              disabled={busy}
            >
              <span>
                版本 {v.version}
                {v.deleted ? " · 已删除" : ""}
              </span>
              <small>{new Date(v.updatedAt).toLocaleString()}</small>
            </button>
          ))}
          {!versions.length && !busy && <p>暂无历史版本</p>}
          {more && (
            <Button disabled={busy} onClick={() => void loadMore()}>
              更早的版本
            </Button>
          )}
        </div>
        <pre aria-label="历史内容预览">
          {selected
            ? selected.deleted
              ? "此版本已删除"
              : typeof selected.data?.source === "string"
                ? selected.data.source
                : JSON.stringify(selected.data, null, 2)
            : "选择一个版本查看"}
        </pre>
      </div>
      {block?.deleted && (
        <div className="cloud-sync-download">
          <label htmlFor="sync-restore-note">恢复到文稿</label>
          <select
            id="sync-restore-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          >
            {items?.notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button
        disabled={busy || !selected || selected.deleted || !block}
        onClick={() => void restore()}
      >
        恢复为新版本
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
