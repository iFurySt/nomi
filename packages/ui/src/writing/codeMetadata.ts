/** Optional fence metadata stays plain text, so AI and external editors can edit it. */
export function parseCodeInfo(info = "") {
  const [, language = "", rest = ""] = info.match(/^(\S*)\s*(.*)$/s) ?? [];
  const match = rest.match(/(?:^|\s)nomi=(\{.*\})$/s);
  let metadata: Record<string, unknown> = {};
  let extra = rest;
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed;
        extra = rest.slice(0, match.index).trim();
      }
    } catch {
      /* Preserve unrecognized metadata verbatim. */
    }
  }
  return {
    language: language === "auto" ? null : language || null,
    caption: typeof metadata.caption === "string" ? metadata.caption : "",
    wrap: metadata.wrap === true,
    collapsed: metadata.collapsed === true,
    codeMetadata: metadata,
    codeExtra: extra,
  };
}
export function codeInfo(attrs: Record<string, unknown>) {
  const metadata = {
    ...((attrs.codeMetadata as Record<string, unknown>) ?? {}),
  };
  for (const key of ["caption", "wrap", "collapsed"]) {
    if (attrs[key]) metadata[key] = attrs[key];
    else delete metadata[key];
  }
  const extra = [
    attrs.codeExtra,
    Object.keys(metadata).length ? `nomi=${JSON.stringify(metadata)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [attrs.language || (extra ? "auto" : ""), extra]
    .filter(Boolean)
    .join(" ");
}
export function codeFence(attrs: Record<string, unknown>, source: string) {
  const fence = "`".repeat(
    Math.max(3, ...[...source.matchAll(/`+/g)].map((m) => m[0].length + 1)),
  );
  return `${fence}${codeInfo(attrs)}\n${source}\n${fence}`;
}

type CodeTree = {
  type: string;
  lang?: string;
  meta?: string;
  data?: { hProperties?: Record<string, unknown> };
  children?: CodeTree[];
};
export function remarkCodeMetadata() {
  return (tree: CodeTree) => {
    const visit = (node: CodeTree) => {
      if (node.type === "code") {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            "data-code-info": [node.lang, node.meta].filter(Boolean).join(" "),
          },
        };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
