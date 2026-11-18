import { parseNoteGeneration } from "./generation";
import { interactiveGenerationPrefix } from "./generation-preview";

/** Strict complete response; conversation cannot mutate a note by accident. */
export function parseNoteChatReply(text: string) {
  if (text.length > 32000) throw Error("回复过长，请缩小范围。");
  const value = JSON.parse(text);
  if (
    !value ||
    Object.keys(value).some((k) => !["reply", "commands"].includes(k)) ||
    typeof value.reply !== "string" ||
    value.reply.length > 12000 ||
    !Array.isArray(value.commands) ||
    (!value.reply.trim() && !value.commands.length)
  )
    throw Error("对话回复格式无效。");
  return {
    reply: value.reply,
    // Markdown-only writing is valid here. All complete command/block validators still run.
    scene: value.commands.length
      ? parseNoteGeneration(JSON.stringify({ commands: value.commands }), true)
      : undefined,
  };
}

/** Read a JSON string prefix without evaluating model code; incomplete escapes wait. */
export function noteChatPrefix(text: string): {
  reply?: string;
  preview?: string;
} {
  if (text.length > 32000) throw Error("回复过长，请缩小范围。");
  const match = text.match(/^\s*\{\s*"reply"\s*:\s*"((?:[^"\\]|\\.)*)/s);
  let reply: string | undefined;
  if (match) {
    try {
      reply = JSON.parse('"' + match[1] + '"');
    } catch {
      /* incomplete unicode */
    }
  }
  // Commands are only recognized after the reply's closing quote, never within its text.
  const end = text.match(
    /^\s*\{\s*"reply"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*"commands"\s*:/s,
  );
  const preview = end
    ? interactiveGenerationPrefix('{"commands":' + text.slice(end[0].length))
    : undefined;
  return { reply, preview };
}
