import { readPackageTree, packageHash } from "./nomi-package";
import { commitPackages, recoverPackages } from "./package-transaction";
import {
  treeFolder,
  scanTree,
  readTreeDocument,
  recoverTree,
  copySafe,
} from "./note-directory-tree";
import { atomicFile, directory, regularFile } from "./document-files";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rm } from "node:fs/promises";
import { join, dirname, resolve, sep } from "node:path";
import {
  parseCanvasDocument,
  CANVAS_ASSET_BYTES,
  type CanvasDocument,
  type CanvasAsset,
} from "../../core/src/canvas/index";
import type {
  DocumentDirectoryStatus,
  DocumentStorageSave,
} from "../../core/src/document-storage";

const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
interface Snapshot {
  format: "nomi-library-document/1";
  profile: string;
  document: CanvasDocument;
  originals: Record<string, CanvasAsset>;
  treeVersion?: 1;
  packageVersion?: 1;
}
/** One serialized owner, immutable originals, atomic DSL snapshot as commit point. */
export class DocumentStore {
  private tail: Promise<unknown> = Promise.resolve();
  private root?: string;
  constructor(
    private configFile: string,
    readonly defaultPath: string,
  ) {}
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run);
    this.tail = result.catch(() => {});
    return result;
  }
  private async initialize() {
    if (!this.root) {
      try {
        const config = JSON.parse(await readFile(this.configFile, "utf8"));
        if (
          config.version !== 1 ||
          typeof config.path !== "string" ||
          !config.path
        )
          throw Error("文稿目录配置损坏。");
        this.root = config.path;
      } catch (error) {
        if (!missing(error)) throw error;
        const root = resolve(this.defaultPath);
        await mkdir(root, { recursive: true });
        await directory(root);
        const entries = await readdir(root);
        if (!entries.includes(".nomi-library.json")) {
          if (entries.some((name) => name !== ".DS_Store"))
            throw Error("默认文稿目录已有其他文件，请先整理该目录。");
          await mkdir(join(root, "workspaces"));
          await mkdir(join(root, "assets"));
          await atomicFile(
            join(root, ".nomi-library.json"),
            JSON.stringify({ version: 1 }),
          );
        }
        await this.checkRoot(root);
        await this.configure(root);
        this.root = root;
      }
    }
    const root = this.root!;
    await this.checkRoot(root);
    return root;
  }
  private async checkRoot(root: string) {
    await directory(root);
    const marker = JSON.parse(
      (await regularFile(join(root, ".nomi-library.json"), 1024)).toString(),
    );
    if (marker.version !== 1) throw Error("不支持的文稿目录版本。");
    await directory(join(root, "workspaces"));
    await directory(join(root, "assets"));
  }
  private async configure(path: string) {
    await mkdir(dirname(this.configFile), { recursive: true });
    await atomicFile(
      this.configFile,
      JSON.stringify({ version: 1, path }, null, 2),
    );
  }
  private key(profile: string, documentId: string) {
    if (
      typeof profile !== "string" ||
      !profile ||
      profile.length > 256 ||
      typeof documentId !== "string" ||
      !documentId ||
      documentId.length > 256
    )
      throw Error("文稿身份无效。");
    return digest(JSON.stringify([profile, documentId])) + ".nomi.json";
  }
  private async snapshot(
    root: string,
    profile: string,
    documentId: string,
  ): Promise<Snapshot | undefined> {
    await recoverPackages(root, this.key(profile, documentId));
    await recoverTree(root, this.key(profile, documentId));
    let bytes: Buffer;
    try {
      bytes = await regularFile(
        join(root, "workspaces", this.key(profile, documentId)),
        32 * 1024 * 1024,
      );
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    const value = JSON.parse(bytes.toString()) as Snapshot;
    if (
      value.format !== "nomi-library-document/1" ||
      value.profile !== profile ||
      !value.originals ||
      typeof value.originals !== "object" ||
      Array.isArray(value.originals)
    )
      throw Error("文稿文件格式无效。");
    if (value.treeVersion !== undefined && value.treeVersion !== 1)
      throw Error("文稿目录格式版本无效。");
    if (value.packageVersion !== undefined && value.packageVersion !== 1)
      throw Error("不支持此文件包版本。");
    value.document = parseCanvasDocument(value.document);
    if (value.document.id !== documentId) throw Error("文稿标识与文件不一致。");
    for (const [id, meta] of Object.entries(value.originals)) {
      if (
        !meta ||
        meta.id !== id ||
        !hash(meta.sha256) ||
        !Number.isInteger(meta.bytes) ||
        meta.bytes < 0 ||
        meta.bytes > CANVAS_ASSET_BYTES ||
        typeof meta.mime !== "string"
      )
        throw Error("附件索引无效。");
    }
    for (const meta of value.document.assets) {
      const saved = value.originals[meta.id];
      if (
        !saved ||
        saved.sha256 !== meta.sha256 ||
        saved.bytes !== meta.bytes ||
        saved.mime !== meta.mime
      )
        throw Error("附件索引与文稿不一致。");
    }
    return value;
  }
  status(): Promise<DocumentDirectoryStatus> {
    return this.serial(async () => ({
      path: await this.initialize(),
      defaultPath: this.defaultPath,
    }));
  }
  private async current(root: string, profile: string, documentId: string) {
    let saved = await this.snapshot(root, profile, documentId);
    if (!saved) {
      const path = join(root, treeFolder(profile, documentId));
      try {
        await directory(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      const tree = await readPackageTree(path);
      if (tree.document.id !== documentId)
        throw Error("文稿包工作区身份不一致。");
      saved = {
        format: "nomi-library-document/1",
        profile,
        document: tree.document,
        originals: Object.fromEntries(
          tree.document.assets.map((a) => [a.id, a]),
        ),
        packageVersion: 1,
      };
      for (const a of tree.document.assets)
        await atomicFile(
          join(root, "assets", a.sha256),
          tree.originals.get(a.id)!,
        );
      await atomicFile(
        join(root, "workspaces", this.key(profile, documentId)),
        JSON.stringify(saved, null, 2),
      );
    }
    const folder = treeFolder(profile, documentId),
      key = this.key(profile, documentId);
    if (!saved.packageVersion) {
      if (saved.treeVersion) {
        const scan = await scanTree(join(root, folder));
        saved.document = readTreeDocument(saved.document, scan);
      }
      const originals = await this.originalBytes(root, saved.document);
      saved.packageVersion = 1;
      await commitPackages(
        root,
        folder,
        key,
        saved,
        saved.document,
        undefined,
        originals,
        async () => {},
      );
      return saved;
    }
    const tree = await readPackageTree(join(root, folder));
    const external = tree.document;
    const semantic = (d: CanvasDocument) =>
      JSON.stringify({ ...d, revision: 0 });
    if (semantic(external) !== semantic(saved.document)) {
      const history = join(root, ".nomi-history");
      await mkdir(history, { recursive: true });
      await directory(history);
      await atomicFile(
        join(history, `external-${randomUUID()}-${key}`),
        JSON.stringify(saved, null, 2),
      );
      for (const asset of external.assets) {
        const old = saved.originals[asset.id];
        if (
          old &&
          (old.sha256 !== asset.sha256 ||
            old.bytes !== asset.bytes ||
            old.mime !== asset.mime)
        )
          throw Error("附件原件不可覆盖，请创建新的附件身份。");
        await atomicFile(
          join(root, "assets", asset.sha256),
          tree.originals.get(asset.id)!,
        );
        saved.originals[asset.id] = asset;
      }
      saved.document = {
        ...external,
        id: documentId,
        revision: saved.document.revision + 1,
      };
      await commitPackages(
        root,
        folder,
        key,
        saved,
        saved.document,
        tree,
        tree.originals,
        async () => {
          if (
            (await readPackageTree(join(root, folder))).fingerprint !==
            tree.fingerprint
          )
            throw Error("文稿包仍在修改，请稍后重试。");
        },
      );
    }
    return saved;
  }
  private async originalBytes(root: string, document: CanvasDocument) {
    const originals = new Map<string, Buffer>();
    for (const asset of document.assets) {
      const bytes = await regularFile(
        join(root, "assets", asset.sha256),
        CANVAS_ASSET_BYTES,
      );
      if (bytes.length !== asset.bytes || packageHash(bytes) !== asset.sha256)
        throw Error("附件缺失或损坏。");
      originals.set(asset.id, bytes);
    }
    return originals;
  }
  load(profile: string, documentId: string) {
    return this.serial(
      async () =>
        (await this.current(await this.initialize(), profile, documentId))
          ?.document,
    );
  }
  save(input: DocumentStorageSave) {
    return this.serial(async () => {
      const root = await this.initialize();
      const key = this.key(input.profile, input.documentId);
      const document = parseCanvasDocument(input.document);
      if (document.id !== input.documentId || !Array.isArray(input.assets))
        throw Error("文稿保存请求无效。");
      const previous = await this.current(
        root,
        input.profile,
        input.documentId,
      );
      if ((previous?.document.revision ?? null) !== input.baseRevision)
        throw Error("另一处修改已保存，请重新读取文稿。");
      if (previous && document.revision <= previous.document.revision)
        throw Error("不能用旧版本覆盖文稿。");
      const originals = Object.assign(
        Object.create(null) as Record<string, CanvasAsset>,
        previous?.originals,
      );
      for (const meta of document.assets) {
        const old = originals[meta.id];
        if (
          old &&
          (old.sha256 !== meta.sha256 ||
            old.mime !== meta.mime ||
            old.bytes !== meta.bytes)
        )
          throw Error("附件原件不可覆盖。");
        const incoming = input.assets.find(
          (item) => item.asset?.id === meta.id,
        );
        const path = join(root, "assets", meta.sha256);
        if (incoming) {
          if (
            !(incoming.bytes instanceof Uint8Array) ||
            incoming.bytes.byteLength !== meta.bytes ||
            digest(incoming.bytes) !== meta.sha256 ||
            incoming.asset.sha256 !== meta.sha256 ||
            incoming.asset.mime !== meta.mime
          )
            throw Error("附件原件与声明不一致。");
          await atomicFile(path, incoming.bytes);
        } else {
          const bytes = await regularFile(path, CANVAS_ASSET_BYTES);
          if (bytes.length !== meta.bytes || digest(bytes) !== meta.sha256)
            throw Error("附件缺失或已损坏。");
        }
        originals[meta.id] = meta;
      }
      const snapshot: Snapshot = {
        format: "nomi-library-document/1",
        profile: input.profile,
        document,
        originals,
        packageVersion: 1,
      };
      const folder = treeFolder(input.profile, input.documentId);
      const tree = previous
        ? await readPackageTree(join(root, folder))
        : undefined;
      const bytes = await this.originalBytes(root, document);
      await commitPackages(
        root,
        folder,
        key,
        snapshot,
        document,
        tree,
        bytes,
        async () => {
          if (
            tree &&
            (await readPackageTree(join(root, folder))).fingerprint !==
              tree.fingerprint
          )
            throw Error("文稿包已被外部修改，请重新读取。");
        },
      );
    });
  }
  backup(input: DocumentStorageSave) {
    return this.serial(async () => {
      const root = await this.initialize();
      this.key(input.profile, input.documentId);
      const document = parseCanvasDocument(input.document);
      if (document.id !== input.documentId || !Array.isArray(input.assets))
        throw Error("草稿备份请求无效。");
      for (const meta of document.assets) {
        const incoming = input.assets.find((a) => a.asset?.id === meta.id);
        if (incoming) {
          if (
            !(incoming.bytes instanceof Uint8Array) ||
            incoming.bytes.length !== meta.bytes ||
            digest(incoming.bytes) !== meta.sha256
          )
            throw Error("草稿附件无效。");
          await atomicFile(join(root, "assets", meta.sha256), incoming.bytes);
        } else {
          const bytes = await regularFile(
            join(root, "assets", meta.sha256),
            CANVAS_ASSET_BYTES,
          );
          if (digest(bytes) !== meta.sha256 || bytes.length !== meta.bytes)
            throw Error("草稿附件缺失或损坏。");
        }
      }
      const history = join(root, ".nomi-history");
      await mkdir(history, { recursive: true });
      await directory(history);
      await atomicFile(
        join(history, `draft-${randomUUID()}.nomi.json`),
        JSON.stringify({ profile: input.profile, document }, null, 2),
      );
    });
  }
  asset(profile: string, documentId: string, id: string) {
    return this.serial(async () => {
      const root = await this.initialize();
      const saved = await this.snapshot(root, profile, documentId);
      const meta = saved?.originals[id];
      if (!meta || !Object.hasOwn(saved!.originals, id)) return;
      const bytes = await regularFile(
        join(root, "assets", meta.sha256),
        CANVAS_ASSET_BYTES,
      );
      if (bytes.length !== meta.bytes || digest(bytes) !== meta.sha256)
        throw Error("附件原件已损坏。");
      return { bytes: new Uint8Array(bytes), mime: meta.mime };
    });
  }
  locatePackage(path: string) {
    return this.serial(async () => {
      const root = await this.initialize();
      const target = await realpath(path);
      for (const file of await readdir(join(root, "workspaces"))) {
        if (!/^[a-f0-9]{64}\.nomi\.json$/.test(file)) continue;
        const saved = JSON.parse(
          (
            await regularFile(join(root, "workspaces", file), 32 * 1024 * 1024)
          ).toString(),
        ) as Snapshot;
        const doc = await this.current(root, saved.profile, saved.document.id);
        if (!doc) continue;
        const tree = await readPackageTree(
          join(root, treeFolder(saved.profile, saved.document.id)),
        );
        const entry = tree.entries.find((e) => resolve(e.path) === target);
        if (entry)
          return {
            profile: saved.profile,
            documentId: saved.document.id,
            noteId:
              entry.manifest.kind === "note"
                ? entry.manifest.packageId
                : undefined,
          };
      }
    });
  }
  notePath(profile: string, documentId: string, id: string, children = false) {
    return this.serial(async () => {
      const root = await this.initialize();
      await this.current(root, profile, documentId);
      const tree = await readPackageTree(
        join(root, treeFolder(profile, documentId)),
      );
      const entry = tree.entries.find((e) => e.manifest.packageId === id);
      if (!entry) throw Error("文稿不存在。");
      if (!children) return entry.path;
      const path = join(entry.path, "children");
      await mkdir(path, { recursive: true });
      await directory(path);
      return path;
    });
  }
  /** Explicit import, never silently edits an external original or duplicates its identity. */
  async importPackage(
    path: string,
    profile = "local-device",
    documentId = "document.home",
  ) {
    const tree = await readPackageTree(dirname(path), path);
    const { createCanvasDocument } =
      await import("../../core/src/canvas/index");
    const existing = await this.load(profile, documentId);
    const current = existing ?? createCanvasDocument();
    const source = tree.document;
    const ids = new Map<string, string>();
    const fresh = (id: string) => {
      if (!ids.has(id))
        ids.set(id, "import_" + randomUUID().replaceAll("-", ""));
      return ids.get(id)!;
    };
    for (const a of [
      ...source.notes,
      ...source.blocks,
      ...source.assets,
      ...source.board.placements,
      ...(source.board.connectors ?? []),
    ])
      fresh(a.id);
    const notes = source.notes.map((n) => ({
      ...n,
      id: fresh(n.id),
      blocks: n.blocks.map(fresh),
      ...(n.icon?.type === "image"
        ? { icon: { ...n.icon, asset: fresh(n.icon.asset) } }
        : {}),
      ...(n.parentId ? { parentId: fresh(n.parentId) } : {}),
    }));
    const blocks = source.blocks.map((b) => ({
      ...b,
      id: fresh(b.id),
      ...(b.type === "note-reference" &&
      b.documentId === source.id &&
      source.notes.some((n) => n.id === b.noteId)
        ? { noteId: fresh(b.noteId), documentId: current.id }
        : {}),
      ...("asset" in b ? { asset: fresh(b.asset) } : {}),
    }));
    const assets = source.assets.map((a) => ({ ...a, id: fresh(a.id) }));
    const placements = source.board.placements.map((p) => ({
      ...p,
      id: fresh(p.id),
      content: fresh(p.content),
      ...(p.group ? { group: fresh(p.group) } : {}),
    }));
    const endpoint = (
      e: NonNullable<CanvasDocument["board"]["connectors"]>[number]["from"],
    ) => (e.placement ? { ...e, placement: fresh(e.placement) } : e);
    const connectors =
      source.board.connectors?.map((c) => ({
        ...c,
        id: fresh(c.id),
        from: endpoint(c.from),
        to: endpoint(c.to),
      })) ?? [];
    const document = parseCanvasDocument({
      ...current,
      revision: current.revision + 1,
      notes: [...current.notes, ...notes],
      blocks: [...current.blocks, ...blocks],
      assets: [...current.assets, ...assets],
      board: {
        ...current.board,
        placements: [...current.board.placements, ...placements],
        connectors: [...(current.board.connectors ?? []), ...connectors],
      },
    });
    await this.save({
      profile,
      documentId,
      document,
      baseRevision: existing?.revision ?? null,
      assets: assets.map((a, i) => ({
        asset: a,
        bytes: tree.originals.get(source.assets[i].id)!,
      })),
    });
    return notes[0]?.id;
  }
  relocate(target: string) {
    return this.serial(async () => {
      const root = await this.initialize();
      await directory(target);
      target = await realpath(target);
      const source = await realpath(root);
      if (target === source)
        return { path: root, defaultPath: this.defaultPath };
      if (target.startsWith(source + sep) || source.startsWith(target + sep))
        throw Error("请选择当前文稿目录之外的空文件夹。");
      if ((await readdir(target)).some((name) => name !== ".DS_Store"))
        throw Error("请选择空文件夹，已有文件不会被覆盖。");
      for (const name of await readdir(join(root, "workspaces"))) {
        if (!/^[a-f0-9]{64}\.nomi\.json$/.test(name)) continue;
        const value = JSON.parse(
          (
            await regularFile(join(root, "workspaces", name), 32 * 1024 * 1024)
          ).toString(),
        ) as Snapshot;
        await this.current(root, value.profile, value.document.id);
      }
      const created: string[] = [];
      try {
        for (const folder of ["assets", "workspaces"]) {
          await mkdir(join(target, folder));
          created.push(join(target, folder));
          for (const name of await readdir(join(root, folder))) {
            // Only owned committed files; interrupted temporary writes are not copied.
            if (
              !(
                folder === "assets"
                  ? /^[a-f0-9]{64}$/
                  : /^[a-f0-9]{64}\.nomi\.json$/
              ).test(name)
            )
              continue;
            const bytes = await regularFile(
              join(root, folder, name),
              32 * 1024 * 1024,
            );
            if (folder === "assets" && digest(bytes) !== name)
              throw Error("附件已损坏，未更换文稿目录。");
            if (folder === "workspaces") {
              const value = JSON.parse(bytes.toString()) as Snapshot;
              if (this.key(value.profile, value.document?.id) !== name)
                throw Error("文稿文件标识无效。");
              await this.snapshot(root, value.profile, value.document.id);
              for (const meta of value.document.assets) {
                const original = await regularFile(
                  join(root, "assets", meta.sha256),
                  CANVAS_ASSET_BYTES,
                );
                if (
                  original.length !== meta.bytes ||
                  digest(original) !== meta.sha256
                )
                  throw Error("附件缺失或损坏，未更换文稿目录。");
              }
            }
            await atomicFile(join(target, folder, name), bytes);
          }
        }
        for (const name of await readdir(root)) {
          if (
            name !== "文稿" &&
            name !== ".nomi-history" &&
            !/^文稿-[a-f0-9]{64}$/.test(name)
          )
            continue;
          created.push(join(target, name));
          await copySafe(join(root, name), join(target, name));
        }
        const marker = join(target, ".nomi-library.json");
        await atomicFile(marker, JSON.stringify({ version: 1 }));
        created.push(marker);
        await this.checkRoot(target);
        await this.configure(target);
        this.root = target;
      } catch (error) {
        for (const path of created.reverse())
          await rm(path, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
      return { path: target, defaultPath: this.defaultPath };
    });
  }
}
