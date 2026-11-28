import { describe, it, expect } from "vitest";
import { createCanvasDocument } from "../canvas/document";
import { documentToSync, syncKey, type SyncRecord } from "./protocol";
import { reconcileSync } from "./reconcile";
import { SyncSchedule } from "./schedule";
const fixture = () =>
  documentToSync(createCanvasDocument()).map((e) => ({
    ...e,
    version: 1,
    deleted: false,
    updatedAt: new Date(0).toISOString(),
  })) as SyncRecord[];
describe("three-way sync", () => {
  it("merges independent entities but preserves both sides of competing content", () => {
    const base = fixture(),
      local = documentToSync(createCanvasDocument()),
      remote = structuredClone(base);
    const ids = local.filter((e) => e.kind === "block");
    expect(ids.length).toBeGreaterThan(1);
    ids[0].data = { ...ids[0].data, custom: "local" };
    const other = remote.find((e) => syncKey(e) === syncKey(ids[1]))!;
    other.data = { ...other.data, custom: "remote" };
    other.version++;
    let result = reconcileSync(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.structuralError).toBeUndefined();
    expect(result.entities.find((e) => e.id === ids[0].id)?.data.custom).toBe(
      "local",
    );
    expect(result.entities.find((e) => e.id === ids[1].id)?.data.custom).toBe(
      "remote",
    );
    const same = remote.find((e) => syncKey(e) === syncKey(ids[0]))!;
    same.data = { ...same.data, custom: "competing" };
    result = reconcileSync(base, local, remote);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].local?.data.custom).toBe("local");
    expect(result.conflicts[0].remote?.data?.custom).toBe("competing");
  });
  it("keeps the relative order of independent insertions made offline on both devices", () => {
    const base = fixture(),
      local = createCanvasDocument(),
      cloud = createCanvasDocument();
    for (const [d, id] of [
      [local, "local"],
      [cloud, "other"],
    ] as const) {
      d.notes.splice(1, 0, { id: "note." + id, title: "New", blocks: [] });
      d.notes[0].blocks.unshift("text." + id);
      d.blocks.push({ id: "text." + id, type: "markdown", source: id });
    }
    const records = documentToSync(cloud).map((e) => ({
      ...e,
      version: 2,
      updatedAt: "",
      deleted: false,
    }));
    const result = reconcileSync(base, documentToSync(local), records);
    expect(result.structuralError).toBeUndefined();
    expect(result.conflicts).toEqual([]);
    expect(
      result.entities.find((e) => e.kind === "document")?.data.noteOrder,
    ).toEqual(["note.start", "note.other", "note.local", "note.questions"]);
    expect(
      result.entities.find((e) => e.kind === "order" && e.id === "note.start")
        ?.data.blocks,
    ).toEqual(["text.other", "text.local", "text.start"]);
  });
  it("keeps delete-versus-edit conflicts and accepts matching changes", () => {
    const base = fixture(),
      local = documentToSync(createCanvasDocument()),
      remote = structuredClone(base);
    const block = local.find((e) => e.kind === "block")!;
    block.data = { ...block.data, custom: "edit" };
    const tomb = remote.find((e) => syncKey(e) === syncKey(block))!;
    tomb.deleted = true;
    tomb.data = null;
    tomb.version++;
    expect(reconcileSync(base, local, remote).conflicts).toHaveLength(1);
    tomb.deleted = false;
    tomb.data = structuredClone(block.data);
    expect(reconcileSync(base, local, remote).conflicts).toHaveLength(0);
  });
});
describe("sync scheduling", () => {
  it("debounces activity, caps continuous editing, and throttles starts", () => {
    const s = new SyncSchedule();
    s.changed(0);
    expect(s.deadline()).toBe(3000);
    for (let now = 2000; now < 30000; now += 2000) s.changed(now);
    expect(s.deadline()).toBe(30000);
    s.started(30000);
    expect(s.deadline()).toBe(Infinity);
    s.succeeded();
    s.clear();
    s.changed(31000);
    expect(s.deadline()).toBe(35000);
    expect(s.deadline(true)).toBe(0);
  });
  it("manual sync respects retry-after, offline, auth pause and concurrency", () => {
    const s = new SyncSchedule();
    s.changed(0);
    s.started(3000);
    s.failed(4000, 120000, 0.5);
    expect(s.deadline(true)).toBe(124000);
    s.online = false;
    expect(s.deadline(true)).toBe(Infinity);
    s.online = true;
    s.paused = true;
    expect(s.deadline(true)).toBe(Infinity);
    s.paused = false;
    s.succeeded();
    expect(s.retryAt).toBe(0);
    s.clear();
    expect(s.deadline()).toBe(Infinity);
  });
});
