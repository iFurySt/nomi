import {
  applyCanvasCommands,
  blockAssetIds,
  newCanvasId,
  noteSubtreeIds,
  parseCanvasDocument,
  type CanvasDocument,
  type CanvasBlock,
  type CanvasNote,
} from "../canvas/index";
import { operationSchema, type Operation } from "./contract";
/** JSON object key order is not semantic, including after a .nomi package round trip. */
export function canonicalJSON(value: unknown): string | undefined {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, item]) => [k, normalize(item)]),
      );
    return v;
  };
  return JSON.stringify(normalize(value));
}
export const same = (a: unknown, b: unknown) =>
  canonicalJSON(a) === canonicalJSON(b);
const fail = (message: string): never => {
  throw Error(message);
};
export const findNote = (d: CanvasDocument, id: string) =>
  d.notes.find((n) => n.id === id) ?? fail("NOT_FOUND: Note does not exist.");
export const findBlock = (d: CanvasDocument, id: string) =>
  d.blocks.find((b) => b.id === id) ?? fail("NOT_FOUND: Block does not exist.");
export function blockReferences(d: CanvasDocument, id: string) {
  return {
    noteIds: d.notes.filter((n) => n.blocks.includes(id)).map((n) => n.id),
    placementIds: d.board.placements
      .filter((p) => p.content === id)
      .map((p) => p.id),
  };
}
function writable(d: CanvasDocument, id: string, allowShared: boolean) {
  const refs = blockReferences(d, id);
  if (!allowShared && refs.noteIds.length + refs.placementIds.length > 1)
    fail("SHARED_BLOCK: Set allowShared:true to edit all references.");
  return findBlock(d, id);
}
function insert<T>(items: T[], incoming: T[], before: T | undefined) {
  const index = before === undefined ? items.length : items.indexOf(before);
  if (index < 0) fail("NOT_FOUND: Insertion anchor does not exist.");
  items.splice(index, 0, ...incoming);
}
function prune(d: CanvasDocument, ids: string[]) {
  d.blocks = d.blocks.filter(
    (b) =>
      !ids.includes(b.id) ||
      d.notes.some((n) => n.blocks.includes(b.id)) ||
      d.board.placements.some((p) => p.content === b.id),
  );
  // Originals and metadata are retained for durable restore and shared embedded scenes.
}
export function applyOperations(
  input: CanvasDocument,
  operations: Operation[],
) {
  let d = structuredClone(input);
  const results: unknown[] = [];
  for (const raw of operations) {
    const op = operationSchema.parse(raw);
    switch (op.type) {
      case "create_note": {
        const n: CanvasNote = {
          id: op.noteId ?? newCanvasId("note"),
          title: op.title,
          blocks: [],
          ...(op.parentId ? { parentId: op.parentId } : {}),
        };
        if (op.markdown !== undefined) {
          const b: CanvasBlock = {
            id: newCanvasId("text"),
            type: "markdown",
            source: op.markdown,
          };
          d.blocks.push(b);
          n.blocks.push(b.id);
        }
        d.notes.push(n);
        results.push({ noteId: n.id, blockIds: n.blocks });
        break;
      }
      case "update_note": {
        const n = findNote(d, op.noteId);
        if (op.title !== undefined) n.title = op.title;
        if (op.icon === null) delete n.icon;
        else if (op.icon !== undefined) n.icon = op.icon;
        results.push({ noteId: n.id });
        break;
      }
      case "move_note":
        d = applyCanvasCommands(d, d.revision, [
          {
            type: "move_note",
            id: op.noteId,
            parentId: op.parentId,
            ...(op.beforeNoteId ? { before: op.beforeNoteId } : {}),
          },
        ]);
        results.push({ noteId: op.noteId });
        break;
      case "trash_note": {
        findNote(d, op.noteId);
        const ids = noteSubtreeIds(d.notes, op.noteId);
        if (ids.size > 1 && !op.includeChildren)
          fail(
            "HAS_CHILDREN: Explicitly include descendants to trash this note.",
          );
        // Trash retains immutable originals and shared content, including assets in embedded scenes.
        const candidateBlocks = d.notes
          .filter((n) => ids.has(n.id))
          .flatMap((n) => n.blocks);
        const removedPlacements = new Set(
          d.board.placements.filter((p) => ids.has(p.content)).map((p) => p.id),
        );
        d.notes = d.notes.filter((n) => !ids.has(n.id));
        d.board.placements = d.board.placements.filter(
          (p) => !removedPlacements.has(p.id),
        );
        if (d.board.connectors)
          d.board.connectors = d.board.connectors.filter(
            (c) =>
              !removedPlacements.has(c.from.placement ?? "") &&
              !removedPlacements.has(c.to.placement ?? ""),
          );
        prune(d, candidateBlocks);
        results.push({ trashedNoteIds: [...ids] });
        break;
      }
      case "insert_blocks": {
        const n = findNote(d, op.noteId);
        const blocks = op.blocks.map(
          (b) => ({ ...b, id: b.id ?? newCanvasId("block") }) as CanvasBlock,
        );
        insert(
          n.blocks,
          blocks.map((b) => b.id),
          op.beforeBlockId,
        );
        d.blocks.push(...blocks);
        results.push({ blockIds: blocks.map((b) => b.id) });
        break;
      }
      case "update_block": {
        writable(d, op.blockId, op.allowShared);
        if (op.block.id !== undefined && op.block.id !== op.blockId)
          fail("INVALID_ID: Block identity cannot change.");
        d.blocks[d.blocks.findIndex((b) => b.id === op.blockId)] = {
          ...op.block,
          id: op.blockId,
        } as CanvasBlock;
        results.push({ blockId: op.blockId });
        break;
      }
      case "edit_text": {
        const b = writable(d, op.blockId, op.allowShared);
        if (b.type !== "markdown")
          fail("INVALID_TYPE: edit_text requires markdown.");
        const markdown = b as Extract<CanvasBlock, { type: "markdown" }>;
        const at = markdown.source.indexOf(op.oldText);
        if (at < 0) fail("TEXT_NOT_FOUND: Re-read the block before editing.");
        if (markdown.source.indexOf(op.oldText, at + 1) >= 0)
          fail("AMBIGUOUS_TEXT: Include more surrounding text.");
        markdown.source =
          markdown.source.slice(0, at) +
          op.newText +
          markdown.source.slice(at + op.oldText.length);
        results.push({ blockId: b.id });
        break;
      }
      case "move_blocks": {
        const from = findNote(d, op.noteId),
          to = findNote(d, op.targetNoteId);
        if (
          new Set(op.blockIds).size !== op.blockIds.length ||
          op.blockIds.some((id) => !from.blocks.includes(id))
        )
          fail("NOT_FOUND: Source block references missing or repeated.");
        from.blocks = from.blocks.filter((id) => !op.blockIds.includes(id));
        if (op.blockIds.some((id) => to.blocks.includes(id)))
          fail("DUPLICATE_REFERENCE: Target already contains a block.");
        insert(to.blocks, op.blockIds, op.beforeBlockId);
        results.push({ blockIds: op.blockIds });
        break;
      }
      case "remove_blocks": {
        const n = findNote(d, op.noteId);
        if (
          new Set(op.blockIds).size !== op.blockIds.length ||
          op.blockIds.some((id) => !n.blocks.includes(id))
        )
          fail("NOT_FOUND: Block references missing or repeated.");
        n.blocks = n.blocks.filter((id) => !op.blockIds.includes(id));
        prune(d, op.blockIds);
        results.push({ blockIds: op.blockIds });
        break;
      }
    }
  }
  d.revision = input.revision + 1;
  return { document: parseCanvasDocument(d), results };
}
export function page<T>(items: T[], p: { offset: number; limit: number }) {
  return {
    items: items.slice(p.offset, p.offset + p.limit),
    total: items.length,
    nextOffset: p.offset + p.limit < items.length ? p.offset + p.limit : null,
  };
}
function blockText(b: CanvasBlock) {
  return b.type === "markdown"
    ? b.source
    : b.type === "shape"
      ? b.text
      : b.type === "note-reference"
        ? b.title
        : b.type === "image"
          ? (b.caption ?? "")
          : b.type === "interactive"
            ? b.program.id
            : "";
}
export function readDocumentTool(
  d: CanvasDocument,
  name: string,
  p: any,
): unknown {
  const meta = { workspaceId: d.id, revision: d.revision };
  if (p.workspaceId !== d.id)
    fail("WORKSPACE_MISMATCH: Call get_context first.");
  if (name === "list_notes")
    return {
      ...meta,
      ...page(
        d.notes
          .filter(
            (n) =>
              p.parentId === undefined ||
              n.parentId === (p.parentId ?? undefined),
          )
          .map((n) => ({
            ...n,
            childCount: d.notes.filter((x) => x.parentId === n.id).length,
          })),
        p,
      ),
    };
  if (name === "get_note") {
    const n = findNote(d, p.noteId);
    return {
      ...meta,
      note: n,
      children: d.notes.filter((x) => x.parentId === n.id).map((n) => n.id),
      ...(p.includeBlocks
        ? { blocks: n.blocks.map((id) => findBlock(d, id)) }
        : {}),
    };
  }
  if (name === "list_blocks")
    return {
      ...meta,
      ...page(
        findNote(d, p.noteId).blocks.map((id) => findBlock(d, id)),
        p,
      ),
    };
  if (name === "get_block")
    return {
      ...meta,
      block: findBlock(d, p.blockId),
      references: blockReferences(d, p.blockId),
    };
  if (name === "list_assets") {
    const n = p.noteId ? findNote(d, p.noteId) : undefined;
    const ids = n
      ? new Set([
          ...n.blocks.flatMap((id) => blockAssetIds(findBlock(d, id))),
          ...(n.icon?.type === "image" ? [n.icon.asset] : []),
        ])
      : undefined;
    return {
      ...meta,
      ...page(
        d.assets.filter((a) => !ids || ids.has(a.id)),
        p,
      ),
    };
  }
  if (name === "search") {
    if (p.noteId) findNote(d, p.noteId);
    const q = p.query.toLocaleLowerCase();
    const hits: unknown[] = [];
    for (const n of d.notes.filter((n) => !p.noteId || n.id === p.noteId)) {
      if (!p.blockType && n.title.toLocaleLowerCase().includes(q))
        hits.push({
          noteId: n.id,
          title: n.title,
          kind: "title",
          snippet: n.title,
        });
      for (const id of n.blocks) {
        const b = findBlock(d, id);
        if (p.blockType && b.type !== p.blockType) continue;
        const source = blockText(b),
          at = source.toLocaleLowerCase().indexOf(q);
        if (at >= 0)
          hits.push({
            noteId: n.id,
            title: n.title,
            blockId: id,
            kind: b.type,
            offset: at,
            snippet: source.slice(Math.max(0, at - 80), at + q.length + 160),
          });
      }
    }
    return { ...meta, ...page(hits, p) };
  }
  if (name === "get_references") {
    const n = findNote(d, p.noteId),
      items: unknown[] = [];
    for (const owner of d.notes)
      for (const id of owner.blocks) {
        const b = findBlock(d, id);
        if (b.type === "note-reference" && b.documentId === d.id) {
          if (b.noteId === n.id && p.direction !== "outgoing")
            items.push({
              kind: "link",
              direction: "incoming",
              noteId: owner.id,
              blockId: id,
            });
          if (owner.id === n.id && p.direction !== "incoming")
            items.push({
              kind: "link",
              direction: "outgoing",
              noteId: b.noteId,
              blockId: id,
              exists: d.notes.some((x) => x.id === b.noteId),
            });
        }
        if (owner.id !== n.id && n.blocks.includes(id))
          items.push({ kind: "shared-block", noteId: owner.id, blockId: id });
      }
    return { ...meta, ...page(items, p) };
  }
  return undefined;
}
export type Collection =
  "notes" | "blocks" | "assets" | "placements" | "connectors";
