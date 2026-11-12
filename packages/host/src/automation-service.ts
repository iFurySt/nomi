import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { atomicFile, regularFile, directory } from "./document-files";
import {
  applyOperations,
  canonicalJSON,
  documentChanges,
  reverseChanges,
  readDocumentTool,
  page,
  findNote,
  type ObjectChange,
} from "../../core/src/automation/document";
import {
  mutationTools,
  parseTool,
  type Operation,
} from "../../core/src/automation/contract";
import {
  parseCanvasDocument,
  type CanvasDocument,
} from "../../core/src/canvas/index";
import type { DocumentAssetBytes } from "../../core/src/document-storage";
import { importAsset, importNote, exportNote } from "./automation-files";
export interface AutomationSnapshot {
  document: CanvasDocument;
  context: Record<string, unknown>;
}
export interface AutomationSession {
  snapshot(
    includeSelection?: boolean,
    surroundingCharacters?: number,
  ): Promise<AutomationSnapshot>;
  commit(
    document: CanvasDocument,
    expectedRevision: number,
    assets: DocumentAssetBytes[],
  ): Promise<void>;
  asset(id: string): Promise<Uint8Array>;
  open(noteId: string, blockId?: string): Promise<unknown>;
}
export interface AutomationRecord {
  id: string;
  requestId: string;
  fingerprint: string;
  workspaceId: string;
  tool: string;
  time: string;
  status: "pending" | "committed" | "failed";
  error?: string;
  revision: number;
  changes: ObjectChange[];
  result: unknown;
  restores?: string;
}
export class AutomationService {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private options: {
      session: AutomationSession;
      journalDirectory: string;
      libraryPath: () => Promise<string>;
      decodeImage?: (bytes: Uint8Array) => boolean;
    },
  ) {}
  call(name: string, input: unknown): Promise<unknown> {
    const run = this.tail.then(() => this.execute(name, input));
    this.tail = run.catch(() => {});
    return run;
  }
  private async scope() {
    const path = await this.options.libraryPath();
    const workspaceId =
      "workspace_" +
      createHash("sha256").update(path).digest("hex").slice(0, 32);
    const folder = join(this.options.journalDirectory, workspaceId);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await directory(folder);
    return { workspaceId, folder };
  }
  private key(requestId: string) {
    return createHash("sha256").update(requestId).digest("hex") + ".json";
  }
  private async records(folder: string) {
    const records: AutomationRecord[] = [];
    for (const file of await readdir(folder))
      if (/^[a-f0-9]{64}\.json$/.test(file))
        records.push(
          JSON.parse(
            (await regularFile(join(folder, file), 8 * 1024 * 1024)).toString(),
          ),
        );
    return records.sort((a, b) => b.time.localeCompare(a.time));
  }
  private async execute(name: string, input: unknown): Promise<unknown> {
    const p = parseTool(name, input),
      scope = await this.scope(),
      s = this.options.session;
    if (name !== "get_context" && p.workspaceId !== scope.workspaceId)
      throw Error(
        "WORKSPACE_MISMATCH: Call get_context after switching libraries.",
      );
    const fingerprint = createHash("sha256")
      .update(canonicalJSON({ name, p })!)
      .digest("hex");
    const recordPath = mutationTools.has(name)
      ? join(scope.folder, this.key(p.requestId))
      : undefined;
    if (recordPath) {
      let previous: AutomationRecord | undefined;
      try {
        previous = JSON.parse(
          (await regularFile(recordPath, 8 * 1024 * 1024)).toString(),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw Error(
            "IDEMPOTENCY_CONFLICT: requestId was used for different arguments.",
          );
        if (previous.status === "failed") throw Error(previous.error);
        if (previous.status === "pending") {
          const snapshot = await s.snapshot();
          if ((snapshot.document as any).automationReceipt !== previous.id)
            throw Error(
              "UNCERTAIN_CHANGE: Inspect get_change before submitting a new request; the old request will not be applied twice.",
            );
          previous.status = "committed";
          await atomicFile(recordPath, JSON.stringify(previous));
        }
        return previous.result;
      }
    }
    const snapshot = await s.snapshot(
        p.includeSelection,
        p.surroundingCharacters,
      ),
      d = parseCanvasDocument(snapshot.document);
    if ((await this.scope()).workspaceId !== scope.workspaceId)
      throw Error("WORKSPACE_MISMATCH: Library changed during request.");
    const meta = { workspaceId: scope.workspaceId, revision: d.revision };
    if (name === "get_context")
      return {
        ...snapshot.context,
        ...meta,
        documentId: d.id,
        capabilities: {
          protocol: "nomi-local-tools/1",
          maxOperations: 100,
        },
      };
    const read = readDocumentTool(d, name, { ...p, workspaceId: d.id });
    if (read !== undefined)
      return { ...(read as object), workspaceId: scope.workspaceId };
    if (name === "open_note") {
      const n = findNote(d, p.noteId);
      if (p.blockId && !n.blocks.includes(p.blockId))
        throw Error("NOT_FOUND: Block is not in this note.");
      return { ...meta, ...((await s.open(p.noteId, p.blockId)) as object) };
    }
    if (name === "read_asset") {
      const a = d.assets.find((a) => a.id === p.assetId);
      if (!a) throw Error("NOT_FOUND: Attachment does not exist.");
      const bytes = await s.asset(a.id),
        end = Math.min(bytes.length, p.offset + p.length);
      if (p.offset > bytes.length)
        throw Error("INVALID_OFFSET: Beyond attachment length.");
      return {
        ...meta,
        asset: a,
        offset: p.offset,
        base64: Buffer.from(bytes.subarray(p.offset, end)).toString("base64"),
        nextOffset: end < bytes.length ? end : null,
      };
    }
    if (name === "export_note") {
      const library = resolve(await this.options.libraryPath()),
        targetPath = resolve(p.path);
      if (targetPath === library || targetPath.startsWith(library + sep))
        throw Error(
          "INVALID_DESTINATION: Export outside the active Nomi library.",
        );
      return { ...meta, ...(await exportNote(d, p, (id) => s.asset(id))) };
    }
    const records =
      p.changeId || name === "list_changes" || name === "list_trash"
        ? await this.records(scope.folder)
        : [];
    if (name === "list_changes" || name === "list_trash") {
      const restored = new Set(
        records
          .filter((r) => r.status === "committed" && r.restores)
          .map((r) => r.restores),
      );
      const filtered =
        name === "list_trash"
          ? records.filter(
              (r) =>
                r.status === "committed" &&
                !restored.has(r.id) &&
                r.changes.some(
                  (c) =>
                    c.collection === "notes" &&
                    c.before &&
                    !c.after &&
                    !d.notes.some((n) => n.id === c.id),
                ),
            )
          : records;
      return {
        ...meta,
        ...page(
          filtered.map(({ changes, ...r }) => ({
            ...r,
            affected: changes.map((c) => ({
              collection: c.collection,
              id: c.id,
              deleted: !!c.before && !c.after,
            })),
          })),
          p,
        ),
      };
    }
    const target = p.changeId
      ? records.find((r) => r.id === p.changeId)
      : undefined;
    if (p.changeId && !target)
      throw Error("NOT_FOUND: Change does not exist in this workspace.");
    if (name === "get_change") return { ...meta, change: target };
    if (!mutationTools.has(name)) throw Error("UNKNOWN_TOOL");
    if (p.expectedRevision !== d.revision)
      throw Error(
        `REVISION_CONFLICT: Expected ${p.expectedRevision}, current ${d.revision}. Re-read before editing.`,
      );
    let after: CanvasDocument,
      assets: DocumentAssetBytes[] = [],
      detail: unknown;
    if (name === "restore_note" || name === "revert_change") {
      if (target!.status !== "committed")
        throw Error(
          "UNCOMMITTED_CHANGE: Cannot restore an uncommitted transaction.",
        );
      if (
        name === "restore_note" &&
        !target!.changes.some(
          (c) => c.collection === "notes" && c.before && !c.after,
        )
      )
        throw Error("INVALID_RESTORE: Change did not delete a note.");
      after = reverseChanges(d, target!.changes);
      detail = { restoredChangeId: target!.id };
    } else if (name === "import_asset" || name === "import_note") {
      const imported =
        name === "import_asset"
          ? await importAsset(d, p, this.options.decodeImage)
          : await importNote(d, p);
      after = imported.document;
      assets = imported.assets;
      detail = imported.result;
    } else {
      const {
        workspaceId: _w,
        expectedRevision: _r,
        requestId: _i,
        ...args
      } = p;
      const applied = applyOperations(
        d,
        name === "apply_changes"
          ? p.operations
          : [{ ...args, type: name } as Operation],
      );
      after = applied.document;
      detail = { operations: applied.results };
    }
    const id = "change_" + randomUUID();
    (after as any).automationReceipt = id;
    const result = {
      workspaceId: scope.workspaceId,
      revision: after.revision,
      changeId: id,
      ...(detail as object),
    };
    const record: AutomationRecord = {
      id,
      requestId: p.requestId,
      fingerprint,
      workspaceId: scope.workspaceId,
      tool: name,
      time: new Date().toISOString(),
      status: "pending",
      revision: after.revision,
      changes: documentChanges(d, after),
      result,
      ...(target ? { restores: target.id } : {}),
    };
    await atomicFile(recordPath!, JSON.stringify(record));
    if ((await this.scope()).workspaceId !== scope.workspaceId)
      throw Error("WORKSPACE_MISMATCH: Library changed before commit.");
    try {
      await s.commit(after, d.revision, assets);
    } catch (e) {
      // A persistence/transport failure can occur after the edit was installed. Never blindly retry it.
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.startsWith("REVISION_CONFLICT") ||
        message.startsWith("INVALID_COMMIT")
      ) {
        record.status = "failed";
        record.error = message;
        await atomicFile(recordPath!, JSON.stringify(record));
      }
      throw e;
    }
    record.status = "committed";
    await atomicFile(recordPath!, JSON.stringify(record));
    return result;
  }
}
