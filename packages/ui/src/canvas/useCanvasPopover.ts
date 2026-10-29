import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type PointerEvent,
} from "react";

/** Screen-space menus stay attached to their toolbar even as content changes. */
export function useCanvasPopover(
  panel: string | null,
  toolbar: RefObject<HTMLDivElement | null>,
  width: number,
  close: () => void,
) {
  const anchor = useRef<HTMLElement | null>(null),
    content = useRef<HTMLDivElement | null>(null),
    [position, setPosition] = useState<CSSProperties>({});
  const closeRef = useRef(close),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  closeRef.current = close;
  const keepOpen = () => {
    clearTimeout(timer.current);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    keepOpen();
    timer.current = setTimeout(() => {
      if (!content.current?.contains(document.activeElement))
        closeRef.current();
    }, 180);
  };
  useEffect(() => () => clearTimeout(timer.current), [panel]);
  useLayoutEffect(() => {
    const el = content.current,
      trigger = anchor.current,
      bar = toolbar.current;
    if (!panel || !el || !trigger || !bar) return;
    const place = () => {
      const r = trigger.getBoundingClientRect(),
        b = bar.getBoundingClientRect(),
        edge = 12,
        gap = 6,
        below = Math.max(0, innerHeight - edge - b.bottom - gap),
        above = Math.max(0, b.top - edge - gap),
        natural = el.scrollHeight + el.offsetHeight - el.clientHeight,
        up = natural > below && above > below,
        maxHeight = up ? above : below,
        height = Math.min(natural, maxHeight),
        actualWidth = el.getBoundingClientRect().width;
      const next: CSSProperties = {
        left: Math.max(
          edge,
          Math.min(
            innerWidth - actualWidth - edge,
            r.x + r.width / 2 - actualWidth / 2,
          ),
        ),
        top: up ? b.top - gap - height : b.bottom + gap,
        maxHeight,
      };
      setPosition((old) =>
        old.left === next.left &&
        old.top === next.top &&
        old.maxHeight === next.maxHeight
          ? old
          : next,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    observer.observe(bar);
    bar.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      bar.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [panel, toolbar, width]);
  return {
    anchor,
    content,
    keepOpen,
    leave,
    hover: { onPointerEnter: keepOpen, onPointerLeave: leave },
    style: {
      position: "fixed",
      width,
      maxWidth: "calc(100vw - 24px)",
      ...position,
    } as CSSProperties,
  };
}
