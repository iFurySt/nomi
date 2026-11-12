import type { CanvasDocument } from "@nomi/core";
export function automationContext(
  doc: CanvasDocument,
  includeSelection: boolean,
  characters: number,
) {
  const route = location.hash.split("?")[0];
  const requested = new URLSearchParams(location.hash.split("?")[1]).get(
    "note",
  );
  const active =
    route === "#/notes"
      ? (doc.notes.find(
          (n) =>
            n.id ===
            (requested ??
              localStorage.getItem("nomi:notes:local-device:selected")),
        ) ?? doc.notes[0])
      : undefined;
  const context: Record<string, unknown> = {
    view: route,
    activeNote: active ? { id: active.id, title: active.title } : null,
  };
  if (!includeSelection || !active) return context;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return { ...context, selection: null };
  const range = selection.getRangeAt(0),
    start =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
  const element = start?.closest<HTMLElement>("[data-writing-block]"),
    blockId = element?.dataset.writingBlock;
  if (!element || !blockId || !active.blocks.includes(blockId))
    return { ...context, selection: null };
  const preceding = range.cloneRange();
  preceding.selectNodeContents(element);
  preceding.setEnd(range.startContainer, range.startOffset);
  const following = range.cloneRange();
  following.selectNodeContents(element);
  // Multi-block selections may extend beyond this node: report the selection, with bounded context at its first block.
  const endElement =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer as Element)
      : range.endContainer.parentElement;
  const endBlock = endElement?.closest<HTMLElement>("[data-writing-block]");
  const endId = endBlock?.dataset.writingBlock;
  let after = "";
  if (endBlock && endId && active.blocks.includes(endId)) {
    following.selectNodeContents(endBlock);
    following.setStart(range.endContainer, range.endOffset);
    after = following.toString().slice(0, characters);
  }
  const selected = range.toString();
  return {
    ...context,
    selection: {
      format: "plain-text",
      blockId,
      endBlockId: endId ?? blockId,
      collapsed: range.collapsed,
      text: selected.slice(0, 20000),
      truncated: selected.length > 20000,
      before: characters ? preceding.toString().slice(-characters) : "",
      after,
    },
  };
}
export async function openAutomationNote(noteId: string, blockId?: string) {
  location.hash = `/notes?note=${encodeURIComponent(noteId)}`;
  if (blockId) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const block = document.querySelector<HTMLElement>(
        `[data-writing-block="${CSS.escape(blockId)}"]`,
      );
      if (block) {
        block.scrollIntoView({ block: "center" });
        return { opened: true, noteId, blockId };
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("NAVIGATION_TIMEOUT: Note opened, but block has not mounted.");
  }
  return { opened: true, noteId };
}
