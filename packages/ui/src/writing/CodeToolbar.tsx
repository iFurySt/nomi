import { useEffect, useState, useRef } from "react";
import { ChevronDown, ChevronRight, WrapText } from "lucide-react";
import { Select } from "../components/Select";
import { codeHighlight } from "./highlight";
import { CodeCopy } from "./CodeCopy";
import "./code.css";

const names: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  xml: "HTML / XML",
  json: "JSON",
  bash: "Bash",
  go: "Go",
  java: "Java",
  sql: "SQL",
  swift: "Swift",
  rust: "Rust",
  markdown: "Markdown",
  yaml: "YAML",
  plaintext: "Plain text",
};
const aliases: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  html: "xml",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
  text: "plaintext",
};
export function CodeToolbar({
  source,
  language,
  caption,
  wrap,
  collapsed,
  onChange,
  readOnlyCaption = false,
}: {
  source: string;
  readOnlyCaption?: boolean;
  language?: string | null;
  caption: string;
  wrap: boolean;
  collapsed: boolean;
  onChange: (attrs: Record<string, unknown>) => void;
}) {
  const cancelCaption = useRef(false);
  const [draft, setDraft] = useState(caption);
  const [editingCaption, setEditingCaption] = useState(false);
  useEffect(() => setDraft(caption), [caption]);
  const value = aliases[language ?? ""] ?? language ?? "";
  const options = [
    { value: "", label: "Auto" },
    ...[
      ...new Set([
        "plaintext",
        ...codeHighlight.listLanguages(),
        ...(value ? [value] : []),
      ]),
    ].map((value) => ({
      value,
      label: names[value] ?? value,
      keywords: value,
    })),
  ];
  return (
    <div className="code-toolbar" contentEditable={false}>
      <button
        type="button"
        className="code-tool code-fold"
        aria-label={collapsed ? "展开代码" : "折叠代码"}
        aria-expanded={!collapsed}
        onClick={() => onChange({ collapsed: !collapsed })}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
      </button>
      <input
        className="code-caption"
        aria-label="代码块说明"
        placeholder={editingCaption ? "代码块名称" : "Code block"}
        onFocus={() => setEditingCaption(true)}
        value={draft}
        readOnly={readOnlyCaption}
        tabIndex={readOnlyCaption ? -1 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditingCaption(false);
          if (cancelCaption.current) {
            cancelCaption.current = false;
            return;
          }
          if (draft !== caption) onChange({ caption: draft });
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (!e.nativeEvent.isComposing && e.key === "Enter")
            e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelCaption.current = true;
            setDraft(caption);
            e.currentTarget.blur();
          }
        }}
      />
      <Select
        className="code-language"
        label="代码语言"
        value={value}
        options={options}
        searchable
        variant="subtle"
        onValueChange={(language) => onChange({ language: language || null })}
      />
      <span className="code-tool-divider" />
      <button
        type="button"
        className="code-tool"
        aria-label="代码自动换行"
        title="自动换行"
        aria-pressed={wrap}
        onClick={() => onChange({ wrap: !wrap })}
      >
        <WrapText size={16} />
      </button>
      <span className="code-tool-divider" />
      <CodeCopy source={source} />
    </div>
  );
}
/** Same text metrics as the editable code, including wrapped logical lines. */
export function CodeGutter({ source }: { source: string }) {
  return (
    <div className="code-gutter" aria-hidden="true" contentEditable={false}>
      {source.split("\n").map((line, i) => (
        <div className="code-gutter-line" key={i} data-line={i + 1}>
          {line || "\u200b"}
        </div>
      ))}
    </div>
  );
}
