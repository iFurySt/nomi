import { useLayoutEffect, useRef } from "react";

/** Reveal an overflowing title once, retaining its tail until the row is left. */
export function useNoteTitleReveal(active: boolean, title: string) {
  const viewport = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = viewport.current,
      label = text.current,
      tools = actions.current;
    if (!frame || !label || !tools) return;
    let animation: Animation | undefined;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const reset = () => {
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }
      animation = undefined;
      delete frame.dataset.scrolledEnd;
      frame.removeAttribute("title");
      frame.style.removeProperty("--notes-title-available");
    };
    const measure = () => {
      reset();
      if (reduced.matches) frame.title = title;
      if (!active) return;
      const available = Math.max(
        0,
        Math.min(
          frame.clientWidth,
          tools.getBoundingClientRect().left -
            frame.getBoundingClientRect().left -
            4,
        ),
      );
      frame.style.setProperty("--notes-title-available", `${available}px`);
      const distance = Math.max(0, label.scrollWidth - available);
      if (!distance || reduced.matches) return;
      animation = label.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(-${distance}px)` },
        ],
        {
          delay: 500,
          duration: Math.max(800, (distance / 48) * 1000),
          easing: "linear",
          fill: "forwards",
          iterations: 1,
        },
      );
      animation.onfinish = () => {
        frame.dataset.scrolledEnd = "true";
      };
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(label);
    reduced.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", measure);
      reset();
    };
  }, [active, title]);
  return { viewport, text, actions };
}