export interface ObjectChange {
  collection: Collection;
  id: string;
  before?: any;
  after?: any;
  beforeIndex: number;
  afterIndex: number;
}
const collections: Collection[] = [
  "notes",
  "blocks",
  "assets",
  "placements",
  "connectors",
];
function collection(d: CanvasDocument, k: Collection): any[] {
  return k === "placements"
    ? d.board.placements
    : k === "connectors"
      ? (d.board.connectors ?? [])
      : d[k];
}
export function documentChanges(
  before: CanvasDocument,
  after: CanvasDocument,
): ObjectChange[] {
  return collections.flatMap((k) => {
    const a = collection(before, k),
      b = collection(after, k),
      ids = new Set([...a, ...b].map((x) => x.id));
    return [...ids].flatMap((id) => {
      const ai = a.findIndex((x) => x.id === id),
        bi = b.findIndex((x) => x.id === id),
        av = a[ai],
        bv = b[bi];
      // Only note ordering is semantic; block storage order has no display meaning.
      return !same(av, bv) || (k === "notes" && ai !== bi)
        ? [
            {
              collection: k,
              id,
              ...(av ? { before: av } : {}),
              ...(bv ? { after: bv } : {}),
              beforeIndex: ai,
              afterIndex: bi,
            },
          ]
        : [];
    });
  });
}
export function reverseChanges(input: CanvasDocument, changes: ObjectChange[]) {
  const d = structuredClone(input);
  for (const c of changes) {
    const rows = collection(d, c.collection),
      current = rows.find((x) => x.id === c.id);
    if (!same(current, c.after))
      fail(
        `RESTORE_CONFLICT: ${c.collection}/${c.id} changed after this transaction.`,
      );
    // Explicitly reject reorder races instead of silently guessing a new sibling position.
    if (
      c.collection === "notes" &&
      c.after &&
      rows.findIndex((x) => x.id === c.id) !== c.afterIndex
    )
      fail("RESTORE_CONFLICT: Note order changed.");
  }
  for (const k of collections) {
    const relevant = changes.filter((c) => c.collection === k);
    let rows = collection(d, k).filter(
      (x) => !relevant.some((c) => c.id === x.id),
    );
    for (const c of relevant
      .filter((c) => c.before)
      .sort((a, b) => a.beforeIndex - b.beforeIndex))
      rows.splice(
        Math.min(c.beforeIndex, rows.length),
        0,
        structuredClone(c.before),
      );
    if (k === "placements") d.board.placements = rows;
    else if (k === "connectors") {
      if (rows.length || d.board.connectors) d.board.connectors = rows;
    } else (d[k] as unknown[]) = rows;
  }
  d.revision = input.revision + 1;
  return parseCanvasDocument(d);
}
