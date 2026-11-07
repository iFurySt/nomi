import { useRef, useState, type ReactNode } from "react";
import { Tooltip } from "../components/Tooltip";
import { normalizeCodeHeight } from "./codeMetadata";

/** Resize locally while dragging; commit one document change on release. */
export function CodeViewport({
  height,
  collapsed,
  onChange,
  children,
}: {
  height?: number | null;
  collapsed: boolean;
  onChange: (attrs: Record<string, unknown>) => void;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    y: number;
    height: number;
    next: number;
    moved: boolean;
    scale: number;
  } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const fixedHeight = normalizeCodeHeight(height);
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  return (
    <>
      <div
        ref={viewport}
        className="code-scroll"
        hidden={collapsed}
        style={{ height: preview ?? fixedHeight ?? undefined }}
      >
        {children}
      </div>
      {!collapsed && (
        <Tooltip label="拖动调整高度 · 双击自适应" disabled={preview !== null}>
          <button
            type="button"
            contentEditable={false}
            className="code-resize-handle"
            aria-label="调整代码块高度"
            data-resizing={preview !== null || undefined}
            onPointerDown={(event) => {
              if (event.button !== 0 || !viewport.current) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus({ preventScroll: true });
              event.currentTarget.setPointerCapture(event.pointerId);
              const height = viewport.current.offsetHeight;
              const scale =
                viewport.current.getBoundingClientRect().height / height || 1;
              drag.current = {
                y: event.clientY,
                height,
                next: height,
                scale,
                moved: false,
              };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (!active) return;
              event.preventDefault();
              if (Math.abs(event.clientY - active.y) < 3 && !active.moved)
                return;
              active.moved = true;
              active.next =
                normalizeCodeHeight(
                  active.height + (event.clientY - active.y) / active.scale,
                ) ?? 80;
              setPreview(active.next);
            }}
            onPointerUp={(event) => {
              const active = drag.current;
              cancel();
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              if (active?.moved) onChange({ height: active.next });
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
            onDoubleClick={() => onChange({ height: null })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancel();
              }
              if (["ArrowUp", "ArrowDown", "Home"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Home") onChange({ height: null });
                else
                  onChange({
                    height: normalizeCodeHeight(
                      (fixedHeight ?? viewport.current?.clientHeight ?? 80) +
                        (event.key === "ArrowUp" ? -20 : 20),
                    ),
                  });
              }
            }}
          >
            <span />
          </button>
        </Tooltip>
      )}
    </>
  );
}
