import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Download,
  FileText,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  FileImage,
  FileAudio,
  FileVideo,
} from "lucide-react";
import type { CanvasDocument, CanvasBlock, CanvasAsset } from "@nomi/core";
import { canvasAssetDigest, type CanvasRepository } from "@nomi/platform";
import { Modal } from "../components/primitives";
import "./assets.css";
const PdfPreview = lazy(() => import("./PdfPreview"));

function fileType(meta: CanvasAsset) {
  if (meta.mime === "application/pdf") return [FileText, "PDF"] as const;
  if (/zip|tar|gzip|7z|rar/.test(meta.mime))
    return [FileArchive, "压缩文件"] as const;
  if (/spreadsheet|csv|excel/.test(meta.mime))
    return [FileSpreadsheet, "表格"] as const;
  if (meta.mime.startsWith("image/")) return [FileImage, "图片"] as const;
  if (meta.mime.startsWith("audio/")) return [FileAudio, "音频"] as const;
  if (meta.mime.startsWith("video/")) return [FileVideo, "视频"] as const;
  if (/json|javascript|xml/.test(meta.mime)) return [FileCode, "代码"] as const;
  return [
    FileText,
    meta.name.split(".").at(-1)?.toUpperCase() || "文件",
  ] as const;
}
function size(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function FileCard({
  meta,
  url,
  failed,
}: {
  meta: CanvasAsset;
  url: string;
  failed?: boolean;
}) {
  const [Icon, type] = fileType(meta);
  return (
    <a
      className="canvas-file asset-file-card"
      href={url || undefined}
      download={meta.name}
      aria-disabled={!url}
      data-preview-fallback={failed || undefined}
    >
      <Icon size={25} />
      <span>
        <strong>{meta.name}</strong>
        <small>
          {type} · {size(meta.bytes)}
          {failed ? " · 无法预览" : ""}
        </small>
      </span>
      <Download size={17} aria-label="下载原件" />
    </a>
  );
}
function Caption({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${input.current.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={input}
      rows={1}
      maxLength={2000}
      className="asset-caption"
      aria-label="图片说明"
      placeholder="添加图片说明…"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}
function TextPreview({
  blob,
  meta,
  url,
}: {
  blob: Blob;
  meta: CanvasAsset;
  url: string;
}) {
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stopped = false;
    void blob
      .text()
      .then((value) => {
        if (!stopped) setText(value);
      })
      .catch(() => {
        if (!stopped) setFailed(true);
      });
    return () => {
      stopped = true;
    };
  }, [blob]);
  if (failed) return <FileCard meta={meta} url={url} failed />;
  return (
    <div className="asset-text-preview">
      <pre>{text ?? "正在读取…"}</pre>
      <footer>
        <span>{meta.name}</span>
        <a href={url} download={meta.name} aria-label={`下载 ${meta.name}`}>
          <Download size={15} />
        </a>
      </footer>
    </div>
  );
}
export function AssetContent({
  block,
  document,
  repository,
  onCaptionChange,
  onCaptionBlur,
}: {
  block: Extract<CanvasBlock, { type: "image" | "file" }>;
  document: CanvasDocument;
  repository: CanvasRepository;
  onCaptionChange?: (value: string) => void;
  onCaptionBlur?: () => void;
}) {
  const meta = document.assets.find((asset) => asset.id === block.asset)!;
  const [preview, setPreview] = useState(false);
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob>();
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stopped = false,
      objectUrl = "";
    setUrl("");
    setBlob(undefined);
    setError("");
    setFailed(false);
    void repository
      .asset(meta.id)
      .then(async (original) => {
        if (!original) throw Error("附件原件暂不可用。");
        if (
          original.size !== meta.bytes ||
          (await canvasAssetDigest(original)) !== meta.sha256
        )
          throw Error("附件校验未通过，原件保持不变。");
        if (stopped) return;
        objectUrl = URL.createObjectURL(original);
        setBlob(original);
        setUrl(objectUrl);
      })
      .catch((error) => {
        if (!stopped) setError(error.message);
      });
    return () => {
      stopped = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [repository, meta.id, meta.sha256, meta.bytes]);
  if (error)
    return (
      <div className="canvas-asset-error" role="status">
        {meta.name}
        <span>{error}</span>
      </div>
    );
  if (block.type === "image")
    return (
      <figure className="canvas-image asset-image">
        <div className="asset-image-content">
          {url && !failed ? (
            <button
              type="button"
              className="asset-image-open"
              aria-label={`预览大图 ${meta.name}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                event.currentTarget.focus();
                setPreview(true);
              }}
            >
              <img
                draggable={false}
                src={url}
                alt={block.caption || meta.name}
                onError={() => setFailed(true)}
              />
            </button>
          ) : failed ? (
            <FileCard meta={meta} url={url} failed />
          ) : (
            <div className="canvas-asset-loading">正在读取图片…</div>
          )}
          {url && (
            <a
              className="asset-image-download"
              href={url}
              download={meta.name}
              aria-label={`下载 ${meta.name}`}
              title="下载图片"
            >
              <Download size={15} />
            </a>
          )}
        </div>
        {onCaptionChange ? (
          <figcaption>
            <Caption
              value={block.caption ?? ""}
              onChange={onCaptionChange}
              onBlur={onCaptionBlur}
            />
          </figcaption>
        ) : block.caption ? (
          <figcaption>{block.caption}</figcaption>
        ) : null}
        <Modal
          open={preview && !!url && !failed}
          onOpenChange={setPreview}
          title={meta.name}
          description="图片大图预览"
          className="asset-image-lightbox"
        >
          <img src={url} alt={block.caption || meta.name} draggable={false} />
          {block.caption && <p>{block.caption}</p>}
        </Modal>
      </figure>
    );
  if (!failed && blob && meta.mime === "application/pdf")
    return (
      <Suspense
        fallback={<div className="canvas-asset-loading">正在读取 PDF…</div>}
      >
        <PdfPreview
          blob={blob}
          name={meta.name}
          url={url}
          onError={() => setFailed(true)}
        />
      </Suspense>
    );
  if (
    !failed &&
    blob &&
    meta.bytes <= 256 * 1024 &&
    ["text/plain", "text/markdown", "text/csv", "application/json"].includes(
      meta.mime,
    )
  )
    return <TextPreview blob={blob} meta={meta} url={url} />;
  return <FileCard meta={meta} url={url} failed={failed} />;
}
