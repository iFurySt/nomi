import { useEffect, useState } from "react";
import { Cloud, RefreshCw, Laptop } from "lucide-react";
import { Button } from "../components/primitives";
import type {
  CloudSyncStatus,
  CloudSyncConflictView,
  CloudSyncSession,
  SyncAction,
} from "../../../core/src/sync/settings";
import type { SyncSpace } from "../../../core/src/sync/protocol";
import "./cloud-sync.css";
const labels: Record<CloudSyncStatus["phase"], string> = {
  off: "已关闭",
  ready: "已同步",
  syncing: "同步中",
  pending: "等待同步",
  conflict: "有修改需要确认",
  error: "同步暂不可用",
  auth: "请重新登录",
};
function content(data: Record<string, unknown> | null | undefined) {
  if (!data) return "已删除";
  return typeof data.source === "string"
    ? data.source
    : JSON.stringify(data, null, 2);
}
export function CloudSyncSettings() {
  const request = window.nomiDesktop?.requestSync;
  const [status, setStatus] = useState<CloudSyncStatus>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [server, setServer] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [spaces, setSpaces] = useState<SyncSpace[]>([]),
    [space, setSpace] = useState("");
  const [showBinding, setShowBinding] = useState(false),
    [devices, setDevices] = useState<CloudSyncSession[]>();
  const [conflict, setConflict] = useState<CloudSyncConflictView>(),
    [choices, setChoices] = useState<Record<string, "local" | "remote">>({});
  const [structural, setStructural] = useState<"local" | "remote">();
  useEffect(() => {
    if (!request) return;
    let active = true;
    const refresh = () => {
      request("status").then(
        (v) => {
          if (active) {
            setStatus(v as CloudSyncStatus);
          }
        },
        () => {
          if (active) setError("无法读取同步状态。");
        },
      );
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [request]);
  async function action(method: SyncAction, params?: unknown) {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request(method, params);
      if (method === "spaces") {
        const values = result as SyncSpace[];
        setSpaces(values);
        setSpace(values[0]?.id ?? "");
        setShowBinding(true);
      } else if (method === "sessions")
        setDevices(result as CloudSyncSession[]);
      else if (method === "conflict") {
        setConflict(result as CloudSyncConflictView);
        setChoices({});
        setStructural(undefined);
      } else {
        setStatus(result as CloudSyncStatus);
        if (method === "login") {
          setPassword("");
          setShowBinding(false);
        }
        if (method === "logout") {
          setConflict(undefined);
          setDevices(undefined);
          setSpaces([]);
          setShowBinding(false);
        }
        if (method === "resolve") setConflict(undefined);
        if (method === "bind") setShowBinding(false);
        if (method === "revoke")
          setDevices((await request("sessions")) as CloudSyncSession[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，请重试。");
      if (method === "resolve") {
        setConflict((await request("conflict")) as CloudSyncConflictView);
        setChoices({});
        setStructural(undefined);
      }
    } finally {
      setBusy(false);
    }
  }
  if (!request) return <p>请在桌面版 Nomi 中设置云同步。</p>;
  const needLogin = !status?.account || status.phase === "auth";
  return (
    <section
      className="setting-group cloud-sync-settings"
      aria-label="云同步设置"
      aria-busy={busy}
    >
      <div className="setting-card">
        <div className="setting-row">
          <div>
            <strong>云同步</strong>
            <p>{status?.account?.email ?? "可选开启，文稿始终保存在本机。"}</p>
          </div>
          {status?.binding && status.account && (
            <button
              className={`setting-switch ${status.enabled ? "on" : ""}`}
              role="switch"
              aria-label="启用云同步"
              aria-checked={status.enabled}
              disabled={busy}
              onClick={() =>
                void action("enabled", { enabled: !status.enabled })
              }
            >
              <span />
            </button>
          )}
        </div>
        {needLogin ? (
          <form
            className="cloud-sync-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action("login", {
                server: server || status?.account?.server,
                email: email || status?.account?.email,
                password,
              });
            }}
          >
            <label>
              同步服务
              <input
                aria-label="同步服务"
                type="url"
                placeholder="https://sync.example.com"
                value={server || status?.account?.server || ""}
                onChange={(e) => setServer(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              邮箱
              <input
                aria-label="同步邮箱"
                type="email"
                autoComplete="username"
                value={email || status?.account?.email || ""}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              密码
              <input
                aria-label="同步密码"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={72}
                required
                disabled={busy}
              />
            </label>
            <Button type="submit" disabled={busy || !password}>
              <Cloud size={15} />
              {busy ? "连接中" : "登录"}
            </Button>
          </form>
        ) : (
          <>
            <div className="setting-row">
              <div>
                <strong aria-live="polite">{labels[status.phase]}</strong>
                <p>
                  {status.lastSyncedAt
                    ? `上次同步 ${new Date(status.lastSyncedAt).toLocaleString()}`
                    : status.account?.server}
                </p>
              </div>
              <div className="setting-control">
                {status.binding && (
                  <Button
                    disabled={busy || !status.enabled}
                    onClick={() => void action("sync")}
                  >
                    <RefreshCw size={15} />
                    立即同步
                  </Button>
                )}
                {!status.binding && (
                  <Button disabled={busy} onClick={() => void action("spaces")}>
                    选择资料库
                  </Button>
                )}
              </div>
            </div>
            {(showBinding || !status.binding) && (
              <div className="cloud-sync-binding">
                <p>首次连接会备份本地文稿。</p>
                <Button
                  disabled={busy}
                  onClick={() => void action("bind", { mode: "upload" })}
                >
                  将本机文稿同步到新云库
                </Button>
                <div className="cloud-sync-download">
                  <select
                    aria-label="云端资料库"
                    value={space}
                    onChange={(e) => setSpace(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">选择已有云库</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={busy || !space}
                    onClick={() =>
                      void action("bind", { mode: "download", space })
                    }
                  >
                    下载到本机
                  </Button>
                  <Button disabled={busy} onClick={() => void action("spaces")}>
                    刷新
                  </Button>
                </div>
                <small>下载会替换当前资料库；原内容保留在本地备份中。</small>
              </div>
            )}
            {status.conflicts > 0 && (
              <div className="setting-row">
                <span>{status.conflicts} 处修改需要确认</span>
                <Button disabled={busy} onClick={() => void action("conflict")}>
                  查看双方内容
                </Button>
              </div>
            )}
            <div className="setting-row">
              <Button disabled={busy} onClick={() => void action("sessions")}>
                <Laptop size={15} />
                已登录设备
              </Button>
              <div className="setting-control">
                {status.binding && (
                  <Button disabled={busy} onClick={() => void action("spaces")}>
                    更换资料库
                  </Button>
                )}
                <Button disabled={busy} onClick={() => void action("logout")}>
                  退出登录
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
      {devices && (
        <div className="setting-card" aria-label="已登录设备">
          {devices.map((d) => (
            <div className="setting-row" key={d.id}>
              <div>
                <strong>{d.deviceName}</strong>
                <p>{new Date(d.createdAt).toLocaleDateString()}</p>
              </div>
              <Button
                disabled={busy}
                onClick={() => void action("revoke", { id: d.id })}
              >
                退出此设备
              </Button>
            </div>
          ))}
        </div>
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
            onClick={() => void action("resolve", { choices, structural })}
          >
            应用所选版本
          </Button>
        </div>
      )}
    </section>
  );
}
