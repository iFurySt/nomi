import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
export function CodeCopy({ source }: { source: string }) {
  const [status, setStatus] = useState<"copied" | "error">();
  useEffect(() => setStatus(undefined), [source]);
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus(undefined), 1800);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <button
      type="button"
      className="code-copy"
      contentEditable={false}
      aria-label="复制代码"
      title={
        status === "copied"
          ? "已复制"
          : status === "error"
            ? "复制失败，请重试"
            : "复制代码"
      }
      data-copied={status === "copied" || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        void navigator.clipboard
          .writeText(source)
          .then(() => setStatus("copied"))
          .catch(() => setStatus("error"));
      }}
    >
      {status === "copied" ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
