import { useMemo, useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import { parseInteractiveProgram, type InteractiveProgram } from "@nomi/core";
import { Tooltip } from "../components/Tooltip";
import { Modal } from "../components/primitives";

/** Authoring edits are separate from the learner's temporary input/progress. */
export function InteractiveTools({
  program,
  onApply,
}: {
  program: InteractiveProgram;
  onApply?: (program: InteractiveProgram) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const [base, setBase] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const serialized = useMemo(() => JSON.stringify(program, null, 2), [program]);
  return (
    <>
      <div
        className="interactive-author-tools"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Tooltip
          label={
            copyError ? "复制失败，请重试" : copied ? "已复制" : "复制交互块"
          }
        >
          <button
            className="icon-button"
            aria-label="复制交互块"
            onMouseLeave={() => setCopied(false)}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(serialized);
                setCopied(true);
                setCopyError(false);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </Tooltip>
        {onApply && (
          <Tooltip label="编辑 DSL">
            <button
              className="icon-button"
              aria-label="编辑 DSL"
              onClick={() => {
                setBase(serialized);
                setDraft(serialized);
                setError("");
              }}
            >
              <Code2 size={16} />
            </button>
          </Tooltip>
        )}
      </div>
      <Modal
        open={draft !== undefined}
        onOpenChange={(open) => {
          if (!open) setDraft(undefined);
        }}
        title="DSL"
        className="interactive-dsl-dialog"
        initialFocus="textarea"
      >
        <div
          className="interactive-dsl-editor"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Preserve native textarea undo/select-all; canvas shortcuts must not run.
            if (e.key !== "Escape") e.stopPropagation();
          }}
          onCopy={(e) => e.stopPropagation()}
          onPaste={(e) => e.stopPropagation()}
        >
          <textarea
            aria-label="交互块 DSL"
            value={draft ?? ""}
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
          />
          {error && <p role="alert">{error}</p>}
          <footer>
            <button
              className="button button-secondary"
              onClick={() => setDraft(undefined)}
            >
              取消
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                try {
                  if (serialized !== base)
                    throw Error("内容已更新，请关闭后重新编辑。");
                  if ((draft?.length ?? 0) > 2_000_000)
                    throw Error("DSL 内容过大。");
                  const next = parseInteractiveProgram(JSON.parse(draft ?? ""));
                  if (JSON.stringify(next) !== JSON.stringify(program))
                    onApply?.(next);
                  setDraft(undefined);
                } catch (e) {
                  setError(
                    e instanceof SyntaxError
                      ? "JSON 格式有误，请检查。"
                      : (e as Error).message,
                  );
                }
              }}
            >
              应用
            </button>
          </footer>
        </div>
      </Modal>
    </>
  );
}
