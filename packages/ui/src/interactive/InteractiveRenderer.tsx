import { useId, useMemo } from "react";
import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  evaluateProgram,
  validateResolvedProps,
  type InteractiveProgram,
  type StudyState,
  type Value,
  type PlotSeries,
  type PlotMarker,
  type PlotAxis,
} from "@nomi/core";
const colors = [
  "#169e83",
  "#548ed5",
  "#d68a33",
  "#9876bd",
  "#c77b96",
  "#619db0",
  "#85954c",
  "#a48b73",
];
function Formula({ source }: { source: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(source, {
        throwOnError: true,
        trust: false,
        strict: "error",
        maxExpand: 200,
        maxSize: 10,
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [source]);
  return html ? (
    <div
      className="learning-formula"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <pre className="learning-formula-error" role="status">
      {source}
    </pre>
  );
}
function Plot({
  series,
  markers,
  xAxis,
  yAxis,
  seriesLabels,
}: {
  series: PlotSeries[];
  markers: PlotMarker[];
  xAxis: PlotAxis;
  yAxis: PlotAxis;
  seriesLabels: string[];
}) {
  const clipId = useId();
  const width = 720,
    height = 390,
    left = 66,
    top = 20,
    right = 20,
    bottom = 48;
  const x = (n: number) =>
    left +
    ((n - xAxis.domain[0]) / (xAxis.domain[1] - xAxis.domain[0])) *
      (width - left - right);
  const y = (n: number) =>
    height -
    bottom -
    ((n - yAxis.domain[0]) / (yAxis.domain[1] - yAxis.domain[0])) *
      (height - top - bottom);
  const fmt = (n: number) =>
    yAxis.format === "percent" ? `${Math.round(n * 100)}%` : n.toFixed(2);
  const rows = markers.map((m) => ({
    label: seriesLabels[m.series] ?? `Series ${m.series + 1}`,
    x: m.x,
    y: m.y,
  }));
  return (
    <figure className="learning-plot">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${xAxis.label} → ${yAxis.label}`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={left}
              y={top}
              width={width - left - right}
              height={height - top - bottom}
            />
          </clipPath>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const n =
            yAxis.domain[0] + ((yAxis.domain[1] - yAxis.domain[0]) * i) / 4;
          return (
            <g key={`y${i}`}>
              <line
                className="learning-grid"
                x1={left}
                x2={width - right}
                y1={y(n)}
                y2={y(n)}
              />
              <text x={left - 14} y={y(n) + 5} textAnchor="end">
                {fmt(n)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const n =
            xAxis.domain[0] + ((xAxis.domain[1] - xAxis.domain[0]) * i) / 4;
          return (
            <g key={`x${i}`}>
              <line
                className="learning-grid"
                x1={x(n)}
                x2={x(n)}
                y1={top}
                y2={height - bottom}
              />
              <text x={x(n)} y={height - bottom + 27} textAnchor="middle">
                {Number(n.toFixed(2))}
              </text>
            </g>
          );
        })}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => (
            <path
              key={s.series}
              data-series={s.series}
              d={s.points
                .map(
                  (p, i) =>
                    `${i ? "L" : "M"}${x(p.x).toFixed(2)},${y(p.y).toFixed(2)}`,
                )
                .join(" ")}
              fill="none"
              stroke={colors[s.series]}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          {markers.map((m) => (
            <circle
              key={m.series}
              cx={x(m.x)}
              cy={y(m.y)}
              r={6}
              fill={colors[m.series]}
              stroke="var(--text)"
              strokeWidth={1.3}
            >
              <title>
                {seriesLabels[m.series]}: {fmt(m.y)}
              </title>
            </circle>
          ))}
        </g>
        <text x={left} y={14}>
          {yAxis.label}
        </text>
        <text x={width - right} y={height - 2} textAnchor="end">
          {xAxis.label}
        </text>
      </svg>
      <figcaption className="learning-legend">
        {rows.map((r, i) => (
          <span key={r.label}>
            <i style={{ background: colors[markers[i].series] }} />
            {r.label}
            <strong data-probability={markers[i].series}>
              {yAxis.format === "percent"
                ? `${(r.y * 100).toFixed(2)}%`
                : r.y.toFixed(2)}
            </strong>
          </span>
        ))}
      </figcaption>
      <details className="learning-values">
        <summary>查看数值</summary>
        <table>
          <thead>
            <tr>
              <th>序列</th>
              <th>{xAxis.label}</th>
              <th>{yAxis.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th>{r.label}</th>
                <td>{r.x}</td>
                <td>{fmt(r.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
export function InteractiveRenderer({
  program,
  state,
  onSet,
  onAction,
  onCommit,
}: {
  program: InteractiveProgram;
  state: StudyState;
  onSet: (id: string, value: Value) => void;
  onAction: (id: string) => void;
  onCommit: () => void;
}) {
  const prefix = useId();
  const output = useMemo(() => {
    try {
      const runtime = evaluateProgram(program, state);
      const props = new Map(
        program.nodes.map((n) => {
          const value = runtime.props(n.id);
          validateResolvedProps(n.component, value);
          return [n.id, value];
        }),
      );
      return { props, error: "" };
    } catch (e) {
      return {
        props: new Map<string, Record<string, unknown>>(),
        error: (e as Error).message,
      };
    }
  }, [program, state]);
  if (output.error)
    return (
      <div className="learning-alert" role="alert">
        计算未完成：{output.error}
      </div>
    );
  const node = (id: string): ReactNode => {
    const n = program.nodes.find((v) => v.id === id)!;
    const p = output.props.get(id)! as any;
    const binding = n.bind?.value;
    switch (n.component) {
      case "Panel":
        return (
          <section key={id} className="interactive-panel" data-node={id}>
            {p.children.map(node)}
          </section>
        );
      case "Row":
        return (
          <div key={id} className="interactive-row" data-node={id}>
            {p.children.map(node)}
          </div>
        );
      case "Text":
        return p.role === "heading" ? (
          <h2 key={id} data-node={id}>
            {p.text}
          </h2>
        ) : (
          <p key={id} data-node={id} className="interactive-text">
            {p.text}
          </p>
        );
      case "Button":
        return (
          <button
            key={id}
            className="learning-reset"
            data-node={id}
            onClick={() => n.on && onAction(n.on.activate)}
          >
            {p.label}
          </button>
        );
      case "SegmentedControl":
        return (
          <div
            key={id}
            className="learning-segmented"
            role="group"
            aria-label={p.label}
          >
            {p.options.map((o: { value: string; label: string }) => (
              <button
                key={o.value}
                aria-pressed={state[binding!] === o.value}
                onClick={() => {
                  onSet(binding!, o.value);
                  onCommit();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        );
      case "Slider":
        return (
          <div key={id} className="learning-slider" data-node={id}>
            <div>
              <label htmlFor={`${prefix}-${id}`}>{p.label}</label>
              <output htmlFor={`${prefix}-${id}`}>
                {Number(state[binding!]).toFixed(2)}
              </output>
            </div>
            <input
              id={`${prefix}-${id}`}
              aria-label={p.label}
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={Number(state[binding!])}
              onChange={(e) => onSet(binding!, Number(e.target.value))}
              onPointerUp={onCommit}
              onKeyUp={onCommit}
              onBlur={onCommit}
            />
            <div className="learning-marks">
              {p.marks?.map((m: { value: number; label: string }) => (
                <span key={m.value}>
                  {m.value.toFixed(1)} · {m.label}
                </span>
              ))}
            </div>
          </div>
        );
      case "Math":
        return <Formula key={id} source={p.source} />;
      case "Plot":
        return (
          <Plot
            key={id}
            series={p.series}
            markers={p.markers}
            xAxis={p.xAxis}
            yAxis={p.yAxis}
            seriesLabels={p.seriesLabels}
          />
        );
    }
  };
  return <div className="interactive-surface">{node(program.root)}</div>;
}
