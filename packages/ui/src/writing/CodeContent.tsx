import {
  Children,
  isValidElement,
  useMemo,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Copy, Check } from "lucide-react";
import { codeHighlight } from "./highlight";
import "./code.css";
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
type HighlightNode = {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HighlightNode[];
};
function tokens(nodes: HighlightNode[]): ReactNode[] {
  return nodes.map((node, index) =>
    node.type === "text" ? (
      node.value
    ) : (
      <span
        key={index}
        className={
          Array.isArray(node.properties?.className)
            ? node.properties.className.join(" ")
            : undefined
        }
      >
        {tokens(node.children ?? [])}
      </span>
    ),
  );
}
export function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  const props = isValidElement<{ children?: ReactNode; className?: string }>(
    child,
  )
    ? child.props
    : undefined;
  const source = String(props?.children ?? "").replace(/\n$/, "");
  const language = props?.className?.match(/language-([^\s]+)/)?.[1];
  const highlighted = useMemo(
    () =>
      language
        ? codeHighlight.highlight(language, source)
        : codeHighlight.highlightAuto(source),
    [language, source],
  );
  return (
    <div className="writing-code-block">
      <CodeCopy source={source} />
      <pre>
        <code className={props?.className}>{tokens(highlighted.children)}</code>
      </pre>
    </div>
  );
}
