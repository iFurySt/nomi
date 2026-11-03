import { useRef } from "react";
import {
  applyCanvasCommands,
  type CanvasDocument,
  type EmbeddedCanvasBlock,
} from "@nomi/core";
import { type CanvasDocumentData } from "./useCanvasDocument";

/** Adapt the existing editor to one scene; all writes and history remain in the parent session. */
export function useEmbeddedCanvas(
  parent: CanvasDocumentData,
  block: EmbeddedCanvasBlock,
): CanvasDocumentData {
  const current = useRef<CanvasDocument | undefined>(block.scene);
  current.current = block.scene;
  const latest = () => {
    const b = parent.current.current?.blocks.find((b) => b.id === block.id);
    if (b?.type !== "canvas") throw Error("画布块已不存在。");
    return b;
  };
  const write = (
    scene: CanvasDocument,
    group?: string,
    assets: Parameters<CanvasDocumentData["edit"]>[2] = [],
    options?: Parameters<CanvasDocumentData["edit"]>[3],
  ) => {
    const b = latest();
    const result = parent.edit(
      [{ type: "set_canvas", block: { ...b, scene } }],
      group ? `${block.id}:${group}` : undefined,
      assets,
      options,
    );
    const updated = result.blocks.find(
      (b) => b.id === block.id,
    ) as EmbeddedCanvasBlock;
    current.current = updated.scene;
    return updated.scene;
  };
  return {
    ...parent,
    document: block.scene,
    current,
    edit: (commands, group, assets, options) => {
      const before = latest().scene;
      return write(
        applyCanvasCommands(before, before.revision, commands),
        group,
        assets,
        options,
      );
    },
    replace: (scene, expectedRevision) => {
      const before = latest().scene;
      if (before.revision !== expectedRevision || before.id !== scene.id)
        throw Error("画布已改变，请重新读取。");
      for (const a of scene.assets)
        if (
          !before.assets.some(
            (p) =>
              p.id === a.id &&
              p.sha256 === a.sha256 &&
              p.bytes === a.bytes &&
              p.mime === a.mime,
          )
        )
          throw Error("请先添加附件原件，再引用它。");
      write({ ...scene, revision: before.revision + 1 });
    },
  };
}
