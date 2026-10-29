import {
  parseCanvasDocument,
  CANVAS_ASSET_BYTES,
  type CanvasDocument,
  type CanvasCamera,
  type CanvasAsset,
} from "@nomi/core";
export interface CanvasAssetWrite {
  asset: CanvasAsset;
  blob: Blob;
}
export interface CanvasRepository {
  load(): Promise<CanvasDocument | undefined>;
  save(
    document: CanvasDocument,
    assets: CanvasAssetWrite[],
    baseRevision: number | null,
  ): Promise<void>;
  asset(id: string): Promise<Blob | undefined>;
}
const request = <T>(value: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? Error("本机存储请求失败。"));
  });
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("nomi.canvas.v1", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("documents");
      open.result.createObjectStore("assets");
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    open.onerror = () => {
      database = undefined;
      reject(open.error ?? Error("无法打开画布存储。"));
    };
    open.onblocked = () => {
      database = undefined;
      reject(Error("请关闭其他旧版页面，再重试打开画布。"));
    };
  }));
}
const completed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? Error("保存事务已取消。"));
    tx.onerror = () => reject(tx.error ?? Error("本机空间不足或无法写入。"));
  });
export async function canvasAssetDigest(blob: Blob) {
  if (blob.size > CANVAS_ASSET_BYTES) throw Error("单个附件最多 20 MiB。");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function canvasImageMime(blob: Blob): Promise<string | undefined> {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (
    b[0] === 137 &&
    b[1] === 80 &&
    b[2] === 78 &&
    b[3] === 71 &&
    b[4] === 13 &&
    b[5] === 10 &&
    b[6] === 26 &&
    b[7] === 10
  )
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  const s = String.fromCharCode(...b);
  if (s.startsWith("GIF87a") || s.startsWith("GIF89a")) return "image/gif";
  if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") return "image/webp";
  return undefined;
}
/** Atomic metadata + originals; local profile scope is not a server access grant. */
export function createCanvasRepository(
  profile: string,
  documentId = "document.home",
): CanvasRepository {
  const docKey = JSON.stringify([profile, documentId]);
  const assetKey = (id: string) => JSON.stringify([profile, documentId, id]);
  return {
    async load() {
      const db = await openDatabase();
      const value = await request(
        db
          .transaction("documents", "readonly")
          .objectStore("documents")
          .get(docKey),
      );
      if (value === undefined) return;
      const doc = parseCanvasDocument(value);
      if (doc.id !== documentId) throw Error("文档标识与存储位置不一致。");
      return doc;
    },
    async save(input, assets, baseRevision) {
      const document = parseCanvasDocument(input);
      if (document.id !== documentId) throw Error("不能改写其他文档。");
      for (const item of assets) {
        if (
          item.blob.size !== item.asset.bytes ||
          (await canvasAssetDigest(item.blob)) !== item.asset.sha256
        )
          throw Error("附件原件与摘要不一致。");
      }
      const db = await openDatabase();
      const tx = db.transaction(["documents", "assets"], "readwrite");
      const done = completed(tx);
      void done.catch(() => {});
      try {
        const documents = tx.objectStore("documents"),
          store = tx.objectStore("assets");
        const existing = (await request(documents.get(docKey))) as
          CanvasDocument | undefined;
        if ((existing?.revision ?? null) !== baseRevision)
          throw Error("另一处修改已保存。请先保留本地 DSL，再重新读取文档。");
        if (existing && document.revision <= existing.revision)
          throw Error("不能用旧版本覆盖文档。");
        for (const meta of document.assets) {
          const incoming = assets.find((a) => a.asset.id === meta.id);
          const saved = (await request(store.get(assetKey(meta.id)))) as
            { blob: Blob; sha256: string; mime: string } | undefined;
          if (
            saved &&
            (saved.sha256 !== meta.sha256 ||
              saved.blob.size !== meta.bytes ||
              saved.mime !== meta.mime)
          )
            throw Error("附件原件不可覆盖，请创建新的附件。");
          if (incoming) {
            if (
              incoming.asset.sha256 !== meta.sha256 ||
              incoming.blob.size !== meta.bytes ||
              incoming.asset.mime !== meta.mime
            )
              throw Error("附件声明不一致。");
            store.put(
              { blob: incoming.blob, sha256: meta.sha256, mime: meta.mime },
              assetKey(meta.id),
            );
          } else if (!saved)
            throw Error("缺少附件原件，请先将文件添加到画布。");
        }
        documents.put(document, docKey);
        await done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already completed / aborted. */
        }
        await done.catch(() => {});
        throw error;
      }
    },
    async asset(id) {
      const db = await openDatabase();
      const saved = (await request(
        db
          .transaction("assets", "readonly")
          .objectStore("assets")
          .get(assetKey(id)),
      )) as { blob: Blob } | undefined;
      return saved?.blob;
    },
  };
}
const cameraKey = (profile: string, doc: string) =>
  `nomi.canvas.camera.v1:${JSON.stringify([profile, doc])}`;
export function readCanvasCamera(
  profile: string,
  doc: string,
): CanvasCamera | undefined {
  try {
    const c = JSON.parse(
      localStorage.getItem(cameraKey(profile, doc)) ?? "null",
    );
    if (
      c &&
      Number.isFinite(c.x) &&
      Math.abs(c.x) <= 1e7 &&
      Number.isFinite(c.y) &&
      Math.abs(c.y) <= 1e7 &&
      Number.isFinite(c.zoom) &&
      c.zoom >= 0.2 &&
      c.zoom <= 2.5
    )
      return { x: c.x, y: c.y, zoom: c.zoom };
  } catch {
    /* Optional device view, never replace document content. */
  }
}
export function writeCanvasCamera(
  profile: string,
  doc: string,
  camera: CanvasCamera,
) {
  try {
    localStorage.setItem(cameraKey(profile, doc), JSON.stringify(camera));
    return true;
  } catch {
    return false;
  }
}
