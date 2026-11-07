import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  GripHorizontal,
  GripVertical,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { Tooltip } from "../components/Tooltip";

type Target = {
  cell: HTMLTableCellElement;
  table: HTMLTableElement;
  rect: DOMRect;
  tableRect: DOMRect;
};
type Command =
  | "addRowBefore"
  | "addRowAfter"
  | "addColumnBefore"
  | "addColumnAfter"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable";
export function TableControls({
  editor,
  disabled,
}: {
  editor: Editor;
  disabled: boolean;
}) {
  const [target, setTarget] = useState<Target>();
  const [menu, setMenu] = useState<"row" | "column" | "cell">();
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const current = useRef(target);
  current.current = target;
  const menuRef = useRef(menu);
  menuRef.current = menu;
  useEffect(() => {
    if (disabled) {
      setTarget(undefined);
      setMenu(undefined);
      return;
    }
    if (editor.isDestroyed) return;
    const editorDOM = editor.view.dom;
    const measure = () => {
      if (editor.isDestroyed) return;
      const t = current.current;
      if (!t) return;
      if (!t.cell.isConnected) {
        setTarget(undefined);
        setMenu(undefined);
        return;
      }
      setTarget({
        ...t,
        rect: t.cell.getBoundingClientRect(),
        tableRect: t.table.getBoundingClientRect(),
      });
    };
    const move = (event: PointerEvent) => {
      if (editor.isDestroyed || menuRef.current || event.buttons) return;
      const element = event.target as Element;
      if (element.closest?.(".writing-table-controls,[data-table-menu]"))
        return;
      const cell = element.closest?.("td,th") as HTMLTableCellElement | null;
      if (!cell || !editorDOM.contains(cell)) {
        const t = current.current;
        // Bridge the short gap from a cell to its outside edge controls.
        if (
          t &&
          event.clientX >= t.tableRect.left - 20 &&
          event.clientX <= t.tableRect.right + 2 &&
          event.clientY >= t.tableRect.top - 20 &&
          event.clientY <= t.tableRect.bottom + 2
        )
          return;
        setTarget(undefined);
        return;
      }
      if (current.current?.cell === cell) return;
      const table = cell.closest("table")!;
      setTarget({
        cell,
        table,
        rect: cell.getBoundingClientRect(),
        tableRect: table.getBoundingClientRect(),
      });
    };
    const context = (event: MouseEvent) => {
      const cell = (event.target as Element).closest(
        "td,th",
      ) as HTMLTableCellElement | null;
      if (!cell) return;
      event.preventDefault();
      const table = cell.closest("table")!;
      setTarget({
        cell,
        table,
        rect: cell.getBoundingClientRect(),
        tableRect: table.getBoundingClientRect(),
      });
      setPoint({ x: event.clientX, y: event.clientY });
      setMenu("cell");
    };
    // Hide while scrolling, avoiding a floating control detached from its table.
    const hide = () => {
      if (!menuRef.current) setTarget(undefined);
    };
    document.addEventListener("pointermove", move);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    editorDOM.addEventListener("contextmenu", context);
    editor.on("transaction", measure);
    return () => {
      document.removeEventListener("pointermove", move);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      editorDOM.removeEventListener("contextmenu", context);
      editor.off("transaction", measure);
    };
  }, [editor, disabled]);
  if (!target || disabled) return null;
  const locate = () => {
    if (!target.cell.isConnected || editor.isDestroyed) return;
    const $pos = editor.state.doc.resolve(editor.view.posAtDOM(target.cell, 0));
    for (let depth = $pos.depth; depth > 0; depth--) {
      if (["tableCell", "tableHeader"].includes($pos.node(depth).type.name))
        return {
          pos: $pos.before(depth),
          start: $pos.start(depth - 2),
          table: $pos.node(depth - 2),
        };
    }
  };
  const run = (command: Command) => {
    const cell = locate();
    if (!cell) return;
    editor
      .chain()
      .focus()
      .setTextSelection(cell.pos + 2)
      [command]()
      .run();
    setMenu(undefined);
  };
  const select = (axis: "row" | "column") => {
    const cell = locate();
    if (!cell) return;
    const $cell = editor.state.doc.resolve(cell.pos);
    editor.view.focus();
    editor.view.dispatch(
      editor.state.tr.setSelection(
        axis === "row"
          ? CellSelection.rowSelection($cell)
          : CellSelection.colSelection($cell),
      ),
    );
  };
  const distribute = () => {
    const cell = locate();
    if (!cell) return;
    const map = TableMap.get(cell.table);
    const width = Math.max(72, Math.round(target.tableRect.width / map.width));
    const tr = editor.state.tr;
    for (const offset of new Set(map.map)) {
      const node = cell.table.nodeAt(offset)!;
      tr.setNodeMarkup(cell.start + offset, undefined, {
        ...node.attrs,
        colwidth: Array(node.attrs.colspan).fill(width),
      });
    }
    editor.view.dispatch(tr);
    setMenu(undefined);
  };
  const actions: [string, Command, typeof ArrowUp][] = [
    ["在上方插入行", "addRowBefore", ArrowUp],
    ["在下方插入行", "addRowAfter", ArrowDown],
    ["在左侧插入列", "addColumnBefore", ArrowLeft],
    ["在右侧插入列", "addColumnAfter", ArrowRight],
    ["删除行", "deleteRow", Trash2],
    ["删除列", "deleteColumn", Trash2],
  ];
  const trigger = (axis: "row" | "column") => {
    const row = axis === "row";
    const style = row
      ? {
          left: target.tableRect.left - 16,
          top: target.rect.top,
          width: 14,
          height: target.rect.height,
        }
      : {
          left: target.rect.left,
          top: target.tableRect.top - 16,
          width: target.rect.width,
          height: 14,
        };
    return (
      <DropdownMenu.Root
        open={menu === axis}
        onOpenChange={(open) => {
          if (open) select(axis);
          setMenu(open ? axis : undefined);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            className="writing-table-grip"
            style={style}
            aria-label={row ? "行操作" : "列操作"}
          >
            {row ? <GripVertical size={12} /> : <GripHorizontal size={12} />}
          </button>
        </DropdownMenu.Trigger>
        {renderMenu(axis)}
      </DropdownMenu.Root>
    );
  };
  const renderMenu = (axis: "row" | "column" | "cell") => (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        data-table-menu
        className="writing-table-menu"
        side={axis === "row" ? "left" : "bottom"}
        sideOffset={4}
        collisionPadding={12}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {actions
          .filter(
            ([, cmd]) =>
              axis === "cell" ||
              (axis === "row" ? cmd.includes("Row") : cmd.includes("Column")),
          )
          .map(([label, cmd, Icon]) => (
            <DropdownMenu.Item key={cmd} onSelect={() => run(cmd)}>
              <Icon size={16} />
              {label}
            </DropdownMenu.Item>
          ))}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => select("row")}>
          <Rows3 size={16} />
          选择整行
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => select("column")}>
          <Columns3 size={16} />
          选择整列
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={distribute}>
          <Columns3 size={16} />
          平均分布列宽
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => run("deleteTable")}>
          <Trash2 size={16} />
          删除表格
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
  return createPortal(
    <div
      className="writing-table-controls"
      onMouseDown={(e) => e.preventDefault()}
    >
      {trigger("row")}
      {trigger("column")}
      <Tooltip label="在下方插入行">
        <button
          className="writing-table-insert"
          aria-label="在下方插入行"
          style={{
            left: target.tableRect.left - 18,
            top: target.rect.bottom - 9,
          }}
          onClick={() => run("addRowAfter")}
        >
          <Plus size={12} />
        </button>
      </Tooltip>
      <Tooltip label="在右侧插入列">
        <button
          className="writing-table-insert"
          aria-label="在右侧插入列"
          style={{
            left: target.rect.right - 9,
            top: target.tableRect.top - 18,
          }}
          onClick={() => run("addColumnAfter")}
        >
          <Plus size={12} />
        </button>
      </Tooltip>
      <DropdownMenu.Root
        open={menu === "cell"}
        onOpenChange={(open) => !open && setMenu(undefined)}
      >
        <DropdownMenu.Trigger
          style={{
            position: "fixed",
            left: point.x,
            top: point.y,
            width: 0,
            height: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
          aria-hidden
          tabIndex={-1}
        />
        {renderMenu("cell")}
      </DropdownMenu.Root>
    </div>,
    document.body,
  );
}
