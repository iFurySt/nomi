import { FileText, ChevronRight } from "lucide-react";
import type { CanvasNote, CanvasDocument, CanvasBlock } from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
import { NoteIcon } from "./NoteIcon";
import "./note-links.css";

export function NoteLink({
  note,
  title,
  repository,
  onChoose,
}: {
  note?: CanvasNote;
  title?: string;
  repository: CanvasRepository;
  onChoose: (id: string) => void;
}) {
  const label = note?.title || title || "未命名文稿";
  return (
    <button
      type="button"
      className="note-link"
      disabled={!note}
      title={note ? label : `${label}（文稿不可用）`}
      onClick={() => note && onChoose(note.id)}
    >
      {note ? (
        <NoteIcon note={note} repository={repository} />
      ) : (
        <FileText size={18} aria-hidden="true" />
      )}
      <span className="note-link-title">{label}</span>
      {!note && <small>文稿不可用</small>}
      {note && (
        <ChevronRight
          className="note-link-chevron"
          size={14}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export function NoteReference({
  block,
  document,
  repository,
  onChoose,
}: {
  block: Extract<CanvasBlock, { type: "note-reference" }>;
  document: CanvasDocument;
  repository: CanvasRepository;
  onChoose?: (id: string) => void;
}) {
  const target =
    block.documentId === document.id
      ? document.notes.find((n) => n.id === block.noteId)
      : undefined;
  return (
    <NoteLink
      note={target}
      title={block.title}
      repository={repository}
      onChoose={
        onChoose ??
        ((id) => {
          location.hash = `/notes?note=${encodeURIComponent(id)}`;
        })
      }
    />
  );
}
