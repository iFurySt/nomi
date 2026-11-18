import {
  parseNoteChatReply,
  type Message,
  type NoteGenerationContext,
} from "@nomi/core";

/** Keep whole successful pairs and the latest generated definition within host limits. */
export function noteChatHistory(
  history: Message[],
  user: string,
  context: NoteGenerationContext,
): Message[] {
  const past = [...history];
  const protectedReply = [...past].reverse().find((m) => {
    if (m.role !== "assistant") return false;
    try {
      return !!parseNoteChatReply(m.content).scene;
    } catch {
      return false;
    }
  });
  // Host appends this JSON and a fixed reference-data label to the latest user turn.
  const budget =
    Math.min(65000, 100000 - JSON.stringify(context).length - 100) -
    user.length;
  const tooLong = () =>
    past.length >= 98 ||
    past.reduce((n, m) => n + m.content.length, 0) > budget;
  while (past.length > 2 && tooLong())
    past.splice(past[1] === protectedReply ? 2 : 0, 2);
  if (tooLong()) {
    if (past[1] === protectedReply)
      throw Error("引用较长，请减少批注或开启新对话。");
    past.splice(0);
  }
  return past;
}
