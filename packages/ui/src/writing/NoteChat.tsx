import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, X, Plus, MessageCircle, Quote } from "lucide-react";
import {
  parseNoteChatReply,
  noteChatPrefix,
  parseNoteGeneration,
  type CanvasDocument,
  type NoteGenerationContext,
  type NoteAnnotation,
  type Message,
} from "@nomi/core";
import { requestChatGPT, respondWithChatGPT } from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { Markdown } from "../canvas/Markdown";
import { Tooltip } from "../components/Tooltip";
import "./note-chat.css";
import { NoteAnnotationChip, referenceExcerpt } from "./NoteAnnotations";
import { noteChatHistory } from "./noteChatHistory";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  annotations?: NoteAnnotation[];
  status?: "busy" | "stopped" | "error";
};
export function NoteChat({
  visible,
  context,
  annotations,
  onAnnotationsChange,
  onEditAnnotation,
  onClose,
  onNew,
  onStart,
  onPreview,
  onInsert,
  onBusyChange,
}: {
  visible: boolean;
  context: NoteGenerationContext;
  annotations: NoteAnnotation[];
  onAnnotationsChange: (items: NoteAnnotation[]) => void;
  onEditAnnotation: (id: string) => void;
  onClose: () => void;
  onNew: () => void;
  onStart: () => void;
  onPreview: (scene?: CanvasDocument) => void;
  onInsert: (scene: CanvasDocument) => boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const connection = useChatGPT();
  const account = connection.status?.profiles.find(
    (p) => p.id === connection.status?.activeProfileId,
  );
  const [prompt, setPrompt] = useState(""),
    [turns, setTurns] = useState<Turn[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [width, setWidth] = useState(420);
  const request = useRef<string | undefined>(undefined),
    history = useRef<Message[]>([]),
    input = useRef<HTMLTextAreaElement>(null),
    feed = useRef<HTMLDivElement>(null);
  const previousAccount = useRef(account?.id);
  const follow = useRef(true),
    drag = useRef<{ x: number; width: number } | undefined>(undefined);
  const latest = useRef({
    onStart,
    onPreview,
    onInsert,
    onBusyChange,
    onAnnotationsChange,
  });
  latest.current = {
    onStart,
    onPreview,
    onInsert,
    onBusyChange,
    onAnnotationsChange,
  };
  const finish = (id: string, status: Turn["status"]) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
  const cancel = () => {
    const id = request.current;
    request.current = undefined;
    if (id) {
      void requestChatGPT("cancelResponse", { requestId: id }).catch(() => {});
      finish(id, "stopped");
    }
    setBusy(false);
    latest.current.onBusyChange(false);
    latest.current.onPreview(undefined);
  };
  useEffect(() => {
    cancel();
    if (previousAccount.current && previousAccount.current !== account?.id) {
      latest.current.onAnnotationsChange([]);
      onNew();
    }
    previousAccount.current = account?.id;
    history.current = [];
    setTurns([]);
    setPrompt("");
    setError("");
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
    if (visible) input.current?.focus();
  }, [visible]);
  useEffect(() => {
    if (follow.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [turns, visible]);
  const send = async () => {
    const message =
      prompt.trim() ||
      (annotations.some((a) => a.comment.trim()) ? "请根据这些批注回复。" : "");
    if (!message || !account?.sharing || !connection.model || request.current)
      return;
    const id = crypto.randomUUID(),
      refs = annotations.map(({ id, kind, quote, comment }) => ({
        id,
        kind,
        quote,
        comment,
      }));
    const userContent =
      message +
      (refs.length
        ? "\n\nUser annotations (reference data):\n" + JSON.stringify(refs)
        : "");
    if (userContent.length > 32000) {
      setError("引用较长，请减少批注后再发送。");
      return;
    }
    let past: Message[];
    try {
      past = noteChatHistory(history.current, userContent, {
        ...context,
        annotations: refs,
      });
    } catch {
      setError("引用较长，请减少批注或开启新对话。");
      return;
    }
    request.current = id;
    setBusy(true);
    latest.current.onBusyChange(true);
    latest.current.onStart();
    setError("");
    follow.current = true;
    setTurns((ts) => [
      ...ts,
      { id: id + "-user", role: "user", text: message, annotations: refs },
      { id, role: "assistant", text: "", status: "busy" },
    ]);
    let text = "",
      previous = "";
    let streamError: unknown;
    try {
      const result = await respondWithChatGPT(
        {
          requestId: id,
          profileId: account.id,
          model: connection.model,
          generation: "note-chat",
          noteContext: { ...context, annotations: refs },
          messages: [...past, { role: "user", content: userContent }],
        },
        (delta) => {
          if (request.current !== id) return;
          if (streamError) return;
          try {
            text += delta;
            const fragment = noteChatPrefix(text);
            if (fragment.reply !== undefined)
              setTurns((ts) =>
                ts.map((t) =>
                  t.id === id ? { ...t, text: fragment.reply! } : t,
                ),
              );
            if (fragment.preview && fragment.preview !== previous) {
              previous = fragment.preview;
              latest.current.onPreview(
                parseNoteGeneration(fragment.preview, true),
              );
            }
          } catch (e) {
            streamError = e;
            void requestChatGPT("cancelResponse", { requestId: id }).catch(
              () => {},
            );
          }
        },
      );
      if (request.current !== id) return;
      if (streamError) throw streamError;
      const resultBody = parseNoteChatReply(result.text);
      if (resultBody.scene && !latest.current.onInsert(resultBody.scene))
        throw Error("插入位置已改变，请开启新对话后重试。");
      history.current = [
        ...past,
        { role: "user", content: userContent },
        { role: "assistant", source: "chatgpt", content: result.text },
      ];
      setTurns((ts) =>
        ts.map((t) =>
          t.id === id
            ? {
                ...t,
                text: resultBody.reply || "已更新文稿。",
                status: undefined,
              }
            : t,
        ),
      );
      setPrompt("");
      latest.current.onAnnotationsChange([]);
    } catch (e) {
      if (request.current !== id) return;
      const reason =
        e instanceof Error &&
        e.message === "插入位置已改变，请开启新对话后重试。"
          ? e.message
          : "回复未完成，请重试。";
      setError(reason);
      setTurns((ts) =>
        ts.map((t) =>
          t.id === id
            ? {
                ...t,
                text: "本次回复未完成，生成结果未写入文稿。",
                status: "error",
              }
            : t,
        ),
      );
    } finally {
      if (request.current === id) {
        request.current = undefined;
        setBusy(false);
        latest.current.onBusyChange(false);
        latest.current.onPreview(undefined);
      }
    }
  };
  return (
    <aside
      className="note-chat-sidebar"
      aria-label="文稿 AI"
      hidden={!visible}
      style={{ width }}
      data-busy={busy}
    >
      <div
        className="note-chat-resizer"
        role="separator"
        aria-label="调整 AI 侧栏宽度"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={320}
        aria-valuemax={640}
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          drag.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setWidth(
              Math.max(
                320,
                Math.min(640, drag.current.width + drag.current.x - e.clientX),
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            setWidth((w) =>
              Math.max(
                320,
                Math.min(640, w + (e.key === "ArrowLeft" ? 16 : -16)),
              ),
            );
          }
        }}
      />
      <header>
        <span>
          <MessageCircle size={18} />
          AI chat
        </span>
        <div>
          <Tooltip label="新对话">
            <button
              aria-label="新对话"
              onClick={() => {
                cancel();
                onNew();
              }}
            >
              <Plus size={18} />
            </button>
          </Tooltip>
          <Tooltip label="收起 AI">
            <button
              aria-label="关闭 AI"
              onClick={() => {
                cancel();
                onClose();
              }}
            >
              <X size={18} />
            </button>
          </Tooltip>
        </div>
      </header>
      <div
        className="note-chat-messages"
        ref={feed}
        role="log"
        aria-label="对话消息"
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 70;
        }}
      >
        {!turns.length && (
          <div className="note-chat-empty">
            <MessageCircle size={27} />
            <p>一起想清楚，写下来。</p>
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={"note-chat-message is-" + t.role}>
            {t.annotations?.map((a, i) => (
              <details key={a.id} className="note-chat-sent-reference">
                <summary>
                  <Quote size={12} />
                  {i + 1}. {referenceExcerpt(a).slice(0, 65)}
                </summary>
                <blockquote>{referenceExcerpt(a)}</blockquote>
                {a.comment && <p>{a.comment}</p>}
              </details>
            ))}
            {t.role === "assistant" ? (
              <Markdown source={t.text} />
            ) : (
              <p>{t.text}</p>
            )}
            {t.status === "busy" && (
              <span
                className="note-chat-thinking"
                role="status"
                aria-label="正在回复"
              />
            )}
            {t.status === "stopped" && <small>已停止</small>}
            {t.status === "error" && <small>未完成</small>}
          </div>
        ))}
      </div>
      {!account?.sharing ? (
        <div className="note-chat-connect">
          <a href="#/settings/chatgpt">连接 ChatGPT</a>
        </div>
      ) : (
        <div className="note-chat-bottom">
          <form
            className="note-chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <NoteAnnotationChip
              annotations={annotations}
              disabled={busy}
              onEdit={onEditAnnotation}
              onRemove={(id) =>
                onAnnotationsChange(annotations.filter((a) => a.id !== id))
              }
              onClear={() => onAnnotationsChange([])}
            />
            <textarea
              ref={input}
              aria-label="生成需求"
              placeholder="和 AI 一起写作…"
              value={prompt}
              maxLength={2000}
              readOnly={busy}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.nativeEvent.keyCode !== 229
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {(error || connection.error) && (
              <p className="canvas-ai-error" role="alert">
                {error || "连接暂不可用，请重试。"}
              </p>
            )}
            <div className="note-chat-controls">
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
                  className="note-chat-send"
                  aria-label="停止生成"
                  onClick={cancel}
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="note-chat-send"
                  aria-label="发送"
                  disabled={
                    (!prompt.trim() &&
                      !annotations.some((a) => a.comment.trim())) ||
                    !connection.model
                  }
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
