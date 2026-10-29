import { useEffect, useRef } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FileText, MoreHorizontal, Trash2 } from "lucide-react";
import type { CanvasNote } from "@nomi/core";
export function NoteListItem({
  note,
  selected,
  onChoose,
  onDelete,
}: {
  note: CanvasNote;
  selected: boolean;
  onChoose: () => void;
  onDelete: () => void;
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
          data-note-row={note.id}
          data-selected={selected || undefined}
        >
          <button
            className="notes-list-select"
            aria-current={selected ? "page" : undefined}
            onClick={onChoose}
          >
            <FileText size={15} />
            <span>{note.title || "未命名文稿"}</span>
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
