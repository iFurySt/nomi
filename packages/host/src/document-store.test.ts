import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
  symlink,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createCanvasDocument } from "../../core/src/canvas/index";
import { DocumentStore } from "./document-store";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "nomi-document-store-test-"));
  temporary.push(path);
  const config = join(path, "config", "directory.json"),
    root = join(path, "Documents", "Nomi");
  const store = new DocumentStore(config, root);
  const document = createCanvasDocument();
  const input = {
    profile: "local-device",
    documentId: document.id,
    document,
    assets: [],
    baseRevision: null,
  };
  return { path, config, root, store, input };
}
describe("document directory", () => {
  it("persists the exact DSL and isolates profile identities without using them as paths", async () => {
    const { store, config, root, input } = await fixture();
    expect((await store.status()).path).toBe(root);
    await store.save(input);
    expect(await store.load(input.profile, input.documentId)).toEqual(
      input.document,
    );
    expect(await store.load("../another", input.documentId)).toBeUndefined();
    await store.save({ ...input, profile: "../another" });
    expect((await readdir(join(root, "workspaces"))).length).toBe(2);
    expect(
      await new DocumentStore(config, root).load(
        input.profile,
        input.documentId,
      ),
    ).toEqual(input.document);
    const disk = JSON.parse(
      await readFile(
        join(root, "workspaces", (await readdir(join(root, "workspaces")))[0]!),
        "utf8",
      ),
    );
    expect(disk.format).toBe("nomi-library-document/1");
  });
  it("serializes saves and refuses stale revisions", async () => {
    const { store, input } = await fixture();
    await store.save(input);
    const edit = {
      ...input,
      document: { ...input.document, revision: input.document.revision + 1 },
      baseRevision: input.document.revision,
    };
    const result = await Promise.allSettled([
      store.save(edit),
      store.save(edit),
    ]);
    expect(result.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await expect(
      store.save({ ...input, baseRevision: edit.document.revision }),
    ).rejects.toThrow("旧版本");
  });
  it("validates originals, retains removed assets for undo, and detects corruption", async () => {
    const { store, input, root } = await fixture();
    const bytes = new TextEncoder().encode("an actual attachment");
    const asset = {
      id: "asset.test",
      name: "readme.txt",
      mime: "text/plain",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    input.document.assets.push(asset);
    await expect(store.save(input)).rejects.toThrow();
    await expect(
      store.save({ ...input, assets: [{ asset, bytes: new Uint8Array([1]) }] }),
    ).rejects.toThrow("不一致");
    await store.save({ ...input, assets: [{ asset, bytes }] });
    expect(
      (await store.asset(input.profile, input.documentId, asset.id))?.bytes,
    ).toEqual(bytes);
    const removed = {
      ...input.document,
      revision: input.document.revision + 1,
      assets: [],
    };
    await store.save({
      ...input,
      document: removed,
      baseRevision: input.document.revision,
    });
    await store.save({
      ...input,
      document: { ...input.document, revision: removed.revision + 1 },
      baseRevision: removed.revision,
    });
    await writeFile(join(root, "assets", asset.sha256), "corrupt");
    await expect(
      store.asset(input.profile, input.documentId, asset.id),
    ).rejects.toThrow("损坏");
  });
  it("relocates all profiles, keeps the original, and resumes writes in the selected directory after restart", async () => {
    const { store, input, path, config, root } = await fixture();
    await store.save(input);
    await store.save({ ...input, profile: "second" });
    const target = join(path, "selected");
    await mkdir(target);
    expect((await store.relocate(target)).path).toBe(await realpath(target));
    const reopened = new DocumentStore(config, root);
    expect((await reopened.status()).path).toBe(await realpath(target));
    const edited = {
      ...input.document,
      title: "Changed",
      revision: input.document.revision + 1,
    };
    await reopened.save({
      ...input,
      document: edited,
      baseRevision: input.document.revision,
    });
    expect(await reopened.load(input.profile, input.documentId)).toEqual(
      edited,
    );
    expect(await reopened.load("second", input.documentId)).toEqual(
      input.document,
    );
    const old = new DocumentStore(join(path, "old-config.json"), root);
    expect(await old.load(input.profile, input.documentId)).toEqual(
      input.document,
    );
  });
  it("rejects occupied/nested targets and does not change the active directory", async () => {
    const { store, input, path, root } = await fixture();
    await store.save(input);
    const target = join(path, "occupied");
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "keep");
    await expect(store.relocate(target)).rejects.toThrow("空文件夹");
    await expect(store.relocate(join(root, "assets"))).rejects.toThrow("之外");
    expect((await store.status()).path).toBe(root);
    expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("keep");
  });
  it("rolls back target files if the preference cannot commit", async () => {
    const { store, input, path, root, config } = await fixture();
    await store.save(input);
    await rm(config);
    await mkdir(config);
    const target = join(path, "destination");
    await mkdir(target);
    await expect(store.relocate(target)).rejects.toThrow();
    expect(await readdir(target)).toEqual([]);
    expect((await store.status()).path).toBe(root);
    expect(await store.load(input.profile, input.documentId)).toEqual(
      input.document,
    );
  });
  it("never substitutes an empty document for damaged or unavailable storage", async () => {
    const { store, input, root } = await fixture();
    await store.save(input);
    const file = join(
      root,
      "workspaces",
      (await readdir(join(root, "workspaces")))[0]!,
    );
    await writeFile(file, "invalid json");
    await expect(store.load(input.profile, input.documentId)).rejects.toThrow();
    await rm(root, { recursive: true });
    await expect(store.status()).rejects.toThrow();
  });
  it("refuses managed directory symlinks and snapshot symlinks", async () => {
    const { store, input, root, path } = await fixture();
    await store.save(input);
    const file = join(
      root,
      "workspaces",
      (await readdir(join(root, "workspaces")))[0]!,
    );
    const outside = join(path, "outside.json");
    await writeFile(outside, "secret");
    await rm(file);
    await symlink(outside, file);
    await expect(store.load(input.profile, input.documentId)).rejects.toThrow();
    await rm(join(root, "assets"), { recursive: true });
    await symlink(path, join(root, "assets"));
    await expect(store.status()).rejects.toThrow("符号链接");
  });
});
