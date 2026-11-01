// Real App / IndexedDB, synthetic files and isolated Electron profile only.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import { createCanvasRepository } from "@nomi/platform";
import "../../packages/ui/src/styles.css";
import { createCanvasExampleImage } from "../../packages/ui/src/canvas/examples";
import {
  createNoteArchive,
  downloadFile,
} from "../../packages/ui/src/writing/exportNote";
const fixture = {
  requests: 0,
  failWrites: false,
  documentWrites: 0,
  repository: createCanvasRepository,
  image: createCanvasExampleImage,
  archiveNote: async (id: string) => {
    const repository = createCanvasRepository("local-device");
    const document = await repository.load();
    const archive = await createNoteArchive(
      document!,
      id,
      {
        format: "jekyll",
        slug: "transformer",
        date: "2026-10-25",
        lang: "zh",
        tags: [],
      },
      repository,
    );
    downloadFile(archive.bytes, "article.zip");
  },
  pdf: () => {
    const stream = (page: number) =>
      `BT /F1 24 Tf 58 710 Td (Nomi preview page ${page}) Tj ET\n`;
    const content = (page: number) =>
      `<< /Length ${stream(page).length} >>\nstream\n${stream(page)}endstream`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      content(1),
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
      content(2),
    ];
    let source = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(source.length);
      source += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = source.length;
    source += `xref\n0 8\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((value) => `${String(value).padStart(10, "0")} 00000 n \n`)
      .join(
        "",
      )}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([source], { type: "application/pdf" });
  },
};
Object.assign(window, { canvasFixture: fixture });
const localFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  if (
    url.origin === location.origin &&
    url.pathname.startsWith(new URL("pdfjs/", location.href).pathname)
  )
    return localFetch(input, init);
  fixture.requests++;
  throw Error("Canvas fixture network disabled.");
};
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "desktop",
    version: "fixture",
    platform: "darwin",
  }),
};
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
  if (fixture.failWrites && this.name === "documents")
    throw new DOMException("Synthetic quota exceeded", "QuotaExceededError");
  if (this.name === "documents") fixture.documentWrites++;
  return put.call(this, value, key!);
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
