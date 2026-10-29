import {
  memo,
  useMemo,
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Globe, ChevronRight, WrapText } from "lucide-react";
import {
  safeChatSourceURL,
  type ChatCitation,
  type ChatReplyDetails,
  type ChatToolStep,
} from "@nomi/core";
import { requestChatGPT } from "@nomi/platform";
import { useWorkspace } from "../workspace-context";
import { citedMarkdown } from "@nomi/core";

export function CopyButton({
  text,
  label = "Copy reply",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { notify } = useWorkspace();
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="copy-reply"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => notify("Could not copy. Select the text to copy it."))
      }
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
function SourceLink({
  url,
  children,
  className,
  title,
}: {
  url: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const { notify } = useWorkspace();
  const safe = safeChatSourceURL(url);
  return (
    <a
      href={safe}
      className={className}
      title={title}
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        if (!safe) return;
        if (window.nomiDesktop)
          void requestChatGPT("openSource", { url: safe }).catch((e) =>
            notify(e.message),
          );
        else window.open(safe, "_blank", "noopener,noreferrer");
      }}
    >
      {children}
    </a>
  );
}
function CodeBlock({ children }: { children: ReactNode }) {
  const child = Children.toArray(children)[0];
  const props = isValidElement<{ className?: string; children?: ReactNode }>(
    child,
  )
    ? child.props
    : undefined;
  const text = String(props?.children ?? "").replace(/\n$/, "");
  const language =
    props?.className?.match(/language-([\w+-]+)/)?.[1] || "Plain text";
  const [wrap, setWrap] = useState(false);
  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span>{language}</span>
        <span>
          <button
            type="button"
            className="copy-reply"
            aria-label="Wrap code"
            title="Wrap code"
            aria-pressed={wrap}
            onClick={() => setWrap((v) => !v)}
          >
            <WrapText size={15} />
          </button>
          <CopyButton text={text} label="Copy code" />
        </span>
      </div>
      <pre className={wrap ? "wrap-code" : ""}>
        <code>{text}</code>
      </pre>
    </div>
  );
}
const emptyCitations: ChatCitation[] = [];
const markdownPlugins = [remarkGfm];
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  citations = emptyCitations,
}: {
  text: string;
  citations?: ChatCitation[];
}) {
  const components = useMemo<import("react-markdown").Components>(
    () => ({
      img: () => null,
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      a: ({ href, children }) => {
        const source = citations.find((c) => safeChatSourceURL(c.url) === href);
        return (
          <SourceLink
            url={href ?? ""}
            className={source ? "chat-citation" : undefined}
            title={source?.title}
          >
            {children}
          </SourceLink>
        );
      },
    }),
    [citations],
  );
  return (
    <Markdown remarkPlugins={markdownPlugins} skipHtml components={components}>
      {citedMarkdown(text, citations)}
    </Markdown>
  );
});
export function ChatActivity({
  tools,
  durationMs,
  running = false,
  incomplete = false,
}: {
  tools: ChatToolStep[];
  durationMs?: number;
  running?: boolean;
  incomplete?: boolean;
}) {
  if (!tools.length) return null;
  const seconds =
    durationMs === undefined
      ? undefined
      : Math.max(1, Math.round(durationMs / 1000));
  return (
    <details className="chat-activity">
      <summary>
        <Globe size={14} />
        <span>
          {running
            ? tools.some((t) => t.status !== "completed")
              ? "Searching the web…"
              : "Writing reply…"
            : incomplete
              ? "Search activity · reply interrupted"
              : "Searched the web"}
          {seconds !== undefined ? ` · ${seconds}s` : ""}
        </span>
        <ChevronRight size={14} />
      </summary>
      <ol>
        {tools.map((t) => (
          <li key={t.id}>
            <span>
              {t.type === "search"
                ? "Search"
                : t.type === "open_page"
                  ? "Open page"
                  : "Find in page"}
            </span>
            {t.query && <p>{t.query}</p>}
            <small>
              {running && t.status !== "completed"
                ? "In progress"
                : incomplete && t.status !== "completed"
                  ? "Interrupted"
                  : t.status === "completed"
                    ? "Completed"
                    : "Status unavailable"}
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}
export function ChatSources({ details }: { details?: ChatReplyDetails }) {
  const unique = new Map<string, { url: string; title: string }>();
  for (const source of [
    ...(details?.citations ?? []),
    ...(details?.sources ?? []),
  ]) {
    const key = new URL(source.url);
    for (const name of [...key.searchParams.keys()])
      if (name.startsWith("utm_")) key.searchParams.delete(name);
    if (!unique.has(key.href)) unique.set(key.href, source);
  }
  const sources = [...unique.values()];
  if (!sources.length) return null;
  return (
    <details className="chat-sources">
      <summary>
        {sources.length} {sources.length === 1 ? "source" : "sources"}
        <ChevronRight size={13} />
      </summary>
      <div>
        {sources.map((c) => (
          <SourceLink
            key={c.url}
            url={c.url}
            className="chat-source-card"
            title={c.title}
          >
            <strong>{c.title || new URL(c.url).hostname}</strong>
            <small>{new URL(c.url).hostname}</small>
          </SourceLink>
        ))}
      </div>
    </details>
  );
}
