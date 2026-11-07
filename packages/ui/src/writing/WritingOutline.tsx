import { useEffect, useRef, useState, type RefObject } from "react";
import { ListTree, Pin } from "lucide-react";

type Heading = { element: HTMLElement; text: string; level: number };
const preference = "nomi.notes.outline-pinned.v1";
export function WritingOutline({
  scroll,
  noteId,
}: {
  scroll: RefObject<HTMLDivElement | null>;
  noteId: string;
}) {
  const root = useRef<HTMLElement>(null),
    nav = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[]>([]),
    [active, setActive] = useState(0);
  const [open, setOpen] = useState(false),
    [marginWidth, setMarginWidth] = useState(0);
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(preference) === "true";
    } catch {
      return false;
    }
  });
  const wide = marginWidth >= 120;
  const fixed = pinned && wide,
    expanded = fixed || open;
  useEffect(() => {
    const pane = scroll.current;
    if (!pane) return;
    let frame = 0,
      entries: Heading[] = [];
    setOpen(false);
    const track = () => {
      const ceiling = pane.getBoundingClientRect().top + 72;
      let index = 0;
      entries.forEach((heading, i) => {
        if (heading.element.getBoundingClientRect().top <= ceiling) index = i;
      });
      // The final section may be too short to reach the reading line.
      const last = entries.at(-1);
      if (
        last &&
        pane.scrollTop > 0 &&
        pane.scrollHeight - pane.clientHeight - pane.scrollTop <= 2 &&
        last.element.getBoundingClientRect().top <
          pane.getBoundingClientRect().bottom
      )
        index = entries.length - 1;
      setActive(index);
    };
    const scan = () => {
      entries = [
        ...pane.querySelectorAll<HTMLElement>(
          ".tiptap h1,.tiptap h2,.tiptap h3,.writing-protected h1,.writing-protected h2,.writing-protected h3",
        ),
      ]
        .filter((heading) => heading.textContent?.trim())
        .map((element) => ({
          element,
          text: element.textContent!.trim(),
          level: Number(element.tagName[1]),
        }));
      setHeadings((previous) =>
        previous.length === entries.length &&
        previous.every(
          (heading, i) =>
            heading.element === entries[i].element &&
            heading.text === entries[i].text &&
            heading.level === entries[i].level,
        )
          ? previous
          : entries,
      );
      track();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(pane, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    const measure = () => {
      const article = pane.querySelector<HTMLElement>(".writing-article");
      if (!article) return;
      // Share the existing left margin, leaving the writing block handles clear.
      const style = getComputedStyle(article);
      const contentLeft =
        article.getBoundingClientRect().left + parseFloat(style.paddingLeft);
      setMarginWidth(
        Math.max(
          0,
          Math.min(220, contentLeft - pane.getBoundingClientRect().left - 76),
        ),
      );
      schedule();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(pane.parentElement!);
    resize.observe(pane);
    const article = pane.querySelector<HTMLElement>(".writing-article");
    if (article) resize.observe(article);
    measure();
    pane.addEventListener("scroll", track, { passive: true });
    scan();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      pane.removeEventListener("scroll", track);
    };
  }, [noteId, scroll]);
  useEffect(() => {
    if (!expanded || !nav.current) return;
    const current = nav.current.querySelector<HTMLElement>(
      '[aria-current="location"]',
    );
    if (!current) return;
    const panel = nav.current.getBoundingClientRect(),
      item = current.getBoundingClientRect();
    if (item.top < panel.top) nav.current.scrollTop -= panel.top - item.top;
    else if (item.bottom > panel.bottom)
      nav.current.scrollTop += item.bottom - panel.bottom;
  }, [active, expanded]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  if (!headings.length) return null;
  const topLevel = Math.min(...headings.map((heading) => heading.level));
  const jump = (heading: Heading) => {
    const pane = scroll.current;
    if (!pane) return;
    pane.scrollTo({
      top:
        pane.scrollTop +
        heading.element.getBoundingClientRect().top -
        pane.getBoundingClientRect().top -
        48,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const first = Math.max(0, Math.min(active - 5, headings.length - 12));
  return (
    <aside
      ref={root}
      className="writing-outline"
      aria-label="文稿目录"
      data-expanded={expanded || undefined}
      data-pinned={fixed || undefined}
      style={fixed ? { width: marginWidth } : undefined}
      onPointerEnter={(event) => event.pointerType !== "touch" && setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (!fixed)
            root.current
              ?.querySelector<HTMLButtonElement>(".writing-outline-rail")
              ?.focus();
          setOpen(false);
        }
      }}
    >
      <button
        className="writing-outline-rail"
        aria-label="展开目录"
        title="目录"
        aria-expanded={expanded}
        onClick={() => setOpen(true)}
      >
        {headings.slice(first, first + 12).map((heading, i) => (
          <span
            key={first + i}
            data-level={heading.level}
            data-depth={heading.level - topLevel}
            data-active={active === first + i || undefined}
          />
        ))}
      </button>
      {expanded && (
        <div className="writing-outline-panel">
          <header>
            <ListTree size={16} aria-hidden="true" />
            {wide && (
              <button
                aria-label={fixed ? "取消固定目录" : "固定目录"}
                title={fixed ? "取消固定" : "固定目录"}
                aria-pressed={fixed}
                onClick={() => {
                  const value = !pinned;
                  setPinned(value);
                  try {
                    localStorage.setItem(preference, String(value));
                  } catch {
                    /* optional view preference */
                  }
                }}
              >
                <Pin size={15} fill={fixed ? "currentColor" : "none"} />
              </button>
            )}
          </header>
          <div ref={nav} role="navigation" aria-label="章节">
            {headings.map((heading, index) => (
              <button
                key={index}
                data-level={heading.level}
                data-depth={heading.level - topLevel}
                aria-current={active === index ? "location" : undefined}
                title={heading.text}
                onClick={() => jump(heading)}
              >
                {heading.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
