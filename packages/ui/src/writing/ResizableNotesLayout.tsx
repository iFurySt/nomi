import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
export function ResizableNotesLayout({
  profile,
  children,
}: {
  profile: string;
  children: ReactNode;
}) {
  const key = `nomi:notes:${profile}:library-width`;
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return Number.isFinite(saved) && saved >= MIN_WIDTH
        ? Math.min(MAX_WIDTH, saved)
        : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const [available, setAvailable] = useState(MAX_WIDTH);
  const [resizing, setResizing] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { x: number; width: number; preference: number; currentWidth: number }
    | undefined
  >(undefined);
  const clamp = (value: number) =>
    Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available, value)));
  const save = (value: number) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Layout remains usable without storage. */
    }
  };
  // Persist the view as it changes as well as on release: focus loss or app
  // shutdown must not discard an already visible width. Cancellation restores
  // the original preference through the same state path.
  useEffect(() => {
    save(width);
  }, [key, width]);
  useEffect(() => {
    const element = frame.current!;
    const resize = new ResizeObserver(() =>
      setAvailable(Math.max(MIN_WIDTH, element.clientWidth - 360)),
    );
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  const shown = clamp(width);
  return (
    <div
      ref={frame}
      className="notes-workspace"
      data-resizing={resizing || undefined}
      style={{ "--notes-library-width": `${shown}px` } as CSSProperties}
    >
      {children}
      <div
        role="separator"
        aria-label="调整文稿列表宽度"
        aria-orientation="vertical"
        tabIndex={0}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={Math.min(MAX_WIDTH, available)}
        aria-valuenow={shown}
        className="notes-library-resizer"
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH);
          save(DEFAULT_WIDTH);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = {
            x: event.clientX,
            width: shown,
            preference: width,
            currentWidth: shown,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizing(true);
        }}
        onPointerMove={(event) => {
          if (drag.current) {
            const next = clamp(
              drag.current.width + event.clientX - drag.current.x,
            );
            drag.current.currentWidth = next;
            setWidth(next);
          }
        }}
        onPointerUp={(event) => {
          if (!drag.current) return;
          const next = clamp(
            drag.current.width + event.clientX - drag.current.x,
          );
          drag.current = undefined;
          setWidth(next);
          save(next);
          setResizing(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          if (drag.current) setWidth(drag.current.preference);
          drag.current = undefined;
          setResizing(false);
        }}
        onLostPointerCapture={() => {
          if (drag.current) {
            setWidth(drag.current.currentWidth);
            save(drag.current.currentWidth);
          }
          drag.current = undefined;
          setResizing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && drag.current) {
            setWidth(drag.current.preference);
            drag.current = undefined;
            setResizing(false);
            event.preventDefault();
            return;
          }
          const next =
            event.key === "ArrowLeft"
              ? shown - 16
              : event.key === "ArrowRight"
                ? shown + 16
                : event.key === "Home"
                  ? MIN_WIDTH
                  : event.key === "End"
                    ? available
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            setWidth(clamp(next));
            save(clamp(next));
          }
        }}
      />
    </div>
  );
}
