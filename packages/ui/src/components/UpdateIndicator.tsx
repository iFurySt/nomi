import { Tooltip } from "./Tooltip";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Download, RotateCw, AlertCircle } from "lucide-react";
import { updateLabel } from "@nomi/core";
import { useUpdates } from "../update-context";
import { Button } from "./primitives";

export function UpdateIndicator() {
  const { status, action } = useUpdates();
  const [open, setOpen] = useState(false);
  const [railVisible, setRailVisible] = useState(
    () => matchMedia("(min-width: 600px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(min-width: 600px)");
    const changed = () => setRailVisible(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  const phase = status?.phase;
  useEffect(() => {
    if (phase === "ready" || phase === "error") setOpen(true);
  }, [phase]);
  if (
    !railVisible ||
    !status?.available ||
    !phase ||
    ["idle", "up-to-date", "checking"].includes(phase)
  )
    return null;
  const active =
    phase === "downloading" || phase === "extracting" || phase === "installing";
  const label = updateLabel(status);
  const progress = phase === "downloading" ? status.progress : undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label={label} side="right" disabled={open}>
        <Popover.Trigger asChild>
          <button
            className="rail-button rail-update"
            aria-label={label}
            onClick={(event) => {
              if (phase === "available") {
                event.preventDefault();
                void action("download");
              }
            }}
          >
            <span className="update-glyph">
              {active ? (
                <svg
                  viewBox="0 0 32 32"
                  className={
                    progress === undefined
                      ? "update-ring spinning"
                      : "update-ring"
                  }
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    progress === undefined
                      ? undefined
                      : Math.floor(progress * 100)
                  }
                >
                  <circle
                    className="update-ring-track"
                    cx="16"
                    cy="16"
                    r="12"
                  />
                  <circle
                    className="update-ring-value"
                    cx="16"
                    cy="16"
                    r="12"
                    pathLength="100"
                    strokeDasharray={`${progress === undefined ? 26 : Math.max(1, progress * 100)} 100`}
                  />
                </svg>
              ) : phase === "ready" ? (
                <RotateCw size={18} />
              ) : phase === "error" ? (
                <AlertCircle size={18} />
              ) : (
                <Download size={18} />
              )}
            </span>
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          className="update-popover"
          side="right"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-label="Nomi 更新"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <strong>
            {phase === "ready"
              ? "更新已就绪"
              : phase === "error"
                ? "更新未完成"
                : "Nomi 更新"}
          </strong>
          {phase !== "error" && (
            <p aria-live="polite">
              {phase === "ready"
                ? `重启后使用${status.nextVersion ? ` Nomi ${status.nextVersion}` : "新版本"}。文稿会先保存。`
                : label}
            </p>
          )}
          {status.error && <p role="alert">{status.error}</p>}
          <div className="update-popover-actions">
            {phase === "ready" && (
              <>
                <Button onClick={() => setOpen(false)}>稍后</Button>
                <Button
                  variant="primary"
                  onClick={() => void action("install")}
                >
                  重启并更新
                </Button>
              </>
            )}
            {phase === "error" && (
              <Button
                onClick={() => void action("check")}
                disabled={!status.canCheck}
              >
                重新检查
              </Button>
            )}
            {status.cancellable && (
              <Button onClick={() => void action("cancel")}>取消下载</Button>
            )}
          </div>
          <Popover.Close
            className="update-popover-close"
            aria-label="关闭更新提示"
          >
            ×
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
