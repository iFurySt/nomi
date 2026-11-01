import { afterEach, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
  cp,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCanvasDocument } from "../../core/src/canvas/index";
import {
  commitTree,
  recoverTree,
  scanTree,
  readTreeDocument,
} from "./note-directory-tree";
import { packageHash } from "./nomi-package";
const paths: string[] = [];
afterEach(async () => {
  for (const p of paths.splice(0))
    await rm(p, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nomi-legacy-tree-"));
  paths.push(root);
  await mkdir(join(root, "workspaces"));
  const doc = createCanvasDocument();
  const key =
    packageHash(JSON.stringify(["local-device", doc.id])) + ".nomi.json";
  await commitTree(
    root,
    "文稿",
    key,
    { profile: "local-device", document: doc, treeVersion: 1 },
    doc,
  );
  return { root, doc, key };
}
it("reads the old physical tree including existing IDs, names and Finder children for migration", async () => {
  const f = await fixture();
  const scan = await scanTree(join(f.root, "文稿"));
  expect(readTreeDocument(f.doc, scan)).toEqual(f.doc);
  await mkdir(join(scan.entries[0].path, "Finder child"));
  const imported = readTreeDocument(f.doc, await scanTree(scan.root));
  expect(imported.notes.find((n) => n.title === "Finder child")?.parentId).toBe(
    scan.entries[0].marker.id,
  );
});
it("recovers an interrupted legacy directory swap before migration", async () => {
  const f = await fixture();
  const token = "11111111-1111-4111-8111-111111111111",
    tx = join(f.root, ".nomi-history", token);
  await mkdir(tx);
  const value = JSON.parse(
    await readFile(join(f.root, "workspaces", f.key), "utf8"),
  );
  value.document.revision++;
  await writeFile(join(tx, "snapshot.json"), JSON.stringify(value));
  await cp(join(f.root, "文稿"), join(tx, "next"), { recursive: true });
  await rename(join(f.root, "文稿"), join(tx, "previous"));
  await writeFile(
    join(f.root, "workspaces", f.key + ".tree-journal"),
    JSON.stringify({ version: 1, token, folder: "文稿", snapshotFile: f.key }),
  );
  await recoverTree(f.root, f.key);
  expect(
    JSON.parse(await readFile(join(f.root, "workspaces", f.key), "utf8"))
      .document.revision,
  ).toBe(value.document.revision);
  expect(
    (await readdir(join(f.root, "workspaces"))).some((n) =>
      n.endsWith(".tree-journal"),
    ),
  ).toBe(false);
});
it("rejects old duplicate identities and symlink folders during migration", async () => {
  const f = await fixture();
  const tree = join(f.root, "文稿"),
    entry = (await scanTree(tree)).entries[0];
  await cp(entry.path, join(tree, "Duplicate"), { recursive: true });
  await expect(scanTree(tree)).rejects.toThrow("重复");
  await rm(join(tree, "Duplicate"), { recursive: true });
  await symlink(entry.path, join(tree, "Link"));
  await expect(scanTree(tree)).rejects.toThrow("符号链接");
});
