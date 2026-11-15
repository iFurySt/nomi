import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Tooltip } from "../components/Tooltip";

interface Token {
  id: string;
  text: string;
  tone: string;
  members: string[];
  number?: number;
}
interface TokenRow {
  id: string;
  tokens: Token[];
}
interface Position {
  rect: DOMRect;
  text: string;
  members: string[];
}

/** Stable token identities allow host animation without changing the program's state. */
export function InteractiveTokenFlow({
  id,
  label,
  rows,
  layout,
  hint,
}: {
  id: string;
  label: string;
  rows: TokenRow[];
  layout: "words" | "chips" | "list";
  hint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, Position>());
  useLayoutEffect(() => {
    const root = ref.current!;
    const before = previous.current;
    const next = new Map<string, Position>();
    const animations: Animation[] = [];
    const ghosts: HTMLElement[] = [];
    let entrance = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of root.querySelectorAll<HTMLElement>("[data-token-key]")) {
      const key = el.dataset.tokenKey!;
      const members = JSON.parse(el.dataset.members!) as string[];
      const rect = el.getBoundingClientRect();
      next.set(key, { rect, members, text: el.textContent ?? "" });
      if (reduced) continue;
      const origin = root.getBoundingClientRect();
      const sources = [...before.values()].filter(
        (p) => p.members.length && p.members.every((m) => members.includes(m)),
      );
      if (layout === "words" && sources.length > 1) {
        for (const source of sources) {
          const ghost = document.createElement("span");
          ghost.className = "lesson-token lesson-token-ghost";
          ghost.setAttribute("aria-hidden", "true");
          ghost.textContent = source.text;
          Object.assign(ghost.style, {
            left: `${source.rect.left - origin.left}px`,
            top: `${source.rect.top - origin.top}px`,
            width: `${source.rect.width}px`,
            height: `${source.rect.height}px`,
          });
          root.append(ghost);
          ghosts.push(ghost);
          animations.push(
            ghost.animate(
              [
                { transform: "translate(0,0)", opacity: 1 },
                {
                  transform: `translate(${rect.left + rect.width / 2 - source.rect.left - source.rect.width / 2}px,${rect.top - source.rect.top}px) scale(.75)`,
                  opacity: 0,
                },
              ],
              { duration: 550, easing: "ease-in-out", fill: "forwards" },
            ),
          );
        }
        animations.push(
          el.animate(
            [
              { opacity: 0, transform: "scale(.85)" },
              { opacity: 0, offset: 0.5 },
              { opacity: 1, transform: "scale(1)" },
            ],
            { duration: 600 },
          ),
        );
      } else {
        const old = before.get(key);
        if (
          old &&
          (Math.abs(old.rect.left - rect.left) > 1 ||
            Math.abs(old.rect.top - rect.top) > 1)
        )
          animations.push(
            el.animate(
              [
                {
                  transform: `translate(${old.rect.left - rect.left}px,${old.rect.top - rect.top}px)`,
                },
                { transform: "translate(0,0)" },
              ],
              { duration: layout === "list" ? 580 : 450, easing: "ease-out" },
            ),
          );
        else if (!old && (before.size || el.dataset.tone === "accent"))
          animations.push(
            el.animate(
              [
                { opacity: 0, transform: "translateY(-8px)" },
                { opacity: 1, transform: "none" },
              ],
              {
                duration: 420,
                delay: Math.min(entrance++, 6) * 70,
                fill: "both",
                easing: "ease-out",
              },
            ),
          );
      }
    }
    previous.current = next;
    return () => {
      animations.forEach((a) => a.cancel());
      ghosts.forEach((g) => g.remove());
    };
  }, [rows, layout]);
  return (
    <section className="lesson-flow" data-node={id}>
      {label && (
        <div className="lesson-heading">
          <span>{label}</span>
          <small>{hint}</small>
        </div>
      )}
      <div ref={ref} className="lesson-tokens" data-layout={layout}>
        {rows.map((row, rowIndex) => (
          <div
            className="lesson-token-row"
            key={row.id}
            style={
              { "--lesson-order": Math.min(rowIndex, 20) } as CSSProperties
            }
          >
            {row.tokens.map((t) => (
              <span className="lesson-token-entry" key={t.id}>
                <Tooltip label={t.text}>
                  <span
                    className="lesson-token"
                    data-tone={t.tone}
                    data-token-key={`${row.id}/${t.id}`}
                    data-members={JSON.stringify(t.members)}
                  >
                    {t.text.replaceAll("</w>", "▁")}
                  </span>
                </Tooltip>
                {t.number !== undefined && (
                  <span className="lesson-token-id">{t.number}</span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
