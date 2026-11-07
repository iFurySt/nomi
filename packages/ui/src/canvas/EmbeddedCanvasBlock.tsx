import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  type PointerEvent,
} from "react";
import type { EmbeddedCanvasBlock as Block } from "@nomi/core";
import { CanvasDocumentScope, useCanvasDocument } from "./useCanvasDocument";
import { useEmbeddedCanvas } from "./useEmbeddedCanvas";
import { CanvasScenePreview } from "./CanvasScenePreview";
import { CanvasContent } from "./CanvasContent";
import { Pencil, ZoomIn, ZoomOut, Scan, Download } from "lucide-react";
import { createNoteArchive, downloadFile } from "../writing/exportNote";
import { Modal } from "../components/primitives";
const Editor = lazy(() =>
  import("../pages/Canvas").then((m) => ({ default: m.CanvasWorkspace })),
);

export function EmbeddedCanvasBlock({
  block,
  profile,
  autoOpen = false,
  onAutoOpened,
}: {
  block: Block;
  profile: string;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const parent = useCanvasDocument(profile);
  const data = useEmbeddedCanvas(parent, block);
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);
  const host = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Block["preview"]>();
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const resize = useRef<{
    pointer: number;
    x: number;
    y: number;
    width: number;
    height: number;
    available: number;
    side: string;
    next?: Block["preview"];
  } | null>(null);
  const preview = draft ?? block.preview;
  const savePreview = (value: Block["preview"]) => {
    const latest = parent.current.current?.blocks.find(
      (b) => b.id === block.id,
    );
    if (latest?.type !== "canvas") return;
    if (JSON.stringify(latest.preview) === JSON.stringify(value)) return;
    parent.endGroup();
    const next = { ...latest };
    if (value) next.preview = value;
    else delete next.preview;
    parent.edit([{ type: "set_canvas", block: next }]);
    parent.endGroup();
  };
  const beginResize = (
    event: PointerEvent<HTMLButtonElement>,
    side: string,
  ) => {
    if (event.button !== 0 || !host.current) return;
    event.preventDefault();
    event.stopPropagation();
    host.current.focus({ preventScroll: true });
    const rect = host.current.getBoundingClientRect();
    resize.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height - 2,
      available: host.current.parentElement!.clientWidth,
      side,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ width: block.preview?.width ?? 100, height: rect.height - 2 });
  };
  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    const r = resize.current;
    if (!r || r.pointer !== event.pointerId) return;
    const dx = event.clientX - r.x,
      dy = event.clientY - r.y;
    const width = Math.max(
      20,
      Math.min(
        100,
        ((r.width +
          (r.side.includes("e")
            ? dx * 2
            : r.side.includes("w")
              ? -dx * 2
              : 0)) /
          r.available) *
          100,
      ),
    );
    const height = Math.max(
      160,
      Math.min(
        1200,
        r.height + (r.side.includes("s") ? dy : r.side.includes("n") ? -dy : 0),
      ),
    );
    r.next = { width, height };
    setDraft(r.next);
  };
  const finishResize = (commit: boolean) => {
    const next = resize.current?.next;
    resize.current = null;
    setDraft(undefined);
    if (commit && next) savePreview(next);
  };
  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      const document = {
        ...block.scene,
        notes: [
          { id: "note.export", title: block.scene.title, blocks: [block.id] },
        ],
        blocks: [block],
        board: { id: "board.export", placements: [], connectors: [] },
      };
      const archive = await createNoteArchive(
        document,
        "note.export",
        {
          format: "markdown",
          slug: "canvas",
          date: new Date().toISOString().slice(0, 10),
          lang: "zh",
          tags: [],
        },
        parent.repository,
      );
      downloadFile(archive.bytes, `${block.scene.title || "画布"}.zip`);
    } catch {
      setError("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  };
  const close = () => {
    parent.endGroup();
    void parent.flush();
    setOpen(false);
  };
  const scope = `${profile}:canvas:${parent.document?.id}:${block.id}`;
  return (
    <>
      <div
        ref={host}
        className={`embedded-canvas-block${draft ? " is-resizing" : ""}`}
        style={{ width: `${preview?.width ?? 100}%` }}
        data-embedded-canvas={block.id}
        tabIndex={0}
        role="group"
        aria-label="画布，双击编辑"
        onDoubleClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && resize.current) {
            event.preventDefault();
            event.stopPropagation();
            finishResize(false);
            return;
          }
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <div
          className="embedded-canvas-controls"
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="embedded-canvas-toolbar"
            role="toolbar"
            aria-label="画布预览操作"
          >
            <button
              type="button"
              aria-label="编辑画布"
              onClick={() => setOpen(true)}
            >
              <Pencil size={16} />
              <span>编辑</span>
            </button>
            <button
              type="button"
              aria-label="下载画布"
              title="下载画布"
              disabled={downloading}
              onClick={() => void download()}
            >
              <Download size={16} />
            </button>
            <span className="embedded-canvas-separator" />
            <button
              type="button"
              aria-label="缩小画布预览"
              title="缩小"
              disabled={
                zoom <= 0.25 ||
                (!block.scene.board.placements.length &&
                  !block.scene.board.connectors?.length)
              }
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            >
              <ZoomOut size={17} />
            </button>
            <button
              type="button"
              className="embedded-canvas-zoom"
              aria-label="适应画布预览"
              title="适应画布"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="放大画布预览"
              title="放大"
              disabled={
                zoom >= 3 ||
                (!block.scene.board.placements.length &&
                  !block.scene.board.connectors?.length)
              }
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            >
              <ZoomIn size={17} />
            </button>
            <span className="embedded-canvas-separator" />
            <button
              type="button"
              aria-label="恢复画布自动尺寸"
              title="自动尺寸"
              onClick={() => {
                setZoom(1);
                savePreview(undefined);
              }}
            >
              <Scan size={17} />
            </button>
          </div>
          {error && (
            <span role="alert" className="embedded-canvas-error">
              {error}
            </span>
          )}
        </div>
        {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((side) => (
          <button
            key={side}
            type="button"
            className={`embedded-canvas-resize resize-${side}`}
            data-resize={side}
            aria-label={`调整画布尺寸 ${side}`}
            tabIndex={-1}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => beginResize(e, side)}
            onPointerMove={moveResize}
            onPointerUp={(e) => {
              e.stopPropagation();
              finishResize(true);
            }}
            onPointerCancel={() => finishResize(false)}
            onLostPointerCapture={() => finishResize(false)}
          />
        ))}
        <CanvasScenePreview
          viewportHeight={preview?.height}
          zoom={zoom}
          scene={block.scene}
          content={(id) => (
            <CanvasContent
              document={block.scene}
              contentId={id}
              profile={scope}
              repository={parent.repository}
              editing={false}
              onEdit={() => {}}
              onAttach={() => {}}
              onInteractive={() => {}}
              endGroup={() => {}}
            />
          )}
        />
      </div>
      {open && (
        <Modal
          open
          title={block.scene.title}
          className="embedded-canvas-modal"
          keepEscape
          hideHeader
          initialFocus=".canvas-viewport"
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <div className="embedded-canvas-window-drag" aria-hidden="true" />
          <CanvasDocumentScope value={data}>
            <Suspense
              fallback={
                <div className="embedded-canvas-loading">正在打开画布…</div>
              }
            >
              <Editor profile={scope} embedded onClose={close} />
            </Suspense>
          </CanvasDocumentScope>
        </Modal>
      )}
    </>
  );
}
