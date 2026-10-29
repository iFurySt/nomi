import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Editor } from "@tiptap/core";
import { BlockActions, type InsertKind } from "../writing/BlockActions";
import {
  dropPosition,
  nodePositions,
  insertionNode,
} from "../writing/RichBlockFrame";
import {
  insertAt,
  moveBlock,
  textSnapshot,
  type BlockPoint,
  type BlockDrag,
  type TextSnapshot,
} from "../writing/blockOperations";
import {
  Plus,
  Check,
  TriangleAlert,
  FileText,
  ChevronRight,
} from "lucide-react";
import { WritingOutline } from "../writing/WritingOutline";
import { Markdown } from "../canvas/Markdown";
import {
  noteAncestors,
  noteSubtreeIds,
  newCanvasId,
  temperatureProgram,
  parseInteractiveProgram,
  type CanvasBlock,
  type CanvasAsset,
  type CanvasCommand,
} from "@nomi/core";
import {
  canvasAssetDigest,
  canvasImageMime,
  type CanvasAssetWrite,
} from "@nomi/platform";
import { useCanvasDocument } from "../canvas/useCanvasDocument";
import { InteractiveBlock } from "../canvas/InteractiveBlock";
import { AssetContent } from "../canvas/CanvasContent";
import {
  RichMarkdownEditor,
  needsSourceEditor,
} from "../writing/RichMarkdownEditor";
import { NotesLibrary, noteMoveTargets } from "../writing/NotesLibrary";
import { ResizableNotesLayout } from "../writing/ResizableNotesLayout";
import { writingRows, type WritingRow } from "../writing/writingRows";
import { Modal } from "../components/primitives";
import { Select } from "../components/Select";
import "../writing/writing.css";

