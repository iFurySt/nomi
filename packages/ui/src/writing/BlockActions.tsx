import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Plus,
  Table2,
  Sigma,
  LayoutDashboard,
  GripVertical,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  Minus,
  ImagePlus,
  FlaskConical,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronRight,
  FileText,
  Shapes,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  Download,
  Check,
} from "lucide-react";
import type { MathAlignment } from "./mathSource";
import { textFormats, type TextFormat } from "./SelectionToolbar";
export type InsertKind =
  | "canvas"
  | "note-reference"
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "asset"
  | "experiment"
  | "table"
  | "formula";
export const blockChoices = [
  ["paragraph", "正文", Type],
  ["heading1", "标题 1", Heading1],
  ["heading2", "标题 2", Heading2],
  ["heading3", "标题 3", Heading3],
  ["bulletList", "项目列表", List],
  ["orderedList", "编号列表", ListOrdered],
  ["taskList", "待办事项", ListTodo],
  ["blockquote", "引用", Quote],
  ["codeBlock", "代码块", Code],
  ["horizontalRule", "分割线", Minus],
  ["table", "表格", Table2],
  ["formula", "公式", Sigma],
  ["note-reference", "文稿", FileText],
  ["canvas", "画布", LayoutDashboard],
  ["asset", "图片 / 附件", ImagePlus],
  ["experiment", "交互实验", FlaskConical],
] as const;
export function BlockActions({
  top = 0,
  kind = "paragraph",
  onConvert,
  onRemove,
  onInsert,
  onDragStart,
  onDragEnd,
  onMove,
  onOpenChange,
  empty = false,
  onFormat,
  onCanvas,
  tableActions,
  tableOutput,
  mathAlignment,
}: {
  empty?: boolean;
  onFormat?: (format: TextFormat) => void;
  onCanvas?: () => void;
  tableActions?: { label: string; run: () => void }[];
  tableOutput?: { copy: () => Promise<void>; download: () => void };
  mathAlignment?: {
    value: MathAlignment;
    change: (alignment: MathAlignment) => void;
  };
  top?: number;
  kind?: string;
  onConvert?: (kind: InsertKind) => void;
  onRemove: () => void;
  onInsert: (kind: InsertKind) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onMove: (direction: -1 | 1) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "error">();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closedByClick = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  const changeOpen = (value: boolean) => {
    cancel();
    setOpen(value);
    if (!value) setCopyState(undefined);
    onOpenChange?.(value);
  };
  const hover = (value: boolean) => {
    cancel();
    timer.current = setTimeout(() => changeOpen(value), value ? 140 : 240);
  };
  const leave = (event: PointerEvent) => {
    if (
      (event.relatedTarget as HTMLElement | null)?.closest?.(
        ".writing-block-gutter,.writing-block-menu,.writing-add-menu",
      )
    )
      return;
    hover(false);
  };
  const selected = blockChoices.find((c) => c[0] === kind);
  const Icon =
    selected?.[2] ??
    (kind === "blockMath"
      ? Sigma
      : kind === "image"
        ? ImagePlus
        : kind === "interactive"
          ? FlaskConical
          : kind === "shape"
            ? Shapes
            : FileText);
  const name =
    selected?.[1] ??
    ({
      image: "图片",
      interactive: "交互实验",
      file: "附件",
      shape: "画布文字",
      table: "表格",
      blockMath: "公式",
      markdown: "Markdown",
    }[kind] ||
      "内容块");
  const basic = blockChoices.filter(
    ([value]) =>
      ![
        "asset",
        "experiment",
        "table",
        "formula",
        "note-reference",
        "canvas",
      ].includes(value),
  );
  const common = blockChoices.filter(([value]) =>
    [
      "asset",
      "experiment",
      "table",
      "formula",
      "note-reference",
      "canvas",
    ].includes(value),
  );
  const insertChoices = (
    <>
      <DropdownMenu.Label className="writing-menu-label">
        基础
      </DropdownMenu.Label>
      <div className="writing-type-grid" role="group" aria-label="插入内容类型">
        {basic.map(([value, label, TypeIcon]) => (
          <DropdownMenu.Item
            key={value}
            className="writing-type-choice"
            title={label}
            aria-label={`插入${label}`}
            onSelect={() => onInsert(value)}
          >
            <TypeIcon size={19} />
          </DropdownMenu.Item>
        ))}
      </div>
      <DropdownMenu.Separator className="dropdown-separator" />
      <DropdownMenu.Label className="writing-menu-label">
        内容
      </DropdownMenu.Label>
      {common.map(([value, label, TypeIcon]) => (
        <DropdownMenu.Item
          key={value}
          className="dropdown-item"
          onSelect={() => onInsert(value)}
        >
          <TypeIcon size={15} />
          {label}
        </DropdownMenu.Item>
      ))}
    </>
  );
  const formats = onFormat && (
    <>
      <div
        className="writing-type-grid writing-mark-grid"
        role="group"
        aria-label="块文字样式"
      >
        {textFormats.map(([value, label, TypeIcon]) => (
          <DropdownMenu.Item
            key={value}
            className="writing-type-choice"
            aria-label={label}
            title={label}
            onSelect={() => onFormat(value)}
          >
            <TypeIcon size={17} />
          </DropdownMenu.Item>
        ))}
      </div>
    </>
  );
  return (
    <div
      className="writing-block-gutter"
      style={{ top }}
      data-open={open || undefined}
      onPointerLeave={leave}
    >
      <DropdownMenu.Root open={open} modal={false} onOpenChange={changeOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            onPointerEnter={(event) =>
              event.pointerType === "mouse" &&
              !closedByClick.current &&
              hover(true)
            }
            onPointerLeave={(event) => {
              closedByClick.current = false;
              leave(event);
            }}
            onPointerDown={(event) => {
              if (open) {
                event.preventDefault();
                closedByClick.current = true;
                changeOpen(false);
              }
            }}
            aria-label={empty ? "添加内容" : `${name}属性`}
            title={empty ? "添加内容" : `${name}属性`}
          >
            {empty ? <Plus size={18} /> : <Icon size={17} />}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="dropdown-menu writing-block-menu"
            side="bottom"
            align="start"
            sideOffset={5}
            collisionPadding={8}
            onPointerEnter={cancel}
            onPointerLeave={leave}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {empty ? (
              <>
                {insertChoices}
                {formats}
              </>
            ) : (
              <>
                <DropdownMenu.Label className="writing-menu-label">
                  {name}
                </DropdownMenu.Label>
                {mathAlignment && (
                  <div
                    className="writing-menu-icons"
                    role="group"
                    aria-label="公式对齐"
                  >
                    {(
                      [
                        ["left", "左对齐", AlignLeft],
                        ["center", "居中对齐", AlignCenter],
                        ["right", "右对齐", AlignRight],
                      ] as const
                    ).map(([value, label, AlignIcon]) => (
                      <DropdownMenu.Item
                        key={value}
                        className="writing-type-choice"
                        aria-label={label}
                        title={label}
                        data-active={mathAlignment.value === value || undefined}
                        onSelect={() => mathAlignment.change(value)}
                      >
                        <AlignIcon size={17} />
                      </DropdownMenu.Item>
                    ))}
                  </div>
                )}
                {tableOutput && (
                  <div
                    className="writing-menu-icons"
                    role="group"
                    aria-label="表格输出"
                  >
                    <DropdownMenu.Item
                      className="writing-type-choice"
                      aria-label="复制表格文本"
                      title={copyState === "copied" ? "已复制" : "复制表格文本"}
                      data-copied={copyState === "copied" || undefined}
                      onSelect={(event) => {
                        event.preventDefault();
                        void tableOutput
                          .copy()
                          .then(() => setCopyState("copied"))
                          .catch(() => setCopyState("error"));
                      }}
                    >
                      {copyState === "copied" ? (
                        <Check size={17} />
                      ) : (
                        <Copy size={17} />
                      )}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="writing-type-choice"
                      aria-label="下载 CSV"
                      title="下载 CSV"
                      onSelect={tableOutput.download}
                    >
                      <Download size={17} />
                    </DropdownMenu.Item>
                    {copyState === "error" && (
                      <small role="status">复制失败，请重试</small>
                    )}
                  </div>
                )}
                {onConvert && (
                  <>
                    <div
                      className="writing-type-grid"
                      role="group"
                      aria-label="转换块类型"
                    >
                      {blockChoices
                        .filter(
                          ([value]) =>
                            ![
                              "canvas",
                              "note-reference",
                              "asset",
                              "experiment",
                              "horizontalRule",
                              "table",
                              "formula",
                            ].includes(value),
                        )
                        .map(([value, label, TypeIcon]) => (
                          <DropdownMenu.Item
                            key={value}
                            className="writing-type-choice"
                            aria-label={`转换为${label}`}
                            title={label}
                            data-active={kind === value || undefined}
                            onSelect={() => onConvert(value)}
                          >
                            <TypeIcon size={19} />
                          </DropdownMenu.Item>
                        ))}
                    </div>
                    <DropdownMenu.Separator className="dropdown-separator" />
                  </>
                )}
                {formats}
                {formats && (
                  <DropdownMenu.Separator className="dropdown-separator" />
                )}
                {tableActions?.map((action) => (
                  <DropdownMenu.Item
                    className="dropdown-item"
                    key={action.label}
                    onSelect={action.run}
                  >
                    {action.label}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item
                  className="dropdown-item"
                  onSelect={() => onMove(-1)}
                >
                  <ArrowUp size={15} />
                  上移
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="dropdown-item"
                  onSelect={() => onMove(1)}
                >
                  <ArrowDown size={15} />
                  下移
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="dropdown-item danger"
                  onSelect={onRemove}
                >
                  <Trash2 size={15} />
                  {[
                    "canvas",
                    "note-reference",
                    "image",
                    "interactive",
                    "file",
                    "shape",
                    "markdown",
                  ].includes(kind)
                    ? "移出文稿"
                    : "删除当前块"}
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="dropdown-separator" />
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="dropdown-item">
                    在下方插入
                    <ChevronRight size={14} />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      className="dropdown-menu writing-add-menu"
                      sideOffset={4}
                      collisionPadding={8}
                      onPointerEnter={cancel}
                      onPointerLeave={leave}
                    >
                      {insertChoices}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              </>
            )}
            {onCanvas && (
              <>
                <DropdownMenu.Separator className="dropdown-separator" />
                <DropdownMenu.Item
                  className="dropdown-item"
                  onSelect={onCanvas}
                >
                  <LayoutDashboard size={15} />
                  放到画布
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {!empty && (
        <button
          draggable
          aria-label="拖动当前块"
          title="拖动调整顺序（也可在属性菜单中上下移动）"
          onDragStart={(event) => {
            changeOpen(false);
            onDragStart(event);
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={17} />
        </button>
      )}
    </div>
  );
}
