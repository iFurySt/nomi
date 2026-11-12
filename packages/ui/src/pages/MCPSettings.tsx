import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../components/primitives";

export function MCPSettings() {
  const request = window.nomiDesktop?.requestAutomationSettings;
  const [status, setStatus] = useState<{
    enabled: boolean;
    readOnly: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    request?.("status").then(
      (value) => {
        if (active) setStatus(value);
      },
      () => {
        if (active) setError("无法读取 MCP 设置，请重新打开此页面。");
      },
    );
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function action(
    method: "enabled" | "readOnly" | "copyConfig",
    value?: boolean,
  ) {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      setStatus(await request(method, value));
      if (method === "copyConfig") setCopied(true);
    } catch {
      setError(
        method === "copyConfig"
          ? "复制失败，请重试。"
          : "设置未能更新，请重试。",
      );
      try {
        setStatus(await request("status"));
      } catch {
        /* Keep the last known state. */
      }
    } finally {
      setBusy(false);
    }
  }
  if (!request) return <p>请在桌面版 Nomi 中设置 MCP。</p>;
  return (
    <section className="setting-group" aria-label="MCP 设置" aria-busy={busy}>
      <div className="setting-card">
        <div className="setting-row">
          <div>
            <strong>启用 MCP</strong>
            <p>允许本机 AI 工具访问 Nomi 文稿。</p>
          </div>
          <button
            className={`setting-switch ${status?.enabled ? "on" : ""}`}
            role="switch"
            aria-label="启用 MCP"
            aria-checked={!!status?.enabled}
            disabled={!status || busy}
            onClick={() => void action("enabled", !status?.enabled)}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>仅允许读取</strong>
            <p>允许查看和搜索，不允许修改文稿。</p>
          </div>
          <button
            className={`setting-switch ${status?.readOnly ? "on" : ""}`}
            role="switch"
            aria-label="仅允许读取"
            aria-checked={!!status?.readOnly}
            disabled={!status || busy}
            onClick={() => void action("readOnly", !status?.readOnly)}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>连接配置</strong>
            <p>添加到支持 MCP 的客户端，使用时保持 Nomi 打开。</p>
          </div>
          <div className="setting-control">
            <Button
              disabled={busy || !status}
              onClick={() => void action("copyConfig")}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span aria-live="polite">{copied ? "已复制" : "复制配置"}</span>
            </Button>
          </div>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