export function Notes({ profile }: { profile: string }) {
  const data = useCanvasDocument(profile),
    doc = data.document;
  const [selected, setSelected] = useState(
    () => new URLSearchParams(location.hash.split("?")[1]).get("note") ?? "",
  );
  const [activeText, setActiveText] = useState("");
  const [deleted, setDeleted] = useState<{ id: string; revision: number }>();
  const editors = useRef(new Map<string, Editor>());
  const dragging = useRef<BlockDrag | undefined>(undefined);
  const [dragActive, setDragActive] = useState(false);
  const [writingInput, setWritingInput] = useState(false);
  const writingPointer = useRef<{ x: number; y: number } | undefined>(
    undefined,
  );
  const insertion = useRef<
    | {
        noteId: string;
        point: BlockPoint;
        source?: string;
        snapshot?: TextSnapshot;
      }
    | undefined
  >(undefined);
  const [dropMark, setDropMark] = useState<{ id: string; top: number }>();
  const lastTextEdit = useRef(0);
  const drafts = useRef(new Map<string, string>());
  const [query, setQuery] = useState("");
  const [movingNote, setMovingNote] = useState<string>();
  const [deletingNote, setDeletingNote] = useState<string>();
  const scrollPane = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [formula, setFormula] = useState<string>();
  const [existingBlock, setExistingBlock] = useState("");
  const assetInput = useRef<HTMLInputElement>(null),
    programInput = useRef<HTMLInputElement>(null);
  const note = doc?.notes.find((n) => n.id === selected) ?? doc?.notes[0];
  const endEditing = () => {
    data.endGroup();
    void data.flush();
  };
  useEffect(() => {
    const update = () =>
      setSelected(
        new URLSearchParams(location.hash.split("?")[1]).get("note") ?? "",
      );
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const history = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest('.writing-math-popover,[role="dialog"]')
      )
        return;
      if (target.closest(".notes-library") && target.matches("input,textarea"))
        return;
      if (
        target !== document.body &&
        target !== document.documentElement &&
        target.id !== "main-content" &&
        !target.closest(
          ".writing-article,.writing-block-menu,.writing-add-menu,.notes-library,.notes-context-menu",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (key === "y" || event.shiftKey) data.redo();
      else data.undo();
    };
    document.addEventListener("keydown", history, true);
    return () => document.removeEventListener("keydown", history, true);
  }, [data.undo, data.redo]);
  const choose = (id: string) => {
    endEditing();
    insertion.current = undefined;
    dragging.current = undefined;
    setDragActive(false);
    setDropMark(undefined);
    setSelected(id);
    location.hash = `/notes?note=${encodeURIComponent(id)}`;
    setError("");
    setMessage("");
  };
  const attempt = (fn: () => unknown) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  function createNote(source = "", title = "未命名文稿", parentId?: string) {
    const block = {
        id: newCanvasId("text"),
        type: "markdown" as const,
        source,
      },
      id = newCanvasId("note");
    data.edit([
      { type: "add_block", block },
      {
        type: "add_note",
        note: {
          id,
          title,
          blocks: [block.id],
          ...(parentId ? { parentId } : {}),
        },
      },
    ]);
    setQuery("");
    choose(id);
  }
  function insertContent(
    target: string,
    block: CanvasBlock,
    asset?: CanvasAsset,
    writes: CanvasAssetWrite[] = [],
    anchor = insertion.current,
  ) {
    const current = data.current.current!;
    const n = current.notes.find((n) => n.id === target);
    if (!n) throw Error("文稿已删除，未插入内容。");
    const location = anchor?.noteId === target ? anchor : undefined;
    const anchorBlock = current.blocks.find((b) => b.id === location?.point.id);
    if (
      location?.source !== undefined &&
      (anchorBlock?.type !== "markdown" ||
        anchorBlock.source !== location.source)
    )
      throw Error("插入位置的文字已改变，请重新选择。");
    const point = location?.point ?? {
      id: n.blocks.includes(activeText) ? activeText : n.blocks.at(-1)!,
      after: true,
    };
    const snapshots = new Map(
      [...editors.current].map(([id, editor]) => [id, textSnapshot(editor)]),
    );
    if (location?.snapshot && !snapshots.has(point.id))
      snapshots.set(point.id, location.snapshot);
    const commands: CanvasCommand[] = n.blocks.length
      ? insertAt(current, n, point, block, snapshots)
      : [
          { type: "add_block", block },
          { type: "set_note_blocks", id: n.id, blocks: [block.id] },
        ];
    if (asset)
      for (const command of commands)
        if (command.type === "add_block" && command.block.id === block.id)
          command.asset = asset;
    data.endGroup();
    data.edit(commands, undefined, writes);
    insertion.current = undefined;
  }

  function placeOnCanvas() {
    if (!note) return;
    if (
      !data.current.current!.board.placements.some((p) => p.content === note.id)
    )
      data.edit([
        {
          type: "place",
          placement: {
            id: newCanvasId("place"),
            content: note.id,
            x: 80,
            y: 80,
            width: 680,
          },
        },
      ]);
    location.hash = "/canvas";
  }
  function addBlock(block: CanvasBlock) {
    if (note) insertContent(note.id, block);
  }
  function writeText(row: WritingRow, source: string, isolated = false) {
    const current = data.current.current!;
    if (!note) return;
    const n = current.notes.find((n) => n.id === note.id);
    if (!n) return;
    const id = row.block.id;
    const commands: CanvasCommand[] = [];
    if (current.blocks.some((b) => b.id === id))
      commands.push({ type: "set_markdown", id, source });
    else {
      if (!source.trim()) return;
      const blocks = [...n.blocks];
      const index = row.after ? blocks.indexOf(row.after) + 1 : 0;
      blocks.splice(index, 0, id);
      commands.push(
        { type: "add_block", block: { id, type: "markdown", source } },
        { type: "set_note_blocks", id: n.id, blocks },
      );
    }
    const emptyPeers = new Set(
      (row.emptyPeers ?? []).filter((id) => {
        const block = current.blocks.find((block) => block.id === id);
        return block?.type === "markdown" && !block.source.trim();
      }),
    );
    if (emptyPeers.size)
      commands.push({
        type: "set_note_blocks",
        id: n.id,
        blocks: n.blocks.filter((id) => !emptyPeers.has(id)),
      });
    const now = performance.now();
    if (isolated || now - lastTextEdit.current > 1000) data.endGroup();
    lastTextEdit.current = now;
    data.edit(commands, `text:${id}`, [], { debounce: true });
    if (isolated) data.endGroup();
  }
  function deleteNote(id: string) {
    const current = data.current.current!;
    const index = current.notes.findIndex((n) => n.id === id);
    const removed = current.notes[index];
    if (!removed) return;
    const result = data.edit([{ type: "delete_note", id }]);
    if (note && !result.notes.some((n) => n.id === note.id)) {
      const next =
        result.notes.find((n) => n.id === removed.parentId) ??
        result.notes[Math.min(index, result.notes.length - 1)];
      setSelected(next?.id ?? "");
      location.hash = next
        ? `/notes?note=${encodeURIComponent(next.id)}`
        : "/notes";
    }
    setDeleted({ id, revision: result.revision });
    setError("");
    setMessage(`已删除「${removed.title || "未命名文稿"}」`);
  }
  function requestDelete(id: string) {
    if (noteSubtreeIds(data.current.current!.notes, id).size > 1)
      setDeletingNote(id);
    else attempt(() => deleteNote(id));
  }
  function moveNote(id: string, parentId: string | null) {
    data.endGroup();
    data.edit([{ type: "move_note", id, parentId }]);
    setMovingNote(undefined);
    setQuery("");
    choose(id);
  }
  function snapshots() {
    return new Map(
      [...editors.current].map(([id, editor]) => [id, textSnapshot(editor)]),
    );
  }
  function endDrag() {
    dragging.current = undefined;
    setDragActive(false);
    setDropMark(undefined);
  }
  function startDrag(
    event: DragEvent<HTMLButtonElement>,
    row: WritingRow,
    pos?: number,
    end?: number,
  ) {
    if (row.draft) {
      event.preventDefault();
      return;
    }
    data.endGroup();
    setDragActive(true);
    dragging.current = {
      id: row.block.id,
      pos,
      end,
      revision: data.current.current!.revision,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-nomi-writing-block",
      row.block.id,
    );
    const element =
      pos === undefined
        ? event.currentTarget.closest(".writing-block")
        : editors.current.get(row.block.id)?.view.nodeDOM(pos);
    if (element instanceof HTMLElement)
      event.dataTransfer.setDragImage(element, 0, 0);
  }
  function pointForRow(
    row: WritingRow,
    pos?: number,
    after = true,
    replaceTo?: number,
  ): BlockPoint {
    if (row.draft)
      return row.after
        ? { id: row.after, after: true }
        : { id: note!.blocks[0], after: false };
    return { id: row.block.id, pos, after, replaceTo };
  }
  function insertBeside(
    row: WritingRow,
    kind: InsertKind,
    pos?: number,
    replaceTo?: number,
  ) {
    if (!note) return;
    const point = pointForRow(row, pos, true, replaceTo);
    const source = doc?.blocks.find((b) => b.id === point.id);
    insertion.current = {
      noteId: note.id,
      point,
      source: source?.type === "markdown" ? source.source : undefined,
      snapshot: editors.current.has(point.id)
        ? textSnapshot(editors.current.get(point.id)!)
        : undefined,
    };
    if (kind === "asset") {
      assetInput.current?.click();
      return;
    }
    if (kind === "formula") {
      setFormula("");
      return;
    }
    if (kind === "experiment") {
      setExperimentOpen(true);
      return;
    }
    const editor = editors.current.values().next().value as Editor | undefined;
    const block: CanvasBlock = {
      id: newCanvasId("text"),
      type: "markdown",
      source:
        editor?.markdown?.serialize({
          type: "doc",
          content: [insertionNode(kind)],
        }) ??
        {
          paragraph: "",
          heading1: "# ",
          heading2: "## ",
          heading3: "### ",
          bulletList: "- ",
          orderedList: "1. ",
          taskList: "- [ ] ",
          blockquote: "> ",
          codeBlock: "```\n\n```",
          horizontalRule: "---",
          table: "|  |  |\n| --- | --- |\n|  |  |\n|  |  |",
        }[kind],
    };
    insertContent(note.id, block);
    setActiveText(block.id);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-writing-block="${block.id}"] .tiptap`,
        )
        ?.focus(),
    );
  }
  function performMove(source: BlockDrag, target: BlockPoint) {
    if (!note) return;
    const current = data.current.current!;
    const currentNote = current.notes.find((n) => n.id === note.id);
    if (!currentNote) return;
    const commands = moveBlock(
      current,
      currentNote,
      source,
      target,
      snapshots(),
    );
    if (commands.length) {
      data.endGroup();
      data.edit(commands);
    }
  }
  function moveBeside(
    row: WritingRow,
    direction: -1 | 1,
    pos?: number,
    end?: number,
  ) {
    if (row.draft || !note) return;
    const editor = editors.current.get(row.block.id);
    if (editor && pos !== undefined && end !== undefined) {
      const nodes = nodePositions(editor),
        index = nodes.findIndex((n) => n.pos === pos),
        neighbor = nodes[index + direction];
      if (neighbor) {
        performMove(
          {
            id: row.block.id,
            pos,
            end,
            revision: data.current.current!.revision,
          },
          {
            id: row.block.id,
            pos: direction < 0 ? neighbor.pos : neighbor.end,
          },
        );
        return;
      }
    }
    const index = note.blocks.indexOf(row.block.id),
      id = note.blocks[index + direction];
    if (id) {
      // A Markdown record may contain many visible blocks. Cross only its edge
      // node, using the same boundaries as the per-block handles in the editor.
      const neighborEditor = editors.current.get(id),
        nodes = neighborEditor ? nodePositions(neighborEditor) : [],
        neighbor = direction < 0 ? nodes.at(-1) : nodes[0];
      performMove(
        {
          id: row.block.id,
          pos,
          end,
          revision: data.current.current!.revision,
        },
        neighbor
          ? { id, pos: direction < 0 ? neighbor.pos : neighbor.end }
          : { id, after: direction > 0 },
      );
    }
  }

  function dragOver(event: DragEvent<HTMLElement>, drop = false) {
    const source = dragging.current;
    if (
      !source ||
      !event.dataTransfer.types.includes("application/x-nomi-writing-block")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    // Resolve by vertical position across the full writing pane, including its
    // margins and gaps. The marker and the drop use exactly the same target.
    const sections = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        "[data-writing-block]",
      ),
    ];
    const section = sections.reduce<HTMLElement | undefined>(
      (nearest, element) => {
        const distance = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          return Math.max(
            rect.top - event.clientY,
            event.clientY - rect.bottom,
            0,
          );
        };
        return !nearest || distance(element) < distance(nearest)
          ? element
          : nearest;
      },
      undefined,
    );
    const row = rows.find(
      (row) => row.block.id === section?.dataset.writingBlock,
    );
    if (!row || !section) return;
    const rect = section.getBoundingClientRect();
    const editor = editors.current.get(row.block.id);
    const boundary = editor ? dropPosition(editor, event.clientY) : undefined;
    const after = event.clientY > (rect.top + rect.bottom) / 2;
    const target = pointForRow(row, boundary?.pos, after);
    if (drop) {
      attempt(() => performMove(source, target));
      endDrag();
    } else
      setDropMark({
        id: row.block.id,
        top: boundary ? boundary.top - rect.top : after ? rect.height : 0,
      });
    const scroll = event.currentTarget;
    if (!drop && scroll) {
      const bounds = scroll.getBoundingClientRect();
      if (event.clientY < bounds.top + 48) scroll.scrollTop -= 18;
      else if (event.clientY > bounds.bottom - 48) scroll.scrollTop += 18;
    }
  }
  async function importProgram(file: File) {
    const target = note?.id,
      anchor = insertion.current;
    if (!target) return;
    try {
      if (file.size > 262144) throw Error("交互定义不能超过 256 KB。");
      const program = parseInteractiveProgram(await file.text());
      insertContent(
        target,
        {
          id: newCanvasId("interactive"),
          type: "interactive",
          program,
        },
        undefined,
        [],
        anchor,
      );
      setExperimentOpen(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function attach(file: File) {
    const target = note?.id,
      anchor = insertion.current;
    if (!target) return;
    try {
      const mime =
        (await canvasImageMime(file)) ??
        (file.type || "application/octet-stream");
      const blob = new Blob([file], { type: mime });
      const asset = {
        id: newCanvasId("asset"),
        name: file.name,
        mime,
        bytes: blob.size,
        sha256: await canvasAssetDigest(blob),
      };
      insertContent(
        target,
        {
          id: newCanvasId("attachment"),
          type: ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            mime,
          )
            ? "image"
            : "file",
          asset: asset.id,
        },
        asset,
        [{ asset, blob }],
        anchor,
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (data.loadError)
    return (
      <div role="alert" className="writing-error">
        {data.loadError}
      </div>
    );
  if (!doc) return <div className="writing-loading">正在打开文稿…</div>;
  const rows = note
    ? writingRows(doc, note, (after) => {
        const key = `${note.id}:${after}`;
        if (!drafts.current.has(key))
          drafts.current.set(key, newCanvasId("text"));
        return drafts.current.get(key)!;
      })
    : [];
  const tail = rows.at(-1)?.block;
  const editableTail =
    tail?.type === "markdown" && !needsSourceEditor(tail.source);
  const saveState = data.saveError
    ? "error"
    : data.saving
      ? "saving"
      : data.dirty
        ? "pending"
        : "saved";
  const saveDescription = data.saveError
    ? "保存失败"
    : data.saving
      ? "正在保存…"
      : data.dirty
        ? "编辑中，停笔后自动保存"
        : "已保存到本机";
  const experiments = doc.blocks.filter(
    (b) => b.type === "interactive" && !note?.blocks.includes(b.id),
  );
  return (
    <ResizableNotesLayout profile={profile}>
      <NotesLibrary
        profile={profile}
        document={doc}
        selected={note?.id}
        query={query}
        onQuery={setQuery}
        onChoose={choose}
        onCreate={(parentId) =>
          attempt(() => createNote("", "未命名文稿", parentId))
        }
        onMove={setMovingNote}
        onDelete={requestDelete}
      />
      <div className="notes-main">
        <header className="notes-topbar">
          <span
            className="notes-save"
            data-save-state={saveState}
            role="status"
            title={saveDescription}
            aria-label={saveDescription}
          >
            {data.saveError ? <TriangleAlert size={15} /> : <Check size={15} />}
          </span>
        </header>
        {(error || data.saveError || message) && (
          <div
            className="notes-notice"
            role={error || data.saveError ? "alert" : "status"}
          >
            {error || data.saveError || message}
            {deleted && deleted.revision === doc.revision && (
              <button
                onClick={() => {
                  data.undo();
                  choose(deleted.id);
                  setDeleted(undefined);
                }}
              >
                撤销删除
              </button>
            )}
            {data.saveError && <button onClick={data.retry}>重试保存</button>}
          </div>
        )}
        <div
          className="notes-writing-area"
          onInputCapture={(event) => {
            const target = event.target as HTMLElement;
            if (
              target.isContentEditable ||
              target.matches("textarea,input:not([type='checkbox'])")
            )
              setWritingInput(true);
          }}
          onCompositionStartCapture={() => setWritingInput(true)}
          onPointerDownCapture={() => setWritingInput(false)}
          onKeyDownCapture={(event) => {
            const target = event.target as HTMLElement;
            if (
              (target.isContentEditable ||
                target.matches("textarea,input:not([type='checkbox'])")) &&
              !event.metaKey &&
              !event.ctrlKey &&
              (event.key.length === 1 ||
                ["Backspace", "Delete", "Enter"].includes(event.key))
            )
              setWritingInput(true);
          }}
          onPointerMove={(event) => {
            if (event.pointerType === "touch" || event.buttons) return;
            const previous = writingPointer.current;
            writingPointer.current = { x: event.clientX, y: event.clientY };
            if (
              !previous ||
              previous.x !== event.clientX ||
              previous.y !== event.clientY
            )
              setWritingInput(false);
          }}
        >
          <div
            ref={scrollPane}
            className="notes-scroll"
            data-editable-tail={editableTail || undefined}
            onMouseDown={(event) => {
              if (
                event.button !== 0 ||
                event.shiftKey ||
                event.defaultPrevented ||
                dragging.current
              )
                return;
              const target = event.target as HTMLElement;
              if (
                target !== event.currentTarget &&
                !target.matches(".writing-article")
              )
                return;
              const editor = editors.current.get(tail?.id ?? "");
              if (!editor || editor.isDestroyed) return;
              event.preventDefault();
              editor.commands.focus("end", { scrollIntoView: false });
            }}
            data-writing-dragging={dragActive || undefined}
            onDragOver={(event) => dragOver(event)}
            onDrop={(event) => dragOver(event, true)}
            onDragLeave={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX <= rect.left ||
                event.clientX >= rect.right ||
                event.clientY <= rect.top ||
                event.clientY >= rect.bottom
              )
                setDropMark(undefined);
            }}
          >
            {note ? (
              <article className="writing-article" key={note.id}>
                {note.parentId && (
                  <nav className="notes-breadcrumb" aria-label="文稿路径">
                    {noteAncestors(doc.notes, note.id).map((parent) => (
                      <span key={parent.id}>
                        <button onClick={() => choose(parent.id)}>
                          {parent.title || "未命名文稿"}
                        </button>
                        <ChevronRight size={12} />
                      </span>
                    ))}
                  </nav>
                )}
                <input
                  className="writing-title"
                  aria-label="文稿标题"
                  placeholder="未命名文稿"
                  value={note.title}
                  onBlur={endEditing}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing)
                      return;
                    const first = rows.find((row) =>
                      editors.current.has(row.block.id),
                    );
                    const editor = first && editors.current.get(first.block.id);
                    if (!editor || editor.isDestroyed) return;
                    event.preventDefault();
                    editor.commands.focus("start");
                  }}
                  onChange={(e) =>
                    attempt(() =>
                      data.edit(
                        [
                          {
                            type: "rename_note",
                            id: note.id,
                            title: e.target.value,
                          },
                        ],
                        `title:${note.id}`,
                        [],
                        { debounce: true },
                      ),
                    )
                  }
                />
                {rows.map((row) => {
                  const block = row.block,
                    id = block.id;
                  const sourceOnly =
                    block.type === "markdown" &&
                    needsSourceEditor(block.source);
                  return (
                    <section
                      className={`writing-block writing-block-${block.type}`}
                      data-writing-block={id}
                      key={id}
                    >
                      {dropMark?.id === id && (
                        <div
                          className="writing-drop-line"
                          style={{ top: dropMark.top }}
                        />
                      )}
                      {!writingInput &&
                        (block.type !== "markdown" || sourceOnly) && (
                          <BlockActions
                            kind={block.type}
                            onCanvas={() => attempt(placeOnCanvas)}
                            onRemove={() =>
                              attempt(() =>
                                data.edit([
                                  {
                                    type: "set_note_blocks",
                                    id: note.id,
                                    blocks: note.blocks.filter((b) => b !== id),
                                  },
                                ]),
                              )
                            }
                            onInsert={(kind) =>
                              attempt(() => insertBeside(row, kind))
                            }
                            onDragStart={(event) => startDrag(event, row)}
                            onDragEnd={endDrag}
                            onMove={(direction) =>
                              attempt(() => moveBeside(row, direction))
                            }
                          />
                        )}
                      {(block.type === "interactive" ||
                        block.type === "shape") && (
                        <div className="writing-block-tools">
                          <span>
                            {block.type === "interactive"
                              ? "交互实验"
                              : "画布文字"}
                          </span>
                        </div>
                      )}
                      {block.type === "markdown" ? (
                        sourceOnly ? (
                          <div
                            className="writing-protected"
                            aria-label="保留的原文"
                          >
                            <Markdown source={block.source} />
                          </div>
                        ) : (
                          <RichMarkdownEditor
                            source={block.source}
                            hideBlockTools={writingInput}
                            onEditor={(editor) => {
                              if (editor) editors.current.set(id, editor);
                              else editors.current.delete(id);
                            }}
                            onInsert={(kind, pos, replaceTo) =>
                              attempt(() =>
                                insertBeside(row, kind, pos, replaceTo),
                              )
                            }
                            onCanvas={() => attempt(placeOnCanvas)}
                            onBlockDrag={(event, pos, end) =>
                              startDrag(event, row, pos, end)
                            }
                            onBlockDragEnd={endDrag}
                            onBlockMove={(pos, end, direction) =>
                              attempt(() =>
                                moveBeside(row, direction, pos, end),
                              )
                            }
                            onBlur={endEditing}
                            onActivate={() => setActiveText(id)}
                            onBoundary={(direction) => {
                              const textRows = rows.filter(
                                (r) => r.block.type === "markdown",
                              );
                              const next =
                                textRows[
                                  textRows.findIndex((r) => r.block.id === id) +
                                    (direction === "next" ? 1 : -1)
                                ];
                              if (!next) return false;
                              const target =
                                document.querySelector<HTMLElement>(
                                  `[data-writing-block="${next.block.id}"] .tiptap`,
                                );
                              if (!target) return false;
                              target.focus();
                              const range = document.createRange();
                              range.selectNodeContents(target);
                              range.collapse(direction === "next");
                              const selection = window.getSelection();
                              selection?.removeAllRanges();
                              selection?.addRange(range);
                              return true;
                            }}
                            placeholder={
                              rows[0].block.id === id
                                ? "从这里开始写作…"
                                : "继续写作…"
                            }
                            onChange={(source, isolated) =>
                              attempt(() => writeText(row, source, isolated))
                            }
                          />
                        )
                      ) : block.type === "interactive" ? (
                        <InteractiveBlock
                          program={block.program}
                          profile={profile}
                          documentId={doc.id}
                          blockId={id}
                        />
                      ) : block.type === "image" || block.type === "file" ? (
                        <AssetContent
                          block={block}
                          document={doc}
                          repository={data.repository}
                          onCaptionChange={
                            block.type === "image"
                              ? (caption) =>
                                  attempt(() =>
                                    data.edit(
                                      [
                                        {
                                          type: "set_image_caption",
                                          id,
                                          caption,
                                        },
                                      ],
                                      `caption:${id}`,
                                      [],
                                      { debounce: true },
                                    ),
                                  )
                              : undefined
                          }
                          onCaptionBlur={endEditing}
                        />
                      ) : (
                        <p className="writing-shape-text">
                          {block.type === "shape" ? block.text : ""}
                        </p>
                      )}
                    </section>
                  );
                })}
                {!!doc.notes.some((child) => child.parentId === note.id) && (
                  <section className="notes-children" aria-label="子文稿">
                    {doc.notes
                      .filter((child) => child.parentId === note.id)
                      .map((child) => (
                        <button key={child.id} onClick={() => choose(child.id)}>
                          <FileText size={15} />
                          <span>{child.title || "未命名文稿"}</span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    <button
                      className="notes-child-create"
                      onClick={() =>
                        attempt(() => createNote("", "未命名文稿", note.id))
                      }
                    >
                      <Plus size={15} />
                      新建子文稿
                    </button>
                  </section>
                )}
              </article>
            ) : (
              <div className="notes-empty">
                <h2>从第一篇文稿开始</h2>
                <button onClick={() => attempt(() => createNote())}>
                  新建文稿
                </button>
              </div>
            )}
          </div>
          {note && <WritingOutline scroll={scrollPane} noteId={note.id} />}
        </div>
      </div>
      <input
        hidden
        type="file"
        ref={assetInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void attach(f);
        }}
      />
      <input
        hidden
        type="file"
        accept=".json"
        ref={programInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importProgram(f);
        }}
      />
      <Modal
        open={!!movingNote}
        onOpenChange={(open) => !open && setMovingNote(undefined)}
        title="移动文稿到…"
        className="notes-move-dialog"
      >
        <div className="notes-move-targets">
          <button
            disabled={!doc.notes.find((n) => n.id === movingNote)?.parentId}
            onClick={() =>
              movingNote && attempt(() => moveNote(movingNote, null))
            }
          >
            <FileText size={16} />
            文稿根目录
          </button>
          {movingNote &&
            noteMoveTargets(doc.notes, movingNote).map((target) => (
              <button
                key={target.id}
                disabled={
                  doc.notes.find((n) => n.id === movingNote)?.parentId ===
                  target.id
                }
                onClick={() => attempt(() => moveNote(movingNote, target.id))}
              >
                <FileText size={15} />
                <span>
                  {[...noteAncestors(doc.notes, target.id), target]
                    .map((n) => n.title || "未命名文稿")
                    .join(" / ")}
                </span>
              </button>
            ))}
        </div>
      </Modal>
      <Modal
        open={!!deletingNote}
        onOpenChange={(open) => !open && setDeletingNote(undefined)}
        title="删除文稿及子文稿？"
      >
        <p>
          将删除「
          {doc.notes.find((n) => n.id === deletingNote)?.title || "未命名文稿"}
          」及其{" "}
          {deletingNote
            ? noteSubtreeIds(doc.notes, deletingNote).size - 1
            : 0}{" "}
          篇子文稿。删除后可以撤销恢复。
        </p>
        <div className="notes-delete-actions">
          <button onClick={() => setDeletingNote(undefined)}>取消</button>
          <button
            onClick={() => {
              if (deletingNote) attempt(() => deleteNote(deletingNote));
              setDeletingNote(undefined);
            }}
          >
            删除文稿及子文稿
          </button>
        </div>
      </Modal>
      <Modal
        open={formula !== undefined}
        onOpenChange={(open) => !open && setFormula(undefined)}
        title="插入公式"
      >
        <form
          className="writing-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!formula?.trim() || !note) return;
            attempt(() => {
              insertContent(note.id, {
                id: newCanvasId("text"),
                type: "markdown",
                source: "$$\n" + formula + "\n$$",
              });
              setFormula(undefined);
            });
          }}
        >
          <textarea
            autoFocus
            aria-label="LaTeX 公式"
            value={formula ?? ""}
            onChange={(event) => setFormula(event.target.value)}
          />
          <button type="submit">保存公式</button>
        </form>
      </Modal>
      <Modal
        open={experimentOpen}
        onOpenChange={setExperimentOpen}
        title="添加交互实验"
      >
        <div className="writing-form">
          <button
            onClick={() =>
              attempt(() => {
                addBlock({
                  id: newCanvasId("interactive"),
                  type: "interactive",
                  program: structuredClone(temperatureProgram),
                });
                setExperimentOpen(false);
              })
            }
          >
            添加 Softmax 温度实验
          </button>
          <button onClick={() => programInput.current?.click()}>
            导入交互定义（.json）
          </button>
          {!!experiments.length && (
            <>
              <Select
                label="已有交互实验"
                value={existingBlock}
                placeholder="选择画布中的实验"
                options={experiments.map((b) => ({ value: b.id, label: b.id }))}
                onValueChange={setExistingBlock}
              />
              <button
                disabled={!existingBlock}
                onClick={() =>
                  attempt(() => {
                    const block = experiments.find(
                      (b) => b.id === existingBlock,
                    );
                    if (note && block) insertContent(note.id, block);
                    setExperimentOpen(false);
                  })
                }
              >
                引用到文稿
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </Modal>
    </ResizableNotesLayout>
  );
}
