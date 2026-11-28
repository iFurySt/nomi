import {
  LIBRARY_DOCUMENT_BYTES,
  LIBRARY_COLLECTION_ITEMS,
  type CanvasDocument,
} from "./document";
import type { MarkdownChange } from "../document-storage";

const encoder = new TextEncoder();
const jsonBytes = (value: unknown) =>
  encoder.encode(JSON.stringify(value)).length;

/** Index an already validated, immutable document. Text edits cannot change identities,
 * references, extension fields or collection bounds. Track the JSON budget by difference. */
export class MarkdownEdits {
  private readonly positions: Map<string, number>;
  private bytes: number;
  constructor(public document: CanvasDocument) {
    this.positions = new Map(
      document.blocks.map((block, index) => [block.id, index]),
    );
    this.bytes = jsonBytes(document);
  }
  apply(revision: number, changes: MarkdownChange[]) {
    const previous = this.document;
    if (
      !Number.isSafeInteger(revision) ||
      revision <= previous.revision ||
      !Array.isArray(changes) ||
      !changes.length ||
      changes.length > LIBRARY_COLLECTION_ITEMS
    )
      throw Error("正文保存请求无效。");
    let bytes =
      this.bytes + String(revision).length - String(previous.revision).length;
    const blocks = previous.blocks.slice();
    for (const { id, source } of changes) {
      const position = this.positions.get(id);
      const block = position === undefined ? undefined : blocks[position];
      if (
        position === undefined ||
        block?.type !== "markdown" ||
        typeof source !== "string" ||
        source.length > 200000
      )
        throw Error("正文块无效。");
      if (block.source === source) continue;
      bytes += jsonBytes(source) - jsonBytes(block.source);
      blocks[position] = { ...block, source };
    }
    if (bytes > LIBRARY_DOCUMENT_BYTES) throw Error("文档超过 JSON 大小限制。");
    this.bytes = bytes;
    this.document = { ...previous, blocks, revision };
    return this.document;
  }
}
