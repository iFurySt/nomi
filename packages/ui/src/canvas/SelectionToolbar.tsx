import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CANVAS_SHAPES,
  canvasShapeNames,
  canvasSelectionBounds,
  type CanvasRect,
  type CanvasBlock,
  type CanvasShapeStyle,
  type CanvasAlign,
  type CanvasCamera,
} from "@nomi/core";
import {
  ChevronDown,
  MoreHorizontal,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Group,
  Ungroup,
  Lock,
  Check,
  Plus,
  RotateCw,
} from "lucide-react";
import { useCanvasPopover } from "./useCanvasPopover";
import { ShapeGlyph } from "./ShapeGlyph";
export type SelectionAction =
  | "copy"
  | "copy-image"
  | "paste"
  | "duplicate"
  | "copy-style"
  | "paste-style"
  | "front"
  | "back"
  | "forward"
  | "backward"
  | "group"
  | "ungroup"
  | "lock"
  | "unlock"
  | "delete"
  | "flip-x"
  | "flip-y"
  | "rotate"
  | "section"
  | "edit";
const palette = [
  "#ffffff",
  "#e9ebef",
  "#e5e2ff",
  "#eef1fc",
  "#cdd7f4",
  "#d9f2e5",
  "#fff0c9",
  "#ffdddd",
  "#111111",
  "#aeb4bd",
  "#7956c5",
  "#4e72ce",
  "#4257a2",
  "#408c5b",
  "#d2ad4c",
  "#d84d4d",
];
const arrange: [CanvasAlign, string][] = [
  ["left", "左对齐"],
  ["center", "水平居中"],
  ["right", "右对齐"],
  ["top", "顶端对齐"],
  ["middle", "垂直居中"],
  ["bottom", "底端对齐"],
  ["horizontal", "水平等距分布"],
  ["vertical", "垂直等距分布"],
  ["same-width", "统一宽度"],
  ["same-height", "统一高度"],
];
export function SelectionToolbar({
  rects,
  blocks,
  camera,
  width,
  height,
  onStyle,
  onShape,
  onArrange,
  onAction,
  hasStyle,
  editable,
  onFilter,
  onEndGroup,
}: {
  rects: CanvasRect[];
  blocks: CanvasBlock[];
  camera: CanvasCamera;
  width: number;
  height: number;
  onStyle: (style: CanvasShapeStyle, group?: string) => void;
  onShape: (shape: (typeof CANVAS_SHAPES)[number]) => void;
  onArrange: (action: CanvasAlign) => void;
  onAction: (action: SelectionAction) => void;
  hasStyle: boolean;
  editable: boolean;
  onFilter: (type: string) => void;
  onEndGroup: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 300, height: 38 }),
    [panel, setPanel] = useState<string | null>(null),
    [textTools, setTextTools] = useState(false),
    [link, setLink] = useState("");
  const popover = useCanvasPopover(
    panel,
    root,
    panel === "more" ? 208 : 224,
    () => setPanel(null),
  );
  const shape = blocks.find((b) => b.type === "shape") as
      Extract<CanvasBlock, { type: "shape" }> | undefined,
    s = shape?.shapeStyle ?? {},
    t = s.text ?? {},
    locked = rects.some((r) => r.locked),
    grouped = rects.some((r) => r.group),
    bounds = canvasSelectionBounds(rects);
  const bottom = (bounds.y + bounds.height) * camera.zoom + camera.y,
    preferredTop =
      bottom + 42 + size.height <= height - 76
        ? bottom + 42
        : bounds.y * camera.zoom + camera.y - size.height - 42,
    top = Math.max(96, Math.min(height - size.height - 76, preferredTop)),
    left = Math.max(
      12,
      Math.min(
        width - size.width - 12,
        (bounds.x + bounds.width / 2) * camera.zoom + camera.x - size.width / 2,
      ),
    );
  useLayoutEffect(() => {
    if (!root.current) return;
    const measure = () =>
      setSize({
        width: root.current!.offsetWidth,
        height: root.current!.offsetHeight,
      });
    measure();
    const o = new ResizeObserver(measure);
    o.observe(root.current);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    setPanel(null);
  }, [
    rects.map((r) => r.id).join(","),
    camera.x,
    camera.y,
    camera.zoom,
    width,
    height,
  ]);
  useEffect(() => {
    if (!panel) return;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target))
        setPanel(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPanel(null);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [panel]);
  const open = (name: string, element: HTMLElement) => {
    if (locked && name !== "more") return;
    popover.keepOpen();
    if (panel === name) return;
    popover.anchor.current = element;
    setPanel(name);
    setLink(t.link ?? "");
  };
  const toggle = (name: string, event: React.MouseEvent<HTMLElement>) => {
    // Mouse entry already opens the menu; its following click should keep it open.
    if (panel === name && event.detail === 0) setPanel(null);
    else open(name, event.currentTarget);
  };
  const trigger = (name: string, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      disabled={locked && name !== "more"}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={panel === name}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") open(name, e.currentTarget);
      }}
      onPointerLeave={popover.leave}
      onClick={(e) => toggle(name, e)}
    >
      {icon}
      <ChevronDown size={10} />
    </button>
  );
  const text = (patch: NonNullable<CanvasShapeStyle["text"]>) =>
    onStyle({ text: patch });
  const action = (value: SelectionAction, label: string, shortcut?: string) => (
    <button
      type="button"
      role="menuitem"
      disabled={
        (value === "paste-style" && !hasStyle) ||
        (locked && !["unlock", "copy", "copy-image"].includes(value))
      }
      onClick={() => {
        onAction(value);
        setPanel(null);
      }}
    >
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  const colors = (field: "fill" | "stroke" | "text") => (
    <>
      <div className="connector-palette">
        {field !== "text" && (
          <button
            aria-label={field === "fill" ? "无填充" : "无边框"}
            className="color-none"
            onClick={() => onStyle({ [field]: "none" })}
          />
        )}{" "}
        {palette.map((color) => (
          <button
            key={color}
            title={color}
            aria-label={`${field === "fill" ? "填充" : field === "stroke" ? "边框" : "文字"}颜色 ${color}`}
            aria-pressed={(field === "text" ? t.color : s[field]) === color}
            style={{ background: color }}
            onClick={() =>
              field === "text" ? text({ color }) : onStyle({ [field]: color })
            }
          />
        ))}
        <label className="connector-custom-color">
          <Plus size={14} />
          <input
            aria-label={`自定义${field === "fill" ? "填充" : field === "stroke" ? "边框" : "文字"}颜色`}
            type="color"
            value={
              (field === "text" ? t.color : s[field])?.startsWith("#")
                ? field === "text"
                  ? t.color
                  : s[field]
                : "#111111"
            }
            onChange={(e) =>
              field === "text"
                ? text({ color: e.target.value })
                : onStyle({ [field]: e.target.value })
            }
          />
        </label>
      </div>
      {field !== "text" && (
        <label className="connector-opacity">
          不透明度
          <input
            aria-label={`${field === "fill" ? "填充" : "边框"}不透明度`}
            type="range"
            min="0"
            max="100"
            value={Math.round(
              (s[field === "fill" ? "fillOpacity" : "strokeOpacity"] ?? 1) *
                100,
            )}
            onChange={(e) =>
              onStyle(
                {
                  [field === "fill" ? "fillOpacity" : "strokeOpacity"]:
                    Number(e.target.value) / 100,
                },
                `shape-opacity:${field}`,
              )
            }
            onPointerUp={onEndGroup}
            onBlur={onEndGroup}
          />
          <span>
            {Math.round(
              (s[field === "fill" ? "fillOpacity" : "strokeOpacity"] ?? 1) *
                100,
            )}
            %
          </span>
        </label>
      )}
    </>
  );
  return (
    <div
      ref={root}
      className="connector-toolbar selection-toolbar"
      role="toolbar"
      aria-label={rects.length > 1 ? "多选属性" : "形状属性"}
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="connector-toolbar-row">
        {locked ? <Lock size={16} /> : null}
        {rects.length > 1 &&
          trigger(
            "filter",
            "筛选选区",
            <span className="selection-count">{rects.length}</span>,
          )}
        {shape && (
          <>
            {trigger(
              "shape",
              "切换形状",
              <svg viewBox="-8 -8 116 116" className="selection-shape-icon">
                {shape.shape === "text" ? (
                  <text
                    x="25"
                    y="75"
                    fill="currentColor"
                    stroke="none"
                    fontSize="70"
                  >
                    T
                  </text>
                ) : (
                  <ShapeGlyph shape={shape.shape} />
                )}
              </svg>,
            )}
            <i />
            {trigger(
              "fill",
              "形状填充",
              <span
                className="selection-fill"
                style={{
                  background:
                    s.fill === "none" ? "transparent" : (s.fill ?? "#eef1fc"),
                }}
              />,
            )}
            {trigger(
              "stroke",
              "形状边框",
              <span
                className="connector-color-ring"
                style={{
                  borderColor:
                    s.stroke === "none"
                      ? "transparent"
                      : (s.stroke ?? "var(--text)"),
                }}
              />,
            )}
            <i />
            <button
              aria-label="形状文字格式"
              title="文字"
              disabled={locked}
              onClick={() => setTextTools(!textTools)}
            >
              <Type size={16} />
            </button>
            {textTools && (
              <>
                {trigger(
                  "text-color",
                  "形状文字颜色",
                  <span style={{ color: t.color }}>A</span>,
                )}
                <select
                  aria-label="形状字号"
                  disabled={locked}
                  value={t.size ?? 14}
                  onChange={(e) => text({ size: Number(e.target.value) })}
                >
                  {[10, 12, 14, 18, 24, 36, 48, 72, 96].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                {trigger(
                  "text",
                  "形状排版",
                  <>
                    <Type size={15} />
                    <AlignLeft size={12} />
                  </>,
                )}
              </>
            )}
          </>
        )}
        {rects.length > 1 && (
          <>
            <i />
            {trigger("align", "对齐与分布", <AlignCenter size={16} />)}
            <button
              aria-label={grouped ? "取消组合" : "组合对象"}
              title={grouped ? "取消组合" : "组合"}
              disabled={locked}
              onClick={() => onAction(grouped ? "ungroup" : "group")}
            >
              {grouped ? <Ungroup size={16} /> : <Group size={16} />}
            </button>
          </>
        )}
        {rects.length === 1 && !shape && editable && (
          <button aria-label="编辑所选内容" onClick={() => onAction("edit")}>
            <Type size={16} />
          </button>
        )}
        <i />
        {trigger("more", "对象更多操作", <MoreHorizontal size={16} />)}
      </div>
      {panel && (
        <div
          className={`connector-panel ${["more", "align", "filter"].includes(panel) ? "connector-menu" : ""}`}
          {...popover.hover}
          ref={popover.content}
          style={popover.style}
          role="dialog"
          aria-label={`对象${{ shape: "形状", fill: "填充", stroke: "边框", text: "排版", "text-color": "文字颜色", align: "对齐", more: "更多", filter: "筛选" }[panel]}面板`}
        >
          {panel === "shape" && (
            <div className="selection-shape-grid">
              {CANVAS_SHAPES.map((value) => (
                <button
                  key={value}
                  aria-label={`改为${canvasShapeNames[value]}`}
                  title={canvasShapeNames[value]}
                  aria-pressed={shape?.shape === value}
                  onClick={() => {
                    onShape(value);
                    setPanel(null);
                  }}
                >
                  <svg viewBox="-6 -6 112 112">
                    {value === "text" ? (
                      <text
                        x="25"
                        y="75"
                        fill="currentColor"
                        stroke="none"
                        fontSize="70"
                      >
                        T
                      </text>
                    ) : (
                      <ShapeGlyph shape={value} />
                    )}
                  </svg>
                </button>
              ))}
            </div>
          )}
          {panel === "fill" && colors("fill")}
          {panel === "stroke" && (
            <>
              <div className="connector-options">
                {(["solid", "dashed", "dotted"] as const).map((v, i) => (
                  <button
                    key={v}
                    aria-label={`边框${["实线", "虚线", "点线"][i]}`}
                    aria-pressed={(s.strokeStyle ?? "solid") === v}
                    onClick={() => onStyle({ strokeStyle: v })}
                  >
                    <svg viewBox="0 0 32 16">
                      <path
                        d="M2 8H30"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray={
                          v === "dashed"
                            ? "6 4"
                            : v === "dotted"
                              ? "1 4"
                              : undefined
                        }
                      />
                    </svg>
                  </button>
                ))}
              </div>
              <div className="connector-options">
                {[1, 2, 3, 4].map((v) => (
                  <button
                    key={v}
                    aria-label={`边框线宽 ${v}`}
                    aria-pressed={s.strokeWidth === v}
                    onClick={() => onStyle({ strokeWidth: v })}
                  >
                    <span
                      style={{
                        width: v + 2,
                        height: v + 2,
                        borderRadius: "50%",
                        background: "currentColor",
                      }}
                    />
                  </button>
                ))}
              </div>
              {colors("stroke")}
            </>
          )}
          {panel === "text-color" && colors("text")}
          {panel === "text" && (
            <>
              <div className="connector-options">
                {(["none", "number", "bullet", "quote"] as const).map(
                  (v, i) => (
                    <button
                      key={v}
                      aria-label={`形状${["普通文本", "有序列表", "无序列表", "引用"][i]}`}
                      aria-pressed={(t.list ?? "none") === v}
                      onClick={() => text({ list: v })}
                    >
                      {["T", "1.", "•", "❝"][i]}
                    </button>
                  ),
                )}
              </div>
              <div className="connector-options">
                {(
                  [
                    ["bold", Bold, "粗体"],
                    ["italic", Italic, "斜体"],
                    ["underline", Underline, "下划线"],
                    ["strike", Strikethrough, "删除线"],
                  ] as const
                ).map(([k, Icon, label]) => (
                  <button
                    key={k}
                    aria-label={`形状${label}`}
                    aria-pressed={!!t[k]}
                    onClick={() => text({ [k]: !t[k] })}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <div className="connector-options">
                {(["left", "center", "right"] as const).map((v, i) => {
                  const Icon = [AlignLeft, AlignCenter, AlignRight][i];
                  return (
                    <button
                      key={v}
                      aria-label={`文字${["左对齐", "居中", "右对齐"][i]}`}
                      aria-pressed={(t.align ?? "center") === v}
                      onClick={() => text({ align: v })}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
              <div className="connector-options">
                {(["top", "middle", "bottom"] as const).map((v, i) => (
                  <button
                    key={v}
                    aria-label={`文字${["顶端对齐", "垂直居中", "底端对齐"][i]}`}
                    aria-pressed={(t.verticalAlign ?? "middle") === v}
                    onClick={() => text({ verticalAlign: v })}
                  >
                    {["⇡", "↕", "⇣"][i]}
                  </button>
                ))}
              </div>
              <button
                className="connector-wide"
                aria-label="旋转形状文字"
                aria-pressed={!!t.rotate}
                onClick={() => text({ rotate: !t.rotate })}
              >
                <RotateCw size={14} />
                旋转文字
              </button>
              <label className="selection-link">
                链接
                <input
                  aria-label="形状文字链接"
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://"
                />
                <button
                  aria-label="应用形状链接"
                  onClick={() => {
                    const input = root.current?.querySelector<HTMLInputElement>(
                      '[aria-label="形状文字链接"]',
                    );
                    if (!link || /^https?:\/\/[^\s]+$/.test(link)) {
                      input?.setCustomValidity("");
                      text({ link });
                    } else {
                      input?.setCustomValidity("请输入 http 或 https 链接。");
                      input?.reportValidity();
                    }
                  }}
                >
                  <Check size={14} />
                </button>
              </label>
            </>
          )}
          {panel === "filter" &&
            [
              ["shape", "形状"],
              ["note", "笔记"],
              ["image", "图片"],
              ["file", "文件"],
              ["interactive", "交互块"],
            ].map(([type, label]) => {
              const count = rects.filter(
                (r) =>
                  (blocks.find((b) => b.id === r.content)?.type ?? "note") ===
                  type,
              ).length;
              return count > 0 ? (
                <button
                  key={type}
                  onClick={() => {
                    onFilter(type);
                    setPanel(null);
                  }}
                >
                  {label}
                  <kbd>{count}</kbd>
                </button>
              ) : null;
            })}
          {panel === "align" &&
            arrange.map(([v, label]) => (
              <button
                key={v}
                disabled={
                  locked ||
                  ((v === "horizontal" || v === "vertical") && rects.length < 3)
                }
                onClick={() => {
                  onArrange(v);
                  setPanel(null);
                }}
              >
                {label}
              </button>
            ))}
          {panel === "more" && (
            <>
              {action("copy", "复制", "⌘ C")}
              {blocks.every((b) => b.type === "shape") &&
                action("copy-image", "复制为图片", "⌘ ⇧ C")}
              {action("paste", "粘贴", "⌘ V")}
              {action("duplicate", "创建副本", "⌘ D")}
              <hr />
              {rects.length > 1 && (
                <>
                  {action(
                    grouped ? "ungroup" : "group",
                    grouped ? "取消组合" : "组合",
                    "⌘ G",
                  )}
                  {action("section", "创建分区")}
                  <hr />
                </>
              )}
              {action("forward", "上移一层")}
              {action("backward", "下移一层")}
              {action("front", "置于顶层")}
              {action("back", "置于底层")}
              <hr />
              {shape && (
                <>
                  {action("copy-style", "复制样式", "⌘ ⌥ C")}
                  {action("paste-style", "粘贴样式", "⌘ ⌥ V")}
                  {action("flip-x", "水平翻转", "⇧ H")}
                  {action("flip-y", "垂直翻转", "⇧ V")}
                  {action("rotate", "顺时针旋转 90°")}
                  <hr />
                </>
              )}
              {action(
                locked ? "unlock" : "lock",
                locked ? "解锁" : "锁定",
                "⌘ ⌥ L",
              )}
              {action("delete", "移出画布", "⌫")}
            </>
          )}
        </div>
      )}
    </div>
  );
}
