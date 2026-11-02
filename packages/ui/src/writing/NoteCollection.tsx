import { useState } from "react";
import { Plus, Table2, FileText } from "lucide-react";
import type { CanvasNote } from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
import { NoteLink } from "./NoteLink";

export function NoteCollection({
  notes,
  parent,
  profile,
  repository,
  onChoose,
  onCreate,
}: {
  notes: CanvasNote[];
  parent: CanvasNote;
  profile: string;
  repository: CanvasRepository;
  onChoose: (id: string) => void;
  onCreate: () => void;
}) {
  const preference = `nomi:notes:${profile}:${parent.id}:children-view`;
  const [view, setView] = useState<"table" | "blocks">(() => {
    try {
      return localStorage.getItem(preference) === "table" ? "table" : "blocks";
    } catch {
      return "blocks";
    }
  });
  const children = notes.filter((n) => n.parentId === parent.id);
  if (!children.length) return null;
  return (
    <section className="note-collection" aria-label="子文稿" data-view={view}>
      <header className="note-collection-header">
        <strong className="note-collection-label">
          子文稿 <span>{children.length}</span>
        </strong>
        <div
          className="note-collection-views"
          role="group"
          aria-label="子文稿视图"
        >
          {(
            [
              ["blocks", "文稿块", FileText],
              ["table", "表格", Table2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                try {
                  localStorage.setItem(preference, value);
                } catch {
                  /* Optional view preference. */
                }
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </header>
      {view === "table" ? (
        <table className="note-collection-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">子文稿</th>
            </tr>
          </thead>
          <tbody>
            {children.map((child) => (
              <tr key={child.id}>
                <td>
                  <NoteLink
                    note={child}
                    repository={repository}
                    onChoose={onChoose}
                  />
                </td>
                <td>
                  {notes.filter((n) => n.parentId === child.id).length || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="note-collection-blocks">
          {children.map((child) => (
            <NoteLink
              key={child.id}
              note={child}
              repository={repository}
              onChoose={onChoose}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        className="note-collection-create"
        onClick={onCreate}
      >
        <Plus size={15} />
        新建子文稿
      </button>
    </section>
  );
}
