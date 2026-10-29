import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
  type RenderTask,
} from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs/pdf.worker.min.mjs",
  document.baseURI,
).href;
const resources = new URL("pdfjs/", document.baseURI).href;
export default function PdfPreview({
  blob,
  name,
  url,
  onError,
}: {
  blob: Blob;
  name: string;
  url: string;
  onError: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(true);
  const failure = useRef(onError);
  failure.current = onError;
  useEffect(() => {
    let stopped = false;
    let task: PDFDocumentLoadingTask | undefined;
    void blob
      .arrayBuffer()
      .then((data) => {
        if (stopped) return;
        task = getDocument({
          data: new Uint8Array(data),
          cMapUrl: resources + "cmaps/",
          cMapPacked: true,
          standardFontDataUrl: resources + "standard_fonts/",
          useSystemFonts: true,
          useWasm: false,
          useWorkerFetch: false,
        });
        return task.promise;
      })
      .then((document) => {
        if (!stopped && document) {
          setPdf(document);
          setPage(1);
        }
      })
      .catch(() => {
        if (!stopped) failure.current();
      });
    return () => {
      stopped = true;
      void task?.destroy();
    };
  }, [blob]);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width)),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !width || !canvas.current) return;
    let stopped = false,
      render: RenderTask | undefined;
    setBusy(true);
    void pdf
      .getPage(page)
      .then(async (item) => {
        if (stopped || !canvas.current) return;
        const base = item.getViewport({ scale: 1 });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const scale = Math.min(
          width / base.width,
          2,
          8192 / ratio / base.height,
          Math.sqrt(8000000 / (base.width * base.height * ratio * ratio)),
        );
        const viewport = item.getViewport({ scale });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        render = item.render({
          canvas: target,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          annotationMode: 0,
        });
        await render.promise;
        if (!stopped) setBusy(false);
      })
      .catch(() => {
        if (!stopped) failure.current();
      });
    return () => {
      stopped = true;
      render?.cancel();
    };
  }, [pdf, page, width]);
  return (
    <div className="asset-pdf" ref={frame} aria-busy={busy}>
      <div className="asset-pdf-page">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${name} · 第 ${page} 页`}
        />
      </div>
      <footer>
        <span title={name}>{name}</span>
        <div>
          <button
            aria-label="PDF 上一页"
            disabled={!pdf || page === 1 || busy}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <small aria-label="PDF 页码">
            {page} / {pdf?.numPages ?? "…"}
          </small>
          <button
            aria-label="PDF 下一页"
            disabled={!pdf || page >= pdf.numPages || busy}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight size={15} />
          </button>
          <a
            href={url}
            download={name}
            aria-label={`下载 ${name}`}
            title="下载"
          >
            <Download size={15} />
          </a>
        </div>
      </footer>
    </div>
  );
}
