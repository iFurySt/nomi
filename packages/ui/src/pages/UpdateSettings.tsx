import { useEffect, useState } from "react";
import { Button } from "../components/primitives";
import { getRuntimeInfo } from "@nomi/platform";
type Status = {
  version: string;
  available: boolean;
  canCheck?: boolean;
  automatic?: boolean;
  reason?: string;
};
export function UpdateSettings() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const bridge = window.nomiDesktop?.requestUpdates;
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void (
        bridge
          ? bridge("status")
          : getRuntimeInfo().then((info) => ({
              version: info.version,
              available: false,
              reason: "请在正式 macOS App 中检查更新",
            }))
      )
        .then((value) => {
          if (live) setStatus(value);
        })
        .catch(() => {
          if (live) setError("无法读取更新状态");
        });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [bridge]);
  async function action(method: "check" | "automatic", value?: boolean) {
    setError("");
    try {
      if (bridge) setStatus(await bridge(method, value));
    } catch {
      setError("无法检查更新，请稍后重试。");
    }
  }
  return (
    <section className="setting-group">
      <h2>Updates</h2>
      <div className="setting-card">
        <div className="setting-row">
          <div>
            <strong>Nomi {status?.version ?? ""}</strong>
            <p>
              {status?.available
                ? "通过 Sparkle 检查并安装 macOS 更新"
                : status?.reason}
            </p>
          </div>
          <div className="setting-control">
            <Button
              disabled={!status?.available || !status.canCheck}
              onClick={() => void action("check")}
            >
              检查更新
            </Button>
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
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
