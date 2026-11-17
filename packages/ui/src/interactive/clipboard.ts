import { parseInteractiveProgram, type InteractiveProgram } from "@nomi/core";

/** Standard HTML survives the OS clipboard; plain DSL remains usable in other apps. */
export function interactiveClipboard(program: InteractiveProgram) {
  const text = JSON.stringify(program, null, 2);
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return { text, html: `<pre data-nomi-interactive="1">${escaped}</pre>` };
}

/** null means ordinary text; recognized but invalid interactive content must not silently become prose. */
export function readInteractiveClipboard(
  text: string,
  html = "",
): InteractiveProgram | null {
  let marked = false;
  if (html.length <= 4_000_000 && html.includes("data-nomi-interactive")) {
    const element = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector('pre[data-nomi-interactive="1"]');
    if (element) {
      text = element.textContent ?? "";
      marked = true;
    }
  }
  let source = text.trim();
  const fenced =
    /^```(?:json|nomi-ui|nomi-interactive)?\s*\n([\s\S]*?)\n```$/i.exec(source);
  if (fenced) source = fenced[1].trim();
  if (
    !marked &&
    (!source.startsWith("{") ||
      !/"schema"\s*:\s*"nomi-interactive-ir\//.test(source))
  )
    return null;
  if (source.length > 2_000_000) throw Error("交互块内容过大，无法粘贴。");
  const value = JSON.parse(source);
  // Older block-selection copy exposed the block wrapper as text.
  return parseInteractiveProgram(
    value.type === "interactive" ? value.program : value,
  );
}

export function interactiveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /Unsupported (component|function|interactive protocol|expression|action)/i.test(
      message,
    )
  )
    return "当前版本不支持这个交互块，请更新 Nomi 后重试。";
  if (error instanceof SyntaxError) return "交互块格式有误，无法粘贴。";
  return message;
}
