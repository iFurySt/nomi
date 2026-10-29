import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CANVAS_HEADS,
  canvasConnectorGeometry,
  type CanvasConnector,
  type CanvasHead,
  type CanvasRect,
  type CanvasCamera,
} from "@nomi/core";
import {
  ChevronDown,
  Repeat2,
  MoreHorizontal,
  Type,
  Plus,
  Lock,
  Unlock,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
} from "lucide-react";
import { useCanvasPopover } from "./useCanvasPopover";
import { HeadIcon, headNames } from "./ConnectorSymbols";
const colors = [
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
export type ConnectorAction =
  | "copy"
  | "copy-image"
  | "paste"
  | "duplicate"
  | "copy-style"
  | "paste-style"
  | "rotate"
  | "delete"
  | "front"
  | "back"
  | "forward"
  | "backward";
export function ConnectorToolbar({
  connector: c,
  rectangles,
  camera,
  viewportWidth,
  viewportHeight,
  onChange,
  onAction,
  endGroup,
  editLabel,
  onEditLabel,
  hasStyle,
}: {
  connector: CanvasConnector;
  rectangles: CanvasRect[];
  camera: CanvasCamera;
  viewportWidth: number;
  viewportHeight: number;
  onChange: (patch: Partial<CanvasConnector>, group?: string) => void;
  onAction: (action: ConnectorAction) => void;
  endGroup: () => void;
  editLabel: boolean;
  onEditLabel: (editing: boolean) => void;
  hasStyle: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 420, height: 46 }),
    [panel, setPanel] = useState<string | null>(null),
    [moreHeads, setMoreHeads] = useState(false),
    [textTools, setTextTools] = useState(!!c.label),
    [layer, setLayer] = useState(false),
    [error, setError] = useState("");
  const popover = useCanvasPopover(
    panel,
    root,
    panel === "start" || panel === "end" ? 128 : panel === "more" ? 208 : 224,
    () => setPanel(null),
  );
  const path = canvasConnectorGeometry(c, rectangles)!;
  const xs = path.points.map((p) => p.x * camera.zoom + camera.x),
    ys = path.points.map((p) => p.y * camera.zoom + camera.y);
  const anchorX = (Math.min(...xs) + Math.max(...xs)) / 2,
    anchorY = Math.max(...ys) + 18;
  const left = Math.max(
    12,
    Math.min(viewportWidth - size.width - 12, anchorX - size.width / 2),
  );
  const top = Math.max(
    100,
    Math.min(viewportHeight - size.height - 76, anchorY),
  );
  const ls = c.labelStyle ?? {},
    changeLabel = (patch: NonNullable<CanvasConnector["labelStyle"]>) =>
      onChange({ labelStyle: patch });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPanel(null);
    setError("");
    setTextTools(!!c.label);
  }, [c.id]);
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
  useEffect(
    () => setPanel(null),
    [camera.x, camera.y, camera.zoom, viewportWidth, viewportHeight],
  );
  const open = (name: string, element: HTMLElement) => {
    popover.keepOpen();
    if (panel === name) return;
    setMoreHeads(false);
    setLayer(false);
    popover.anchor.current = element;
    setPanel(name);
  };
  const toggle = (name: string, event: React.MouseEvent<HTMLElement>) => {
    // Mouse entry already opens the menu; its following click should keep it open.
    if (panel === name && event.detail === 0) setPanel(null);
    else open(name, event.currentTarget);
  };
  const trigger = (
    name: string,
    label: string,
    icon: React.ReactNode,
    chevron = true,
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={panel === name}
      aria-haspopup="dialog"
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") open(name, e.currentTarget);
      }}
      onPointerLeave={popover.leave}
      onClick={(e) => toggle(name, e)}
    >
      {icon}
      {chevron && <ChevronDown size={12} />}
    </button>
  );
  const action = (label: string, value: ConnectorAction, shortcut?: string) => (
    <button
      type="button"
      role="menuitem"
      disabled={value === "paste-style" && !hasStyle}
      onClick={() => {
        onAction(value);
        setPanel(null);
      }}
    >
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  const head = (end: "start" | "end") =>
    c[`${end}Head`] ?? (c[`${end}Arrow`] ? "arrow" : "none");
  const pickHead = (end: "start" | "end", value: CanvasHead) => {
    onChange({ [`${end}Head`]: value, [`${end}Arrow`]: value !== "none" });
    setPanel(null);
  };
  const palette = (text = false) => (
    <>
      <div className="connector-palette">
        {colors.map((color) => (
          <button
            key={color}
            aria-label={`${text ? "文字" : "线条"}颜色 ${color}`}
            title={color}
            aria-pressed={(text ? ls.color : c.color) === color}
            style={{ background: color }}
            onClick={() =>
              text ? changeLabel({ color }) : onChange({ color })
            }
          />
        ))}
        <label className="connector-custom-color" title="自定义颜色">
          <Plus size={16} />
          <input
            type="color"
            aria-label={text ? "自定义文字颜色" : "自定义连线颜色"}
            value={(text ? ls.color : c.color) ?? "#111111"}
            onChange={(e) =>
              text
                ? changeLabel({ color: e.target.value })
                : onChange({ color: e.target.value })
            }
          />
        </label>
      </div>
      {!text && (
        <label className="connector-opacity">
          不透明度 <span>{Math.round((c.opacity ?? 1) * 100)}%</span>
          <input
            type="range"
            aria-label="连线不透明度"
            min="0"
            max="100"
            value={Math.round((c.opacity ?? 1) * 100)}
            onChange={(e) =>
              onChange(
                { opacity: Number(e.target.value) / 100 },
                `connector-opacity:${c.id}`,
              )
            }
            onPointerUp={endGroup}
            onBlur={endGroup}
          />
        </label>
      )}
    </>
  );
  return (
    <>
      <div
        ref={root}
        className="connector-toolbar"
        aria-label="连接属性"
        role="toolbar"
        style={{ left, top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="connector-toolbar-row">
          {trigger(
            "start",
            "起点标记",
            <HeadIcon head={head("start")} start />,
          )}
          <button
            type="button"
            aria-label="交换箭头方向"
            title="交换箭头方向"
            onClick={() =>
              onChange({
                startHead: head("end"),
                endHead: head("start"),
                startArrow: head("end") !== "none",
                endArrow: head("start") !== "none",
              })
            }
          >
            <Repeat2 size={19} />
          </button>
          {trigger("end", "终点标记", <HeadIcon head={head("end")} />)}
          <i />
          {trigger(
            "color",
            "连线颜色与透明度",
            <span
              className="connector-color-ring"
              style={{ borderColor: c.color ?? "var(--text)" }}
            />,
          )}
          {trigger(
            "line",
            "线条设置",
            <svg width="24" height="22" viewBox="0 0 24 22" aria-hidden="true">
              <path
                d={
                  c.routing === "straight"
                    ? "M 3 18 L 21 4"
                    : c.routing === "curve"
                      ? "M 2 13 C 7 -3 17 25 22 8"
                      : c.routing === "rounded"
                        ? "M 2 18 H 8 Q 12 18 12 14 V 8 Q 12 4 16 4 H 22"
                        : "M 2 18 H 12 V 4 H 22"
                }
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
              />
            </svg>,
          )}
          <i />
          {!textTools && !editLabel ? (
            <button
              type="button"
              aria-label="添加连线文字"
              title="添加文字"
              onClick={() => {
                setTextTools(true);
                onEditLabel(true);
              }}
            >
              <Plus size={14} />
              <Type size={21} />
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="编辑连线文字"
                title="编辑文字"
                onClick={() => onEditLabel(!editLabel)}
              >
                <Type size={19} />
              </button>
              {trigger(
                "text-color",
                "文字颜色",
                <span
                  className="connector-text-color"
                  style={{ textDecorationColor: ls.color ?? "var(--text)" }}
                >
                  A
                </span>,
              )}
              <select
                aria-label="连线字号"
                value={ls.size ?? 14}
                onChange={(e) => changeLabel({ size: Number(e.target.value) })}
              >
                {[10, 12, 14, 16, 18, 20, 24, 32, 40, 48].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {trigger(
                "text",
                "文字格式",
                <span className="connector-text-format">A≡</span>,
              )}
            </>
          )}
          <i />
          {trigger(
            "more",
            c.locked ? "更多操作（已锁定）" : "更多操作",
            c.locked ? <Lock size={19} /> : <MoreHorizontal size={21} />,
            false,
          )}
        </div>
        {panel && (
          <div
            className={`connector-panel connector-panel-${panel}`}
            role="dialog"
            aria-label={
              {
                start: "起点标记选项",
                end: "终点标记选项",
                color: "连线颜色面板",
                line: "线条设置面板",
                text: "文字格式面板",
                "text-color": "文字颜色面板",
                more: "更多连线操作",
              }[panel]
            }
            {...popover.hover}
            ref={popover.content}
            style={popover.style}
          >
            {(panel === "start" || panel === "end") && (
              <>
                <div
                  className={
                    moreHeads ? "connector-head-grid" : "connector-head-list"
                  }
                >
                  {(moreHeads ? CANVAS_HEADS : CANVAS_HEADS.slice(0, 7)).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        title={headNames[value]}
                        aria-label={`${panel === "start" ? "起点" : "终点"} ${headNames[value]}`}
                        aria-pressed={head(panel) === value}
                        onClick={() => pickHead(panel, value)}
                      >
                        <HeadIcon head={value} start={panel === "start"} />
                        {head(panel) === value && <Check size={14} />}
                      </button>
                    ),
                  )}
                </div>
                {!moreHeads && (
                  <button
                    className="connector-more-heads"
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "touch") setMoreHeads(true);
                    }}
                    onClick={() => setMoreHeads(true)}
                  >
                    更多标记
                  </button>
                )}
              </>
            )}
            {panel === "color" && palette()}
            {panel === "text-color" && palette(true)}
            {panel === "line" && (
              <>
                <small>线条</small>
                <div className="connector-option-row">
                  {(["rounded", "elbow", "straight", "curve"] as const).map(
                    (value, i) => (
                      <button
                        type="button"
                        key={value}
                        aria-label={["圆角折线", "直角折线", "直线", "曲线"][i]}
                        title={["圆角折线", "直角折线", "直线", "曲线"][i]}
                        aria-pressed={c.routing === value}
                        onClick={() =>
                          onChange({ routing: value, waypoints: [] })
                        }
                      >
                        <svg width="24" height="22" viewBox="0 0 24 22">
                          <path
                            d={
                              [
                                "M 2 18 H 8 Q 12 18 12 14 V 8 Q 12 4 16 4 H 22",
                                "M 2 18 H 12 V 4 H 22",
                                "M 3 18 L 21 4",
                                "M 2 13 C 7 -3 17 25 22 8",
                              ][i]
                            }
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        </svg>
                      </button>
                    ),
                  )}
                </div>
                <div className="connector-option-row">
                  {(["solid", "dashed", "dotted"] as const).map((value, i) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={["实线", "虚线", "点线"][i]}
                      title={["实线", "虚线", "点线"][i]}
                      aria-pressed={c.style === value}
                      onClick={() => onChange({ style: value })}
                    >
                      <svg width="32" height="20">
                        <path
                          d="M 2 10 H 30"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={
                            i === 1 ? "5 4" : i === 2 ? "1 3" : undefined
                          }
                        />
                      </svg>
                    </button>
                  ))}
                </div>
                <div className="connector-option-row">
                  {[1, 2, 3, 4].map((width) => (
                    <button
                      key={width}
                      type="button"
                      aria-label={`线宽 ${width}`}
                      title={`${width} px`}
                      aria-pressed={(c.width ?? 2) === width}
                      onClick={() => onChange({ width })}
                    >
                      <span
                        className="connector-weight-dot"
                        style={{ width: width * 2 + 2, height: width * 2 + 2 }}
                      />
                    </button>
                  ))}
                </div>
                <button
                  className="connector-line-jumps"
                  aria-label="跨线跳线"
                  aria-pressed={!!c.lineJumps}
                  onClick={() => onChange({ lineJumps: !c.lineJumps })}
                >
                  <span>⌒</span> 跨线跳线 {c.lineJumps && <Check size={14} />}
                </button>
              </>
            )}
            {panel === "text" && (
              <>
                <div className="connector-option-row">
                  {(
                    [
                      ["bold", "粗体", Bold],
                      ["strike", "删除线", Strikethrough],
                      ["underline", "下划线", Underline],
                      ["italic", "斜体", Italic],
                    ] as const
                  ).map(([field, label, Icon]) => (
                    <button
                      key={field}
                      type="button"
                      aria-label={label}
                      title={label}
                      aria-pressed={!!ls[field]}
                      onClick={() => changeLabel({ [field]: !ls[field] })}
                    >
                      <Icon size={19} />
                    </button>
                  ))}
                </div>
                <div className="connector-option-row">
                  {(
                    [
                      ["left", "左对齐", AlignLeft],
                      ["center", "居中", AlignCenter],
                      ["right", "右对齐", AlignRight],
                    ] as const
                  ).map(([align, label, Icon]) => (
                    <button
                      key={align}
                      type="button"
                      aria-label={label}
                      title={label}
                      aria-pressed={(ls.align ?? "center") === align}
                      onClick={() => changeLabel({ align })}
                    >
                      <Icon size={19} />
                    </button>
                  ))}
                </div>
                <label className="connector-link">
                  <Link size={16} />
                  <input
                    aria-label="连线文字链接"
                    placeholder="https://"
                    defaultValue={ls.link ?? ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const link = e.target.value.trim();
                      if (link && !/^https?:\/\/[^\s]+$/.test(link)) {
                        setError("请输入 HTTP / HTTPS 链接");
                        return;
                      }
                      setError("");
                      changeLabel({ link });
                    }}
                  />
                </label>
                {error && <small role="alert">{error}</small>}
              </>
            )}
            {panel === "more" && (
              <div className="connector-menu" role="menu">
                {action("复制", "copy", "⌘ C")}
                {action("复制为图片", "copy-image", "⌘ ⇧ C")}
                {action("粘贴", "paste", "⌘ V")}
                {action("创建副本", "duplicate", "⌘ D")}
                <hr />
                <button
                  role="menuitem"
                  aria-expanded={layer}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch") setLayer(true);
                  }}
                  onClick={() => setLayer(!layer)}
                >
                  层级 <span>›</span>
                </button>
                {layer && (
                  <div className="connector-layer-menu">
                    {action("上移一层", "forward")}
                    {action("下移一层", "backward")}
                    {action("置于顶层", "front")}
                    {action("置于底层", "back")}
                  </div>
                )}
                <hr />
                {action("复制样式", "copy-style", "⌘ ⌥ C")}
                {action("粘贴样式", "paste-style", "⌘ ⌥ V")}
                <hr />
                {action("旋转 90°", "rotate")}
                <button
                  role="menuitem"
                  onClick={() => {
                    onChange({ locked: !c.locked });
                    setPanel(null);
                  }}
                >
                  {c.locked ? <Unlock size={15} /> : <Lock size={15} />}{" "}
                  {c.locked ? "解锁" : "锁定"} <kbd>⌘ ⇧ L</kbd>
                </button>
                <hr />
                {action("删除", "delete", "⌫")}
              </div>
            )}
          </div>
        )}
      </div>
      {editLabel && (
        <input
          className="connector-label-editor"
          aria-label="连接文字"
          placeholder="添加文字"
          maxLength={200}
          value={c.label}
          autoFocus
          style={{
            left: Math.max(
              12,
              Math.min(
                viewportWidth - 192,
                path.label.x * camera.zoom + camera.x - 90,
              ),
            ),
            top: Math.max(
              12,
              Math.min(
                viewportHeight - 50,
                path.label.y * camera.zoom + camera.y - 18,
              ),
            ),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) =>
            onChange({ label: e.target.value }, `connector-label:${c.id}`)
          }
          onBlur={() => {
            endGroup();
            onEditLabel(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" || e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </>
  );
}
