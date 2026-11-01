import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import { createCanvasDocument } from "@nomi/core";
import {
  createCanvasRepository,
  createIndexedDBCanvasRepository,
  canvasAssetDigest,
} from "@nomi/platform";
import "../../packages/ui/src/styles.css";
async function start() {
  const legacy = createIndexedDBCanvasRepository("local-device");
  if (!(await legacy.load())) {
    const document = createCanvasDocument();
    document.notes[0].title = "目录迁移验证";
    const blob = new Blob(["original attachment"], { type: "text/plain" });
    const asset = {
      id: "asset.directory-test",
      name: "original.txt",
      mime: blob.type,
      bytes: blob.size,
      sha256: await canvasAssetDigest(blob),
    };
    document.assets.push(asset);
    document.blocks.push({
      id: "block.directory-asset",
      type: "file",
      asset: asset.id,
    });
    document.notes[0].blocks.push("block.directory-asset");
    await legacy.save(document, [{ asset, blob }], null);
  }
  Object.assign(window, {
    directoryFixture: {
      legacy,
      repository: createCanvasRepository("local-device"),
    },
  });
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void start();
