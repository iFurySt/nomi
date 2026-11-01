import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { DocumentDirectoryStatus } from "@nomi/core";
import {
  documentDirectoryAvailable,
  readDocumentDirectory,
  chooseDocumentDirectory,
  revealDocumentDirectory,
} from "@nomi/platform";
import { Button } from "../components/primitives";
import { useWorkspace } from "../workspace-context";
import "./general-settings.css";

export function GeneralSettings() {
  const [directory, setDirectory] = useState<DocumentDirectoryStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { notify } = useWorkspace();
  const available = documentDirectoryAvailable();
  const refresh = () => {
    setError("");
    void readDocumentDirectory()
      .then(setDirectory)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (available) refresh();
  }, [available]);
  async function run(change: boolean) {
    setBusy(true);
    setError("");
    try {
      if (change) {
        const next = await chooseDocumentDirectory();
        if (next) {
          setDirectory(next);
          notify("文稿目录已更新，原目录保留副本。");
        }
      } else await revealDocumentDirectory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setting-group">
      <h2>Documents</h2>
      <div className="setting-card">
        <div className="setting-row document-directory-row" aria-busy={busy}>
          <div>
            <strong>文稿保存目录</strong>
            <p>
              {available
                ? "每篇文稿保存为 .nomi 文件包，包含正文、附件和子文稿。更换目录时保留原副本。"
                : "浏览器中的内容保存在本机浏览器内。请在桌面 App 中设置文稿目录。"}
            </p>
          </div>
          {available && (
            <div className="setting-control document-directory-control">
              <button
                className="document-directory-path"
                title={directory?.path}
                aria-label={
                  directory
                    ? `打开文稿目录：${directory.path}`
                    : "正在读取文稿目录"
                }
                disabled={busy || !directory}
                onClick={() => void run(false)}
              >
                <FolderOpen size={15} />
                <span>{directory?.path ?? "读取中…"}</span>
              </button>
              <Button
                disabled={busy || !directory}
                onClick={() => void run(true)}
              >
                {busy ? "处理中…" : "更改"}
              </Button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="settings-service-error" role="alert">
          {error}
          <Button disabled={busy} onClick={refresh}>
            重试
          </Button>
        </div>
      )}
    </section>
  );
}
