export type UpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "extracting"
  | "ready"
  | "installing"
  | "error";
export type UpdateAction =
  "status" | "check" | "automatic" | "download" | "install" | "cancel";
export interface UpdateStatus {
  version: string;
  available: boolean;
  canCheck?: boolean;
  automatic?: boolean;
  reason?: string;
  phase?: UpdatePhase;
  nextVersion?: string;
  progress?: number;
  cancellable?: boolean;
  error?: string;
}
export function updateLabel(status?: UpdateStatus): string {
  switch (status?.phase) {
    case "checking":
      return "正在检查更新…";
    case "up-to-date":
      return "已是最新版本";
    case "available":
      return `发现新版本${status.nextVersion ? ` ${status.nextVersion}` : ""}，点击下载`;
    case "downloading":
      return status.progress === undefined
        ? "正在下载更新…"
        : `正在下载更新 ${Math.floor(status.progress * 100)}%`;
    case "extracting":
      return "正在准备更新…";
    case "ready":
      return "更新已下载，重启生效";
    case "installing":
      return "正在保存文稿并重启…";
    case "error":
      return status.error || "更新失败，请重试";
    default:
      return status?.reason || "检查更新";
  }
}
