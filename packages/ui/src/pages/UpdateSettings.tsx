import { updateLabel } from "@nomi/core";
import { Button } from "../components/primitives";
import { useUpdates } from "../update-context";

export function UpdateSettings() {
  const { status, action } = useUpdates();
  const phase = status?.phase;
  return (
    <section className="setting-group">
      <h2>Updates</h2>
      <div className="setting-card">
        <div className="setting-row">
          <div>
            <strong>Nomi {status?.version ?? ""}</strong>
            <p aria-live="polite">{updateLabel(status)}</p>
          </div>
          <div className="setting-control">
            {phase === "available" ? (
              <Button onClick={() => void action("download")}>下载更新</Button>
            ) : phase === "ready" ? (
              <Button variant="primary" onClick={() => void action("install")}>
                重启并更新
              </Button>
            ) : status?.cancellable ? (
              <Button onClick={() => void action("cancel")}>取消</Button>
            ) : (
              <Button
                disabled={!status?.available || !status.canCheck}
                onClick={() => void action("check")}
              >
                检查更新
              </Button>
            )}
          </div>
        </div>
        {status?.available && (
          <div className="setting-row">
            <strong>自动检查更新</strong>
            <button
              className={`setting-switch ${status.automatic ? "on" : ""}`}
              role="switch"
              aria-label="自动检查更新"
              aria-checked={!!status.automatic}
              onClick={() => void action("automatic", !status.automatic)}
            >
              <span />
            </button>
          </div>
        )}
      </div>
      {status?.error && <p role="alert">{status.error}</p>}
    </section>
  );
}
