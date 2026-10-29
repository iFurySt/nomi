import type { CanvasHead } from "@nomi/core";
export function HeadShape({
  head,
  solidFill = "context-stroke",
}: {
  head: CanvasHead;
  solidFill?: string;
}) {
  switch (head) {
    case "none":
      return null;
    case "arrow":
      return <path d="M 5 3 L 12 8 L 5 13" fill="none" />;
    case "triangle":
    case "triangle-open":
      return (
        <path
          d="M 3 3 L 13 8 L 3 13 Z"
          fill={head === "triangle" ? solidFill : "var(--surface)"}
        />
      );
    case "diamond":
    case "diamond-open":
      return (
        <path
          d="M 2 8 L 7 4 L 12 8 L 7 12 Z"
          fill={head === "diamond" ? solidFill : "var(--surface)"}
        />
      );
    case "circle":
    case "circle-open":
      return (
        <circle
          cx="8"
          cy="8"
          r="4"
          fill={head === "circle" ? solidFill : "var(--surface)"}
        />
      );
    case "bar":
      return <path d="M 11 2 L 11 14" fill="none" />;
    case "cross":
      return <path d="M 5 3 L 12 13 M 5 13 L 12 3" fill="none" />;
    case "crowfoot":
      return <path d="M 4 8 L 12 2 M 4 8 L 12 8 M 4 8 L 12 14" fill="none" />;
    case "crowfoot-bar":
      return (
        <path
          d="M 1 2 L 1 14 M 4 8 L 12 2 M 4 8 L 12 8 M 4 8 L 12 14"
          fill="none"
        />
      );
    case "crowfoot-circle":
      return (
        <>
          <circle cx="3" cy="8" r="2.5" fill="var(--surface)" />
          <path d="M 6 8 L 13 2 M 6 8 L 13 8 M 6 8 L 13 14" fill="none" />
        </>
      );
    case "circle-bar":
      return (
        <>
          <circle cx="5" cy="8" r="3" fill="var(--surface)" />
          <path d="M 12 2 L 12 14" fill="none" />
        </>
      );
  }
}
export const headNames: Record<CanvasHead, string> = {
  none: "无标记",
  arrow: "开放箭头",
  triangle: "实心三角",
  "triangle-open": "空心三角",
  diamond: "实心菱形",
  "diamond-open": "空心菱形",
  circle: "实心圆",
  "circle-open": "空心圆",
  bar: "竖线",
  crowfoot: "鸦脚",
  "crowfoot-bar": "一对多",
  "crowfoot-circle": "零对多",
  "circle-bar": "零或一",
  cross: "交叉",
};
export function HeadIcon({
  head,
  start = false,
}: {
  head: CanvasHead;
  start?: boolean;
}) {
  return (
    <svg
      width="32"
      height="20"
      viewBox="0 0 32 20"
      aria-hidden="true"
      style={{ transform: start ? "scaleX(-1)" : undefined }}
    >
      <path
        d="M 2 10 H 27"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      <g
        transform="translate(15 2)"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <HeadShape head={head} solidFill="currentColor" />
      </g>
    </svg>
  );
}
