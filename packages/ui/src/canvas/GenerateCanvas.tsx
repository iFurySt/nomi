import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Editor } from "@tiptap/core";
import { ArrowUp, Square, X, Sparkles } from "lucide-react";
import {
  interactiveGenerationPrefix,
  parseCanvasGeneration,
  parseNoteGeneration,
  NOTE_INTERACTION_REQUIRED,
  NOTE_INTERACTION_UNSUPPORTED,
  type CanvasDocument,
  type NoteGenerationContext,
} from "@nomi/core";
import { respondWithChatGPT, requestChatGPT } from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import "./generation.css";

export function GenerateCanvas({
  onClose,
  onStart,
  onPreview,
  onInsert,
  noteContext,
  anchor,
  onBusyChange,
}: {
  noteContext?: NoteGenerationContext;
  anchor?: { editor: Editor; position: number };
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  onStart: () => void;
  onPreview: (scene?: CanvasDocument) => void;
  onInsert: (scene: CanvasDocument) => boolean;
}) {
  const connection = useChatGPT();
  const account = connection.status?.profiles.find(
    (p) => p.id === connection.status?.activeProfileId,
  );
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState("");
  const [docked, setDocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const request = useRef<string | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const connect = useRef<HTMLAnchorElement>(null);
  const history = useRef<
    Array<{ role: "user" | "assistant"; content: string; source?: "chatgpt" }>
  >([]);
  const [hasResult, setHasResult] = useState(false);
  const composer = useRef<HTMLElement>(null);
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>();
  const callbacks = useRef({ onStart, onPreview, onInsert, onBusyChange });
  callbacks.current = { onStart, onPreview, onInsert, onBusyChange };
  useLayoutEffect(() => {
    if (!anchor || docked) return;
    let frame = 0;
    const place = () => {
      if (anchor.editor.isDestroyed) return;
      const rect = anchor.editor.view.coordsAtPos(
        Math.min(anchor.position, anchor.editor.state.doc.content.size),
      );
      const width = Math.min(
        account?.sharing ? 520 : 300,
        window.innerWidth - 32,
      );
      const height = composer.current?.offsetHeight ?? 180;
      const below = rect.bottom + 10;
      const top =
        below + height <= window.innerHeight - 16
          ? below
          : rect.top - height - 10;
      setAnchorStyle({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(top, window.innerHeight - height - 16)),
        width,
        bottom: "auto",
        transform: "none",
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (composer.current) observer.observe(composer.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [anchor, docked, account?.sharing]);
  const cancel = () => {
    const id = request.current;
    request.current = undefined;
    if (id)
      void requestChatGPT("cancelResponse", { requestId: id }).catch(() => {});
    callbacks.current.onPreview(undefined);
    setBusy(false);
    callbacks.current.onBusyChange?.(false);
    if (id) setStatus("已停止");
  };
  useEffect(() => {
    cancel();
    history.current = [];
    return () => {
      const id = request.current;
      request.current = undefined;
      if (id)
        void requestChatGPT("cancelResponse", { requestId: id }).catch(
          () => {},
        );
    };
  }, [account?.id]);
  useEffect(() => {
    if (!busy) {
      if (account?.sharing) input.current?.focus();
      else connect.current?.focus();
    }
  }, [busy, account?.sharing]);
  const close = () => {
    cancel();
    onClose();
  };
  const generate = async () => {
    const message = prompt.trim();
    if (!message || !account?.sharing || !connection.model || request.current)
      return;
    const id = crypto.randomUUID();
    request.current = id;
    setSent(message);
    setDocked(true);
    setBusy(true);
    callbacks.current.onBusyChange?.(true);
    setError("");
    setStatus("正在构思…");
    callbacks.current.onStart();
    let text = "",
      previous = "",
      streamError: Error | undefined;
    try {
      const result = await respondWithChatGPT(
        {
          requestId: id,
          profileId: account.id,
          model: connection.model,
          generation: noteContext ? "note" : "canvas",
          ...(noteContext ? { noteContext } : {}),
          messages: [...history.current, { role: "user", content: message }],
        },
        (delta) => {
          if (request.current !== id || streamError) return;
          try {
            text += delta;
            const prefix = interactiveGenerationPrefix(text);
            if (prefix && prefix !== previous) {
              previous = prefix;
              const scene = noteContext
                ? parseNoteGeneration(prefix, true)
                : parseCanvasGeneration(prefix);
              callbacks.current.onPreview(scene);
              setStatus("正在绘制…");
            }
          } catch (e) {
            streamError = e as Error;
            void requestChatGPT("cancelResponse", { requestId: id }).catch(
              () => {},
            );
          }
        },
      );
      if (request.current !== id) return;
      if (streamError) throw streamError;
      const scene = noteContext
        ? parseNoteGeneration(result.text)
        : parseCanvasGeneration(result.text);
      if (!callbacks.current.onInsert(scene))
        throw Error("插入位置已改变，请重新选择。");
      // The latest successful exchange contains the complete current result.
      // Failed/cancelled output must never become the basis for an edit.
      if (noteContext) {
        history.current = [
          { role: "user", content: message },
          { role: "assistant", source: "chatgpt", content: result.text },
        ];
        setHasResult(true);
      }
      callbacks.current.onPreview(undefined);
      setStatus("已生成");
      setPrompt("");
    } catch (e) {
      if (request.current !== id) return;
      callbacks.current.onPreview(undefined);
      setError(
        e instanceof Error &&
          [
            "插入位置已改变，请重新选择。",
            NOTE_INTERACTION_REQUIRED,
            NOTE_INTERACTION_UNSUPPORTED,
          ].includes(e.message)
          ? e.message
          : "生成未完成，请重试。",
      );
      setStatus("");
    } finally {
      if (request.current === id) {
        request.current = undefined;
        setBusy(false);
        callbacks.current.onBusyChange?.(false);
      }
    }
  };
  return (
    <section
      ref={composer}
      style={!docked ? anchorStyle : undefined}
      className={`canvas-ai-composer${docked ? " is-docked" : ""}`}
      aria-label={noteContext ? "文稿 AI" : "画布 AI"}
      data-busy={busy}
      data-disconnected={!account?.sharing || undefined}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" && !e.nativeEvent.isComposing) close();
      }}
    >
      <button className="canvas-ai-close" aria-label="关闭 AI" onClick={close}>
        <X size={16} />
      </button>
      {docked && (
        <div className="canvas-ai-reply">
          <p>{sent}</p>
          <span role="status">
            <Sparkles size={14} className={busy ? "is-thinking" : ""} />
            {status}
          </span>
        </div>
      )}
      {!account?.sharing ? (
        <div className="canvas-ai-connect">
          <a ref={connect} href="#/settings/chatgpt" onClick={close}>
            <Sparkles size={18} />
            连接 ChatGPT
          </a>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <textarea
            ref={input}
            aria-label="生成需求"
            placeholder={
              noteContext
                ? hasResult
                  ? "继续调整…"
                  : "想生成什么交互块？"
                : "想在画布上画什么？"
            }
            value={prompt}
            maxLength={2000}
            readOnly={busy}
            hidden={busy}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                void generate();
              }
            }}
          />
          {(error || connection.error) && (
            <p className="canvas-ai-error" role="alert">
              {error || "连接暂不可用，请重试。"}
            </p>
          )}
          <div className="canvas-ai-controls">
            <select
              aria-label="生成模型"
              value={connection.model}
              disabled={busy || connection.modelsLoading}
              onChange={(e) => connection.setModel(e.target.value)}
            >
              {connection.models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.displayName}
                </option>
              ))}
            </select>
            {busy ? (
              <button
                type="button"
                className="canvas-ai-send"
                aria-label="停止生成"
                onClick={cancel}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="canvas-ai-send"
                aria-label="发送"
                disabled={!prompt.trim() || !connection.model}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
