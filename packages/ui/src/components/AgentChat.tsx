import { memo, useEffect, useState } from "react";
import {
  ChevronRight,
  TerminalSquare,
  Search,
  FilePenLine,
  ListTodo,
  BookOpen,
  Workflow,
  Info,
  ArchiveRestore,
  Images,
} from "lucide-react";
import type { AgentChatItem, AgentChatPrompt } from "@nomi/core";
import { ChatMarkdown } from "./ChatContent";
import { requestChatGPT } from "@nomi/platform";

// A timer updates only this small label, never the transcript or Markdown tree.
function WorkDuration({
  running,
  startedAt,
  durationMs,
}: {
  running: boolean;
  startedAt?: number;
  durationMs?: number;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running || !startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);
  const ms = running && startedAt ? Math.max(0, now - startedAt) : durationMs;
  const seconds = ms == null ? undefined : Math.max(1, Math.round(ms / 1000));
  const duration =
    seconds == null
      ? ""
      : seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : `${seconds}s`;
  return (
    <span>
      {running ? "Working" : "Worked"}
      {duration ? ` for ${duration}` : ""}
    </span>
  );
}
function activityIcon(item: AgentChatItem) {
  if (item.kind === "command") return TerminalSquare;
  if (item.kind === "search" || /search|stock/i.test(item.title)) return Search;
  if (item.kind === "file") return FilePenLine;
  if (item.kind === "plan") return ListTodo;
  if (item.kind === "compaction") return ArchiveRestore;
  if (item.kind === "agent") return Workflow;
  if (/image/i.test(item.title)) return Images;
  return item.kind === "tool" ? BookOpen : Info;
}
function activityLabel(item: AgentChatItem) {
  const running = item.status === "running";
  const completed = item.status === "completed";
  if (item.kind === "command")
    return running
      ? "Running commands"
      : completed
        ? "Ran commands"
        : "Command execution";
  if (item.kind === "file")
    return running
      ? "Changing files"
      : completed
        ? "Changed files"
        : "File changes";
  if (item.kind === "search" || /web_search|Search the web/.test(item.title))
    return running
      ? "Searching the web"
      : completed
        ? "Searched the web"
        : "Web search";
  if (item.kind === "tool" && /stock/i.test(item.title))
    return running
      ? "Searching local stocks"
      : completed
        ? "Searched local stocks"
        : "Local stock search";
  if (item.kind === "tool" && /view_image/.test(item.title))
    return running
      ? "Viewing an image"
      : completed
        ? "Viewed an image"
        : "Image viewing";
  if (item.kind === "tool") return running ? "Using tools" : "Used tools";
  return item.title;
}
function ActivityStatus({ status }: { status: AgentChatItem["status"] }) {
  if (status === "completed") return null;
  return (
    <small className={`agent-activity-status agent-status-${status}`}>
      {status === "running"
        ? "In progress"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </small>
  );
}
function StepBody({ item }: { item: AgentChatItem }) {
  return item.text ? (
    <pre>{item.text}</pre>
  ) : (
    <p className="agent-step-empty">
      {item.kind === "compaction"
        ? "Conversation context was condensed for continued work."
        : "No additional details."}
    </p>
  );
}
const AgentItem = memo(function AgentItem({ item }: { item: AgentChatItem }) {
  const Icon = activityIcon(item);
  return item.kind === "message" ? (
    <div className="agent-message" data-item-id={item.id}>
      <ChatMarkdown text={item.text ?? ""} />
    </div>
  ) : (
    <details
      className={`agent-step agent-step-${item.status}`}
      data-item-id={item.id}
    >
      <summary>
        <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
        <span>{activityLabel(item)}</span>
        <ActivityStatus status={item.status} />
      </summary>
      <StepBody item={item} />
    </details>
  );
});
const toolKinds = new Set<AgentChatItem["kind"]>([
  "command",
  "file",
  "search",
  "tool",
]);
const AgentToolGroup = memo(function AgentToolGroup({
  items,
}: {
  items: AgentChatItem[];
}) {
  const labels = [...new Set(items.map(activityLabel))];
  const label = labels
    .map((label, index) =>
      index ? label.charAt(0).toLowerCase() + label.slice(1) : label,
    )
    .join(", ");
  const Icon = items.length > 1 ? BookOpen : activityIcon(items[0]!);
  const exceptional = ["running", "failed", "declined", "interrupted"] as const;
  return (
    <details className="agent-activity">
      <summary>
        <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
        <span>{label}</span>
        {exceptional.map((status) => {
          const count = items.filter((i) => i.status === status).length;
          return count ? (
            <small
              className={`agent-activity-status agent-status-${status}`}
              key={status}
            >
              {count} {status === "running" ? "in progress" : status}
            </small>
          ) : null;
        })}
      </summary>
      <div className="agent-activity-items">
        {items.map((item) => (
          <section
            className={`agent-step agent-step-${item.status}`}
            data-item-id={item.id}
            key={item.id}
          >
            <div className="agent-step-heading">
              <span>{item.title}</span>
              <ActivityStatus status={item.status} />
            </div>
            <StepBody item={item} />
          </section>
        ))}
      </div>
    </details>
  );
});
function workGroups(items: AgentChatItem[]) {
  const groups: { id: string; items: AgentChatItem[]; tools: boolean }[] = [];
  for (const item of items) {
    const previous = groups.at(-1);
    if (toolKinds.has(item.kind) && previous?.tools) previous.items.push(item);
    else
      groups.push({
        id: item.id,
        items: [item],
        tools: toolKinds.has(item.kind),
      });
  }
  return groups;
}
export const AgentTimeline = memo(function AgentTimeline({
  items,
  running = false,
  durationMs,
  startedAt,
  incomplete = false,
}: {
  items: AgentChatItem[];
  running?: boolean;
  durationMs?: number;
  startedAt?: number;
  incomplete?: boolean;
}) {
  const messages = items.filter((i) => i.kind === "message");
  const explicit = messages.filter((i) => i.phase === "final_answer");
  // Old transcripts have no phase. Keep the last non-commentary message as the
  // answer; earlier progress and all tool activity belong to the disclosure.
  const finals = explicit.length
    ? explicit
    : messages
        .filter((i) => i.phase !== "commentary" && i.title !== "Progress")
        .slice(-1);
  const work = items.filter((i) => !finals.includes(i));
  const latest = work.at(-1);
  return (
    <div className="agent-timeline">
      <details className="agent-work" data-running={running || undefined}>
        <summary>
          <WorkDuration
            running={running}
            startedAt={startedAt}
            durationMs={durationMs}
          />
          {incomplete && <span>· Interrupted</span>}
          {running && latest && (
            <span className="agent-work-latest">· {latest.title}</span>
          )}
          <ChevronRight size={14} aria-hidden="true" />
        </summary>
        <div className="agent-work-items">
          {work.length ? (
            workGroups(work).map((group) =>
              group.tools ? (
                <AgentToolGroup items={group.items} key={group.id} />
              ) : (
                <AgentItem item={group.items[0]!} key={group.id} />
              ),
            )
          ) : (
            <p className="muted">
              No tool calls or progress updates were reported.
            </p>
          )}
        </div>
      </details>
      {finals.map((item) => (
        <AgentItem item={item} key={item.id} />
      ))}
    </div>
  );
});
export function AgentPromptCard({
  prompt,
  requestId,
}: {
  prompt: AgentChatPrompt;
  requestId: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (decision: "accept" | "decline") => {
    setBusy(true);
    setError("");
    try {
      await requestChatGPT("answerPrompt", {
        requestId,
        promptId: prompt.id,
        decision,
        ...(prompt.questions ? { answers } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <section className="agent-prompt" aria-label={prompt.title}>
      <strong>{prompt.title}</strong>
      <pre>{prompt.description}</pre>
      {prompt.questions?.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.question}</legend>
          {q.options?.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${prompt.id}-${q.id}`}
                value={option}
                checked={answers[q.id] === option}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: option }))}
                disabled={busy}
              />
              {option}
            </label>
          ))}
          <input
            aria-label={`Answer: ${q.question}`}
            placeholder="Type your answer"
            value={answers[q.id] ?? ""}
            maxLength={2000}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
            }
            disabled={busy}
          />
        </fieldset>
      ))}
      {error && <p role="alert">{error}</p>}
      <div className="chat-actions">
        {prompt.kind !== "elicitation" && (
          <button
            type="button"
            className="button"
            disabled={
              busy || !!prompt.questions?.some((q) => !answers[q.id]?.trim())
            }
            onClick={() => void submit("accept")}
          >
            {prompt.kind === "input" ? "Continue" : "Allow once"}
          </button>
        )}
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void submit("decline")}
        >
          {prompt.kind === "input" ? "Skip" : "Decline"}
        </button>
      </div>
      {prompt.kind === "elicitation" && (
        <small>
          This external request is not supported yet. Decline to let the agent
          continue.
        </small>
      )}
    </section>
  );
}
