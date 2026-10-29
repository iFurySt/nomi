import "./chat.css";
import { AgentTimeline, AgentPromptCard } from "../components/AgentChat";
import {
  ChatMarkdown,
  ChatActivity,
  ChatSources,
  CopyButton,
} from "../components/ChatContent";
import { Select } from "../components/Select";
import { memo, useState, useLayoutEffect, useEffect, useRef } from "react";
import {
  ArrowUp,
  ArrowDown,
  BookOpen,
  ChartNoAxesCombined,
  FileText,
  Sparkles,
  Square,
} from "lucide-react";
import type {
  ChatGPTEffort,
  ChatToolStep,
  Conversation,
  Message,
  AgentChatItem,
  AgentChatPrompt,
} from "@nomi/core";
import { validateChatGPTRequest } from "@nomi/core";
import { requestChatGPT, respondWithChatGPT } from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { useWorkspace, uid } from "../workspace-context";
import { Button } from "../components/primitives";
const starters = [
  {
    icon: FileText,
    title: "Learning plan",
    text: "Help me make a learning plan for a topic I want to understand.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Organize notes",
    text: "Help me turn my notes into a clear summary and next steps.",
  },
  {
    icon: BookOpen,
    title: "Research a topic",
    text: "Help me research a topic and keep track of the sources.",
  },
];
export function Research({
  draft,
  clearDraft,
}: {
  draft: string;
  clearDraft: () => void;
}) {
  const { workspace, update, conversationId, openConversation, notify } =
    useWorkspace();
  const [prompt, setPrompt] = useState(draft);
  const [selectedEffort, setEffort] = useState<ChatGPTEffort>();
  const [atBottom, setAtBottom] = useState(true);
  const follow = useRef(true);
  const chatgpt = useChatGPT();
  const selectedModel = chatgpt.models.find((m) => m.slug === chatgpt.model);
  const efforts = selectedModel?.reasoningEfforts ?? [];
  const effort =
    selectedEffort && efforts.includes(selectedEffort)
      ? selectedEffort
      : selectedModel?.defaultEffort &&
          efforts.includes(selectedModel.defaultEffort)
        ? selectedModel.defaultEffort
        : efforts[0];
  const profile = chatgpt.status?.profiles.find(
    (p) => p.id === chatgpt.status?.activeProfileId,
  );
  const [reply, setReply] = useState<{
    conversationId: string;
    text: string;
    error?: string;
    tools: ChatToolStep[];
    items?: AgentChatItem[];
    prompts?: AgentChatPrompt[];
    startedAt?: number;
    durationMs?: number;
  }>();
  const [sending, setSending] = useState(false);
  const running = useRef<
    { requestId: string; conversationId: string } | undefined
  >(undefined);
  function stop() {
    const request = running.current;
    running.current = undefined;
    setSending(false);
    if (request) {
      void requestChatGPT("cancelResponse", {
        requestId: request.requestId,
      }).catch(() => {});
      setReply((old) =>
        old
          ? {
              ...old,
              error: "Reply stopped. You can retry.",
              durationMs: old.startedAt
                ? Date.now() - old.startedAt
                : undefined,
              items: old.items?.map((item) =>
                item.status === "running"
                  ? { ...item, status: "interrupted" as const }
                  : item,
              ),
              prompts: [],
            }
          : old,
      );
    }
  }
  useEffect(
    () => () => {
      const request = running.current;
      running.current = undefined;
      if (request)
        void requestChatGPT("cancelResponse", {
          requestId: request.requestId,
        }).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (running.current && running.current.conversationId !== conversationId)
      stop();
  }, [conversationId]);
  const end = useRef<HTMLDivElement>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const conversation = workspace.conversations.find(
    (c) => c.id === conversationId,
  );
  useLayoutEffect(() => {
    if (draft) {
      setPrompt(draft);
      clearDraft();
    }
  }, [draft, clearDraft]);
  useEffect(() => {
    const scroller = scrollContainer.current;
    let height = scroller?.clientHeight;
    const scroll = () => {
      if (scroller && height !== scroller.clientHeight) {
        height = scroller.clientHeight;
        if (follow.current) scroller.scrollTop = scroller.scrollHeight;
      }
      const near =
        !scroller ||
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
          100;
      follow.current = near;
      setAtBottom(near);
    };
    scroller?.addEventListener("scroll", scroll, { passive: true });
    const observer = new ResizeObserver(() => {
      if (scroller && follow.current)
        scroller.scrollTop = scroller.scrollHeight;
      height = scroller?.clientHeight;
    });
    if (scroller) observer.observe(scroller);
    return () => {
      scroller?.removeEventListener("scroll", scroll);
      observer.disconnect();
    };
  }, [conversation?.id]);
  useLayoutEffect(() => {
    follow.current = true;
    setAtBottom(true);
  }, [conversation?.id]);
  useLayoutEffect(() => {
    // Read/write layout once per paint and only while following the bottom.
    // Keep selection and the reader's scroll position when reviewing history.
    if (!follow.current) return;
    const frame = requestAnimationFrame(() => {
      const scroller = scrollContainer.current;
      if (scroller && follow.current && !window.getSelection()?.toString())
        scroller.scrollTop = scroller.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    conversation?.id,
    conversation?.messages.length,
    reply?.text,
    reply?.items,
    reply?.prompts,
  ]);
  async function send(retry = false) {
    if (running.current || !profile?.sharing || !chatgpt.model) return;
    const text = prompt.trim();
    if (!retry && !text) return;
    if (text.length > 2000) {
      notify("Limit: 2,000 characters.");
      return;
    }
    if ((conversation?.messages.length ?? 0) > (retry ? 99 : 98)) {
      notify("Start a new conversation to continue.");
      return;
    }
    const messages: Message[] = [{ role: "user", content: text }];
    const next = conversation
      ? {
          ...conversation,
          messages: retry
            ? conversation.messages
            : [...conversation.messages, ...messages],
        }
      : { id: uid(), title: text.slice(0, 80), messages };
    const request = {
      requestId: uid(),
      profileId: profile.id,
      model: chatgpt.model,
      messages: next.messages,
      conversationId: next.id,
      webSearch: true,
      ...(effort ? { effort } : {}),
    };
    try {
      validateChatGPTRequest(request);
    } catch (e) {
      notify((e as Error).message);
      return;
    }
    running.current = { requestId: request.requestId, conversationId: next.id };
    follow.current = true;
    setSending(true);
    setReply({
      conversationId: next.id,
      text: "",
      tools: [],
      startedAt: Date.now(),
    });
    update((w) => ({
      ...w,
      conversations: [
        next,
        ...w.conversations.filter((c) => c.id !== next.id),
      ].slice(0, 30),
    }));
    openConversation(next);
    setPrompt("");
    try {
      const result = await respondWithChatGPT(
        request,
        (delta) => {
          if (running.current?.requestId === request.requestId)
            setReply((old) => ({
              ...old,
              conversationId: next.id,
              text: (old?.text ?? "") + delta,
              tools: old?.tools ?? [],
            }));
        },
        (activity) => {
          if (running.current?.requestId === request.requestId)
            setReply((old) => {
              const tools = [...(old?.tools ?? [])];
              const index = tools.findIndex((t) => t.id === activity.id);
              if (index >= 0) tools[index] = activity;
              else if (tools.length < 24) tools.push(activity);
              return {
                ...old,
                conversationId: next.id,
                text: old?.text ?? "",
                tools,
              };
            });
        },
        (event) => {
          if (running.current?.requestId !== request.requestId) return;
          setReply((old) => {
            const items = [...(old?.items ?? [])];
            if (event.item) {
              const index = items.findIndex((i) => i.id === event.item!.id);
              if (index >= 0) items[index] = event.item;
              else if (items.length < 80) items.push(event.item);
            }
            const prompts = (old?.prompts ?? []).filter(
              (p) =>
                p.id !== event.resolvedPromptId && p.id !== event.prompt?.id,
            );
            if (event.prompt) prompts.push(event.prompt);
            return {
              ...old,
              conversationId: next.id,
              text: old?.text ?? "",
              tools: old?.tools ?? [],
              items,
              prompts,
            };
          });
        },
      );
      if (running.current?.requestId !== request.requestId) return;
      // A late response must not resurrect a chat removed by a workspace reset.
      update((w) => ({
        ...w,
        conversations: w.conversations.map((c) =>
          c.id === next.id
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    role: "assistant",
                    content: result.text,
                    source: "chatgpt",
                    ...(result.details ? { details: result.details } : {}),
                  },
                ],
              }
            : c,
        ),
      }));
      setReply(undefined);
      if (result.usageWarning) notify(result.usageWarning);
    } catch (e) {
      if (running.current?.requestId === request.requestId)
        setReply((old) => ({
          ...old,
          conversationId: next.id,
          text: old?.text ?? "",
          tools: old?.tools ?? [],
          error: (e as Error).message,
          durationMs: old?.startedAt ? Date.now() - old.startedAt : undefined,
        }));
    } finally {
      if (running.current?.requestId === request.requestId) {
        running.current = undefined;
        setSending(false);
        void chatgpt.refresh();
      }
    }
  }
  const visibleReply =
    reply?.conversationId === conversationId ? reply : undefined;
  return (
    <div className={`research-page ${conversation ? "has-conversation" : ""}`}>
      {conversation ? (
        <>
          <div className="conversation-header">
            <h1>{conversation.title}</h1>
          </div>
          <div
            className="conversation"
            ref={scrollContainer}
            aria-label="Research conversation"
          >
            <div className="chat-transcript">
              {conversation.messages.map((message, i) => (
                <ChatMessage key={i} message={message} />
              ))}
              {visibleReply && (
                <article
                  className="message message-assistant"
                  aria-busy={sending}
                >
                  {!visibleReply.items?.length && (
                    <ChatActivity
                      tools={visibleReply.tools}
                      running={sending}
                      incomplete={!!visibleReply.error}
                    />
                  )}
                  {visibleReply.error && (
                    <span className="chat-incomplete-label">
                      Incomplete reply
                    </span>
                  )}
                  <div className="message-content">
                    {visibleReply.items?.length ? (
                      <AgentTimeline
                        items={visibleReply.items}
                        running={sending}
                        startedAt={visibleReply.startedAt}
                        durationMs={visibleReply.durationMs}
                        incomplete={!!visibleReply.error}
                      />
                    ) : visibleReply.text ? (
                      <ChatMarkdown text={visibleReply.text} />
                    ) : visibleReply.tools.length ? null : (
                      <span className="thinking-dots" role="status">
                        Thinking<span>…</span>
                      </span>
                    )}
                  </div>
                  {sending &&
                    running.current &&
                    visibleReply.prompts?.map((p) => (
                      <AgentPromptCard
                        key={p.id}
                        prompt={p}
                        requestId={running.current!.requestId}
                      />
                    ))}
                  {visibleReply.error && (
                    <div className="chat-error" role="alert">
                      {visibleReply.error}
                      <div className="chat-actions">
                        <Button
                          onClick={() => void chatgpt.action("openUsage")}
                        >
                          Manage usage
                        </Button>
                        <Button
                          disabled={
                            sending || !profile?.sharing || !chatgpt.model
                          }
                          onClick={() => void send(true)}
                        >
                          Retry reply
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              )}
              {!visibleReply &&
                !sending &&
                conversation.messages.at(-1)?.role === "user" && (
                  <Button
                    disabled={!profile?.sharing || !chatgpt.model}
                    onClick={() => void send(true)}
                  >
                    Retry reply
                  </Button>
                )}
              <div ref={end} className="chat-scroll-end" />
            </div>
          </div>
        </>
      ) : (
        <div className="research-welcome">
          <span className="welcome-mark">
            <Sparkles size={27} strokeWidth={1.5} />
          </span>
          <h1>What would you like to work on?</h1>
        </div>
      )}
      <div className="research-composer-area">
        <div className="chat-composer-inner">
          {!profile?.sharing && (
            <div className="chat-connection">
              <span>
                {chatgpt.available
                  ? "Connect ChatGPT to start chatting."
                  : "Open the desktop app to connect ChatGPT."}
              </span>
              {chatgpt.available && (
                <a className="setting-link" href="#/settings/chatgpt">
                  Connect ChatGPT
                </a>
              )}
            </div>
          )}
          {chatgpt.error && (
            <div className="chat-error" role="alert">
              {chatgpt.error}{" "}
              <a className="setting-link" href="#/settings/chatgpt">
                Connection settings
              </a>
            </div>
          )}
          {conversation && !atBottom && (
            <button
              className="jump-to-latest"
              aria-label="Jump to latest message"
              onClick={() => {
                follow.current = true;
                end.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "end",
                });
              }}
            >
              <ArrowDown size={18} />
            </button>
          )}
          <form
            className="composer research-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Research question"
              placeholder="Message Nomi…"
              maxLength={2000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-footer">
              <div className="chat-model-controls">
                <Select
                  label="Chat model"
                  loading={
                    chatgpt.available &&
                    ((!chatgpt.status && !chatgpt.error) ||
                      chatgpt.modelsLoading)
                  }
                  value={chatgpt.model}
                  disabled={sending || !chatgpt.models.length}
                  onValueChange={(value) => {
                    chatgpt.setModel(value);
                    setEffort(undefined);
                  }}
                  searchable
                  variant="subtle"
                  placeholder="Choose model"
                  options={chatgpt.models.map((m) => ({
                    value: m.slug,
                    label: m.displayName,
                  }))}
                />
                {efforts.length > 0 && (
                  <Select
                    label="Reasoning effort"
                    disabled={sending}
                    value={effort ?? efforts[0]!}
                    onValueChange={setEffort}
                    variant="subtle"
                    options={efforts.map((e) => ({
                      value: e,
                      label: e.charAt(0).toUpperCase() + e.slice(1),
                    }))}
                  />
                )}
              </div>
              {sending ? (
                <button
                  className="send-button"
                  type="button"
                  aria-label="Stop response"
                  onClick={stop}
                >
                  <Square size={16} />
                </button>
              ) : (
                <button
                  className="send-button"
                  aria-label="Send message"
                  disabled={
                    !prompt.trim() || !profile?.sharing || !chatgpt.model
                  }
                  type="submit"
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      {!conversation && (
        <div className="research-starters">
          {starters.map(({ icon: Icon, title, text }) => (
            <button
              key={title}
              onClick={() => {
                setPrompt(text);
                document
                  .querySelector<HTMLTextAreaElement>(
                    ".research-composer textarea",
                  )
                  ?.focus();
              }}
            >
              <Icon size={19} strokeWidth={1.5} />
              <strong>{title}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
}: {
  message: Conversation["messages"][number];
}) {
  return (
    <article className={`message message-${message.role}`}>
      {message.role === "assistant" && message.source !== "chatgpt" && (
        <span className="chat-sample-label">Sample response</span>
      )}
      {message.details && !message.details.items?.length && (
        <ChatActivity
          tools={message.details.tools}
          durationMs={message.details.durationMs}
        />
      )}
      <div className="message-content">
        {message.role === "assistant" && message.details?.items?.length ? (
          <AgentTimeline
            items={message.details.items}
            durationMs={message.details.durationMs}
          />
        ) : message.role === "assistant" ? (
          <ChatMarkdown
            text={message.content}
            citations={message.details?.citations}
          />
        ) : (
          <p>{message.content}</p>
        )}
      </div>
      {message.role === "assistant" && (
        <>
          <ChatSources details={message.details} />
          <CopyButton text={message.content} />
        </>
      )}
    </article>
  );
});
