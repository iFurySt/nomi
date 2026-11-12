import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-zA-Z][\w.-]{0,95}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
const text = z.string().max(200000);
const page = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(30),
};
const block = z
  .record(z.string(), z.unknown())
  .describe(
    "Typed Nomi block. Insert may omit id; markdown requires type:'markdown', source:string. Other types preserve their native JSON.",
  );
const icon = z.union([
  z.object({ type: z.literal("emoji"), value: z.string().max(64) }).strict(),
  z.object({ type: z.literal("image"), asset: id }).strict(),
]);
export const operationSchemas = {
  create_note: z
    .object({
      title: z.string().max(200),
      noteId: id.optional(),
      parentId: id.optional(),
      markdown: text.optional(),
    })
    .strict(),
  update_note: z
    .object({
      noteId: id,
      title: z.string().max(200).optional(),
      icon: icon.nullable().optional(),
    })
    .strict(),
  move_note: z
    .object({
      noteId: id,
      parentId: id.nullable(),
      beforeNoteId: id.optional(),
    })
    .strict(),
  trash_note: z.object({ noteId: id, includeChildren: z.boolean() }).strict(),
  insert_blocks: z
    .object({
      noteId: id,
      blocks: z.array(block).min(1).max(100),
      beforeBlockId: id.optional(),
    })
    .strict(),
  update_block: z
    .object({ blockId: id, block, allowShared: z.boolean().default(false) })
    .strict(),
  move_blocks: z
    .object({
      noteId: id,
      targetNoteId: id,
      blockIds: z.array(id).min(1).max(100),
      beforeBlockId: id.optional(),
    })
    .strict(),
  remove_blocks: z
    .object({ noteId: id, blockIds: z.array(id).min(1).max(100) })
    .strict(),
  edit_text: z
    .object({
      blockId: id,
      oldText: text.min(1),
      newText: text,
      allowShared: z.boolean().default(false),
    })
    .strict(),
};
export type OperationName = keyof typeof operationSchemas;
export type Operation = {
  [K in OperationName]: { type: K } & z.infer<(typeof operationSchemas)[K]>;
}[OperationName];
export const operationSchema = z.union(
  Object.entries(operationSchemas).map(([type, schema]) =>
    schema.extend({ type: z.literal(type) }),
  ) as unknown as [
    z.ZodType<Operation>,
    z.ZodType<Operation>,
    ...z.ZodType<Operation>[],
  ],
);
const mutation = {
  workspaceId: id,
  expectedRevision: z.number().int().min(1),
  requestId: z.string().min(1).max(128),
};
const readScope = { workspaceId: id };
export const toolSchemas = {
  get_context: z
    .object({
      includeSelection: z.boolean().default(false),
      surroundingCharacters: z.number().int().min(0).max(4000).default(1500),
    })
    .strict(),
  search: z
    .object({
      ...readScope,
      query: z.string().min(1).max(1000),
      noteId: id.optional(),
      blockType: z.string().max(30).optional(),
      ...page,
    })
    .strict(),
  list_notes: z
    .object({ ...readScope, parentId: id.nullable().optional(), ...page })
    .strict(),
  get_note: z
    .object({
      ...readScope,
      noteId: id,
      includeBlocks: z.boolean().default(false),
    })
    .strict(),
  list_blocks: z.object({ ...readScope, noteId: id, ...page }).strict(),
  get_block: z.object({ ...readScope, blockId: id }).strict(),
  ...Object.fromEntries(
    Object.entries(operationSchemas).map(([name, schema]) => [
      name,
      schema.extend(mutation),
    ]),
  ),
  apply_changes: z
    .object({
      ...mutation,
      operations: z.array(operationSchema).min(1).max(100),
    })
    .strict(),
  open_note: z
    .object({ ...readScope, noteId: id, blockId: id.optional() })
    .strict(),
  list_trash: z.object({ ...readScope, ...page }).strict(),
  restore_note: z.object({ ...mutation, changeId: id }).strict(),
  list_changes: z.object({ ...readScope, ...page }).strict(),
  get_change: z.object({ ...readScope, changeId: id }).strict(),
  revert_change: z.object({ ...mutation, changeId: id }).strict(),
  get_references: z
    .object({
      ...readScope,
      noteId: id,
      direction: z.enum(["incoming", "outgoing", "both"]).default("both"),
      ...page,
    })
    .strict(),
  list_assets: z
    .object({ ...readScope, noteId: id.optional(), ...page })
    .strict(),
  read_asset: z
    .object({
      ...readScope,
      assetId: id,
      offset: z.number().int().min(0).default(0),
      length: z.number().int().min(1).max(262144).default(65536),
    })
    .strict(),
  import_asset: z
    .object({
      ...mutation,
      path: z.string().min(1).max(4096),
      noteId: id,
      beforeBlockId: id.optional(),
      display: z.enum(["file", "image"]).default("file"),
    })
    .strict(),
  import_note: z
    .object({
      ...mutation,
      path: z.string().min(1).max(4096),
      format: z.enum(["markdown", "nomi"]),
      title: z.string().max(200).optional(),
      parentId: id.optional(),
    })
    .strict(),
  export_note: z
    .object({
      ...readScope,
      noteId: id,
      path: z.string().min(1).max(4096),
      format: z.enum(["markdown", "nomi"]),
      includeChildren: z.boolean().default(false),
    })
    .strict(),
} as Record<string, z.ZodType>;
export const descriptions: Record<string, string> = {
  get_context:
    "Get active local workspace identity/revision and visible note. Selection and nearby text only when requested. Call first; never infer a workspace ID.",
  search:
    "Search note titles and block text. Returns IDs, snippets and revision; results are paginated.",
  list_notes:
    "List notes; parentId:null lists roots, omitted lists all. Pagination uses offset/limit.",
  get_note:
    "Read a note's metadata, child IDs and ordered block IDs; optionally include native blocks.",
  list_blocks:
    "Read a note's ordered native blocks, paginated. A markdown block may contain multiple paragraphs.",
  get_block:
    "Read a native block and all note/board references. Use edit_text for a small markdown change.",
  create_note:
    "Create a note, optionally under a parent, with initial markdown. Returns created IDs.",
  update_note:
    "Update note title/icon. Null icon removes it; unspecified fields are preserved.",
  move_note:
    "Move a note and its descendants; parentId:null means root. Optionally place before a sibling.",
  trash_note:
    "Move a note to recoverable local trash. Explicitly set includeChildren; false rejects nonempty subtrees.",
  insert_blocks:
    "Insert native blocks into a note, beforeBlockId or append. Omit IDs to allocate new IDs.",
  update_block:
    "Replace native block content, preserving identity. Shared content requires allowShared:true.",
  move_blocks:
    "Move ordered block references between notes or reorder them; preserve other references.",
  remove_blocks:
    "Remove blocks from this note; preserve shared/board references. Change can be reverted.",
  edit_text:
    "Replace one exact unique nonempty markdown substring. Ambiguous or missing matches fail; no regex.",
  apply_changes:
    "Apply up to 100 typed operations atomically with one revision and one undo entry. IDs may be supplied for dependent operations.",
  open_note:
    "Navigate the desktop to a note and optionally scroll to a block. Does not alter content.",
  list_trash:
    "List recoverable note deletion changes, including deletion inside batches. Restore uses changeId.",
  restore_note:
    "Restore the entire deletion transaction identified by changeId, including other operations in that batch. Reject conflicts and preserve unrelated later edits.",
  list_changes:
    "List this workspace's persistent agent transactions and their affected IDs, newest first.",
  get_change: "Read before/after object differences for one agent transaction.",
  revert_change:
    "Reverse only this transaction's affected objects. Reject same-object changes; preserve unrelated edits.",
  get_references:
    "Read explicit note-reference links and shared block references, incoming/outgoing/both.",
  list_assets:
    "List immutable attachment metadata, optionally scoped to one note.",
  read_asset:
    "Read an attachment by ID as a bounded base64 chunk. No filesystem path access.",
  import_asset:
    "Import an explicitly supplied absolute local file into a note. Maximum 20 MiB; no remote fetch. Image mode validates raster bytes.",
  import_note:
    "Import an explicit absolute .md file or .nomi directory package. Allocate independent identities and preserve the source.",
  export_note:
    "Export into a NEW absolute destination directory, without overwrite. Markdown includes native companion package and assets; nomi preserves typed content. Optional descendants.",
};
export const readOnlyTools = new Set([
  "get_context",
  "search",
  "list_notes",
  "get_note",
  "list_blocks",
  "get_block",
  "list_trash",
  "list_changes",
  "get_change",
  "get_references",
  "list_assets",
  "read_asset",
]);
export const mutationTools = new Set([
  ...Object.keys(operationSchemas),
  "apply_changes",
  "restore_note",
  "revert_change",
  "import_asset",
  "import_note",
]);
export function parseTool(name: string, input: unknown): any {
  const schema = toolSchemas[name];
  if (!schema) throw Error("UNKNOWN_TOOL: Unknown Nomi tool.");
  return schema.parse(input ?? {});
}
