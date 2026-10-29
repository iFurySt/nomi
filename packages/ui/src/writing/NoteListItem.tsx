import { useEffect, useRef, type CSSProperties } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  FileText,
  MoreHorizontal,
  Trash2,
  Plus,
  ChevronRight,
  CornerDownRight,
} from "lucide-react";
import type { CanvasNote } from "@nomi/core";
export function NoteListItem({
  note,
  selected,
  onChoose,
  onDelete,
  depth,
  expanded,
  hasChildren,
  onToggle,
  onCreate,
  onMove,
}: {
  note: CanvasNote;
  selected: boolean;
  onChoose: () => void;
  onDelete: () => void;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onCreate: () => void;
  onMove: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected)
      row.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={row}
          className="notes-list-row"
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-selected={selected}
          style={{ "--note-depth": depth } as CSSProperties}
          data-note-row={note.id}
          data-selected={selected || undefined}
        >
          <button
            className="notes-row-toggle"
            aria-label={`${expanded ? "收起" : "展开"}${note.title || "未命名文稿"}`}
            disabled={!hasChildren}
            tabIndex={-1}
            onClick={onToggle}
          >
            {hasChildren && (
              <ChevronRight
                size={13}
                style={{ transform: expanded ? "rotate(90deg)" : undefined }}
              />
            )}
          </button>
          <button
            className="notes-list-select"
            aria-current={selected ? "page" : undefined}
            title={note.title || "未命名文稿"}
            onClick={onChoose}
          >
            <FileText size={15} />
            <span>{note.title || "未命名文稿"}</span>
          </button>
          <button
            className="notes-row-add"
            aria-label={`在${note.title || "未命名文稿"}下新建文稿`}
            title="新建子文稿"
            onClick={onCreate}
          >
            <Plus size={15} />
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="notes-row-menu"
                aria-label={`${note.title || "未命名文稿"}的操作`}
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="dropdown-menu notes-context-menu"
                align="end"
                sideOffset={5}
              >
                <DropdownMenu.Item
                  className="dropdown-item"
                  onSelect={onCreate}
                >
                  <Plus size={15} />
                  新建子文稿
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dropdown-item" onSelect={onMove}>
                  <CornerDownRight size={15} />
                  移动到…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="dropdown-item danger"
                  onSelect={onDelete}
                >
                  <Trash2 size={15} />
                  删除文稿
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="dropdown-menu notes-context-menu"
          aria-label="文稿操作"
        >
          <ContextMenu.Item className="dropdown-item" onSelect={onCreate}>
            <Plus size={15} />
            新建子文稿
          </ContextMenu.Item>
          <ContextMenu.Item className="dropdown-item" onSelect={onMove}>
            <CornerDownRight size={15} />
            移动到…
          </ContextMenu.Item>
          <ContextMenu.Item
            className="dropdown-item danger"
            onSelect={onDelete}
          >
            <Trash2 size={15} />
            删除文稿
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
