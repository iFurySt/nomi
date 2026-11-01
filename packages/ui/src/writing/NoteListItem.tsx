import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  FileText,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Plus,
  ChevronRight,
  CornerDownRight,
} from "lucide-react";
import type { CanvasNote } from "@nomi/core";
import { useNoteTitleReveal } from "./useNoteTitleReveal";
import type { NoteDropPosition } from "./note-drop";
export function NoteListItem({
  note,
  selected,
  onChoose,
  onDelete,
  depth,
  expanded,
  hasChildren,
  dragging,
  dropPosition,
  dropDepth,
  onToggle,
  onCreate,
  onMove,
  onReveal,
}: {
  note: CanvasNote;
  selected: boolean;
  onChoose: () => void;
  onDelete: () => void;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  dragging?: boolean;
  dropPosition?: NoteDropPosition;
  dropDepth?: number;
  onToggle: () => void;
  onCreate: () => void;
  onMove: () => void;
  onReveal?: (children: boolean) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = hovered || keyboardFocus || contextOpen || menuOpen;
  const title = note.title || "未命名文稿";
  const reveal = useNoteTitleReveal(active, title);
  useEffect(() => {
    if (selected)
      row.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <ContextMenu.Root onOpenChange={setContextOpen}>
      <ContextMenu.Trigger asChild>
        <div
          ref={row}
          className="notes-list-row"
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-selected={selected}
          style={
            {
              "--note-depth": depth,
              "--note-drop-depth": dropDepth ?? depth,
            } as CSSProperties
          }
          data-note-row={note.id}
          data-selected={selected || undefined}
          data-note-dragging={dragging || undefined}
          data-note-drop={dropPosition}
          data-actions-visible={active || undefined}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
          onFocusCapture={(event) =>
            setKeyboardFocus(
              (event.target as HTMLElement).matches(":focus-visible"),
            )
          }
          onBlurCapture={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setKeyboardFocus(false);
          }}
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
            aria-label={title}
            onClick={onChoose}
          >
            <FileText size={15} />
            <span className="notes-title-viewport" ref={reveal.viewport}>
              <span className="notes-title-text" ref={reveal.text}>
                {title}
              </span>
            </span>
          </button>
          <div className="notes-row-actions" ref={reveal.actions}>
            <button
              className="notes-row-add"
              aria-label={`在${note.title || "未命名文稿"}下新建文稿`}
              title="新建子文稿"
              onClick={onCreate}
            >
              <Plus size={15} />
            </button>
            <DropdownMenu.Root onOpenChange={setMenuOpen}>
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
                  <DropdownMenu.Item
                    className="dropdown-item"
                    onSelect={onMove}
                  >
                    <CornerDownRight size={15} />
                    移动到…
                  </DropdownMenu.Item>
                  {onReveal && (
                    <>
                      <DropdownMenu.Item
                        className="dropdown-item"
                        onSelect={() => onReveal(false)}
                      >
                        <FolderOpen size={15} />在 Finder 中显示
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="dropdown-item"
                        onSelect={() => onReveal(true)}
                      >
                        <FolderOpen size={15} />
                        打开子文稿目录
                      </DropdownMenu.Item>
                    </>
                  )}
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
          {onReveal && (
            <>
              <ContextMenu.Item
                className="dropdown-item"
                onSelect={() => onReveal(false)}
              >
                <FolderOpen size={15} />在 Finder 中显示
              </ContextMenu.Item>
              <ContextMenu.Item
                className="dropdown-item"
                onSelect={() => onReveal(true)}
              >
                <FolderOpen size={15} />
                打开子文稿目录
              </ContextMenu.Item>
            </>
          )}
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
