import { lazy, Suspense, useState } from "react";
import type { EmbeddedCanvasBlock as Block } from "@nomi/core";
import { CanvasDocumentScope, useCanvasDocument } from "./useCanvasDocument";
import { useEmbeddedCanvas } from "./useEmbeddedCanvas";
import { CanvasScenePreview } from "./CanvasScenePreview";
import { CanvasContent } from "./CanvasContent";
import { Modal } from "../components/primitives";
const Editor = lazy(() =>
  import("../pages/Canvas").then((m) => ({ default: m.CanvasWorkspace })),
);

export function EmbeddedCanvasBlock({
  block,
  profile,
}: {
  block: Block;
  profile: string;
}) {
  const parent = useCanvasDocument(profile);
  const data = useEmbeddedCanvas(parent, block);
  const [open, setOpen] = useState(false);
  const close = () => {
    parent.endGroup();
    void parent.flush();
    setOpen(false);
  };
  const scope = `${profile}:canvas:${parent.document?.id}:${block.id}`;
  return (
    <>
      <div
        className="embedded-canvas-block"
        data-embedded-canvas={block.id}
        tabIndex={0}
        role="button"
        aria-label="画布，双击编辑"
        title="双击编辑画布"
        onDoubleClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <CanvasScenePreview
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
        <span className="embedded-canvas-hint">双击编辑</span>
      </div>
      {open && (
        <Modal
          open
          title={block.scene.title}
          className="embedded-canvas-modal"
          keepEscape
          hideHeader
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
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
