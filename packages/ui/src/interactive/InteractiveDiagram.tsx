import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { diagramLayers, type DiagramEdge } from "@nomi/core";
import "./diagram.css";

type Bounds = { width: number; height: number; paths: string[] };
export function InteractiveDiagram({
  id,
  label,
  children: ids,
  edges,
  renderNode,
}: {
  id: string;
  label: string;
  children: string[];
  edges: DiagramEdge[];
  renderNode: (id: string) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const marker = useId().replaceAll(":", "");
  const topology = JSON.stringify([ids, edges]);
  const layers = useMemo(() => diagramLayers(ids, edges), [topology]);
  const [bounds, setBounds] = useState<Bounds>({
    width: 1,
    height: 1,
    paths: [],
  });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const outer = el.getBoundingClientRect();
      const nodes = new Map(
        [
          ...el.querySelectorAll<HTMLElement>(
            ":scope > .interactive-diagram-layer > [data-diagram-node]",
          ),
        ].map((n) => [n.dataset.diagramNode!, n.getBoundingClientRect()]),
      );
      const rank = new Map(
        layers.flatMap((layer, index) =>
          layer.map((id) => [id, index] as const),
        ),
      );
      const paths = edges.map((edge) => {
        const a = nodes.get(edge.from),
          b = nodes.get(edge.to);
        if (!a || !b) return "";
        const x = a.left + a.width / 2 - outer.left,
          y = a.bottom - outer.top;
        const x2 = b.left + b.width / 2 - outer.left,
          y2 = b.top - outer.top;
        if (rank.get(edge.to)! - rank.get(edge.from)! > 1) {
          const lane = outer.width - 7;
          return `M ${x} ${y} V ${y + 14} H ${lane} V ${y2 - 14} H ${x2} V ${y2 - 3}`;
        }
        const mid = (y + y2) / 2;
        return `M ${x} ${y} V ${mid} H ${x2} V ${y2 - 3}`;
      });
      const next = { width: outer.width, height: outer.height, paths };
      setBounds((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const node of el.querySelectorAll<HTMLElement>("[data-diagram-node]"))
      observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [topology, layers]);
  return (
    <div
      className="interactive-diagram-scroll"
      data-node={id}
      role="group"
      aria-label={label}
    >
      <div
        className="interactive-diagram"
        ref={root}
        style={{
          minWidth: Math.max(
            280,
            ...layers.map((layer) => layer.length * 140 + 32),
          ),
        }}
      >
        <svg
          className="interactive-diagram-edges"
          width={bounds.width}
          height={bounds.height}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path
                d="M 1 1 L 7 4 L 1 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </marker>
          </defs>
          {bounds.paths.map((d, i) => (
            <path
              key={`${edges[i].from}-${edges[i].to}`}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
              markerEnd={`url(#${marker})`}
            />
          ))}
        </svg>
        {layers.map((layer, i) => (
          <div
            key={i}
            className="interactive-diagram-layer"
            style={{
              gridTemplateColumns: `repeat(${layer.length}, minmax(0, 1fr))`,
            }}
          >
            {layer.map((child) => (
              <div
                key={child}
                className="interactive-diagram-node"
                data-diagram-node={child}
              >
                {renderNode(child)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
