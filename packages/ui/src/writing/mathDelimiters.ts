import katex from "katex";

/** Formula editors accept either a body or one complete, explicit math wrapper. */
export function unwrapMath(source: string): string {
  const trimmed = source.trim();
  for (const [open, close] of [
    ["\\(", "\\)"],
    ["\\[", "\\]"],
    ["$$", "$$"],
    ["$", "$"],
  ]) {
    if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) continue;
    const body = trimmed.slice(open.length, -close.length);
    if (body.trim() && !body.includes(close)) return body.trim();
  }
  return source;
}

export function validMath(source: string): boolean {
  if (!source.trim()) return false;
  try {
    katex.renderToString(source, {
      throwOnError: true,
      trust: false,
      strict: "ignore",
      maxExpand: 200,
      maxSize: 10,
    });
    return true;
  } catch {
    return false;
  }
}

// Code and existing dollar math are consumed first, so examples and formulas
// already using Markdown delimiters are never rewritten internally.
export function normalizeMathMarkdown(source: string): string {
  return source.replace(
    /(^[ \t]*(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*(?:`{3,}|~{3,})[^\n]*$|(?![\s\S])))|(`+)[^\n]*?\2|\$\$[\s\S]*?\$\$|(?<![\\$])\$[^\n$]+\$|(?<!\\)\\\(([^\n]*?)\\\)|(?<!\\)\\\[([\s\S]*?)\\\]/gm,
    (match, _fence, _ticks, inline, block, offset: number) => {
      const body = inline ?? block;
      if (body === undefined || !validMath(body)) return match;
      // A display delimiter inside a table cell must stay within that cell.
      const before = source.slice(
        source.lastIndexOf("\n", offset - 1) + 1,
        offset,
      );
      const rest = source.slice(offset + match.length);
      const after = rest.split("\n", 1)[0];
      return block !== undefined && !before.trim() && !after.trim()
        ? `$$\n${body.trim()}\n$$`
        : `$${body.trim()}$`;
    },
  );
}

export function mathTextParts(
  text: string,
): { text: string; latex?: string }[] {
  const pattern =
    /(?<!\\)\\\(([^\n]*?)\\\)|(?<!\\)\\\[([^\n]*?)\\\]|(?<![\\$])\$([^\n$]+)\$(?!\$)/g;
  const parts: { text: string; latex?: string }[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const latex = (match[1] ?? match[2] ?? match[3]).trim();
    if (match[3] !== undefined && match[3] !== latex) continue;
    if (!validMath(latex)) continue;
    if (match.index > end) parts.push({ text: text.slice(end, match.index) });
    parts.push({ text: match[0], latex });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts;
}
