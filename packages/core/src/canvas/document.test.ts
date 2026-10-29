import { describe, it, expect } from "vitest";
import {
  applyCanvasCommands,
  createCanvasDocument,
  parseCanvasDocument,
  screenToWorld,
  zoomCanvasAt,
  resizeCanvasPlacement,
  type CanvasResizeDirection,
} from "./document";
describe("canvas document semantics", () => {
  it("accepts empty optional titles and legacy auto heights without rewriting either", () => {
    const original = createCanvasDocument();
    const next = applyCanvasCommands(original, original.revision, [
      { type: "rename_note", id: "note.start", title: "" },
    ]);
    expect(next.notes[0].title).toBe("");
    expect(next.board.placements[0]).not.toHaveProperty("height");
    expect(parseCanvasDocument(JSON.stringify(next))).toEqual(next);
    expect(next.blocks).toEqual(original.blocks);
  });
  it.each<[CanvasResizeDirection, number, number, number, number]>([
    ["n", 100, 220, 400, 280],
    ["ne", 100, 220, 430, 280],
    ["e", 100, 200, 430, 300],
    ["se", 100, 200, 430, 320],
    ["s", 100, 200, 400, 320],
    ["sw", 130, 200, 370, 320],
    ["w", 130, 200, 370, 300],
    ["nw", 130, 220, 370, 280],
  ])(
    "resizes %s in world space while keeping opposite edges fixed",
    (direction, x, y, width, height) => {
      const p = {
        id: "place.test",
        content: "note.test",
        x: 100,
        y: 200,
        width: 400,
        height: 300,
      };
      expect(resizeCanvasPlacement(p, 999, direction, 30, 20)).toEqual({
        x,
        y,
        width,
        height,
      });
      expect(p).toHaveProperty("width", 400);
    },
  );
  it("limits sizes, preserves auto height for horizontal drags and anchors top/left at limits", () => {
    const p = {
      id: "place.test",
      content: "note.test",
      x: 100,
      y: 200,
      width: 400,
    };
    expect(resizeCanvasPlacement(p, 300, "e", 100, 200)).toEqual({
      x: 100,
      y: 200,
      width: 500,
    });
    const min = resizeCanvasPlacement(p, 300, "nw", 1e7, 1e7);
    expect(min).toEqual({ x: 340, y: 380, width: 160, height: 120 });
    const max = resizeCanvasPlacement(p, 300, "nw", -1e7, -1e7);
    expect(max).toEqual({ x: -1100, y: -1900, width: 1600, height: 2400 });
    const boundary = resizeCanvasPlacement(
      { ...p, x: -1e6, y: -1e6 },
      300,
      "nw",
      -100,
      -100,
    );
    expect(boundary).toEqual({ x: -1e6, y: -1e6, width: 400, height: 300 });
  });
  it("round trips independent placement heights and atomically moves/resizes without changing originals", () => {
    const original = createCanvasDocument();
    const next = applyCanvasCommands(original, original.revision, [
      { type: "duplicate_placement", id: "place.start", newId: "place.copy" },
      { type: "move", id: "place.start", x: -50, y: -60 },
      { type: "resize", id: "place.start", width: 480, height: 600 },
    ]);
    expect(next.board.placements[0]).toMatchObject({
      x: -50,
      y: -60,
      width: 480,
      height: 600,
    });
    expect(next.board.placements.at(-1)).not.toHaveProperty("height");
    expect(next.blocks).toEqual(original.blocks);
    expect(next.assets).toEqual(original.assets);
    expect(parseCanvasDocument(JSON.stringify(next))).toEqual(next);
    for (const height of [0, 119, 2401, NaN, Infinity, "300", null]) {
      expect(() =>
        applyCanvasCommands(original, original.revision, [
          { type: "move", id: "place.start", x: 10, y: 20 },
          { type: "resize", id: "place.start", width: 500, height } as any,
        ]),
      ).toThrow();
    }
    expect(original.board.placements[0]).not.toHaveProperty("height");
  });
  it("round trips Markdown, Unicode and LaTeX without rewriting source", () => {
    let d = createCanvasDocument();
    const source =
      '中文 📝 "quotes" \\ $\\tau$\n```ts\nconst x = `a`;\n```\n' +
      "长篇正文\n".repeat(10000);
    d = applyCanvasCommands(d, d.revision, [
      { type: "set_markdown", id: "text.start", source },
    ]);
    expect(parseCanvasDocument(JSON.stringify(d))).toEqual(d);
    expect(d.blocks.find((b) => b.id === "text.start")).toHaveProperty(
      "source",
      source,
    );
  });
  it("moving/resizing a placement leaves content unchanged", () => {
    const before = createCanvasDocument(),
      after = applyCanvasCommands(before, 1, [
        { type: "move", id: "place.start", x: -300, y: 777 },
        { type: "resize", id: "place.start", width: 600 },
      ]);
    expect(after.notes).toEqual(before.notes);
    expect(after.blocks).toEqual(before.blocks);
    expect(before.board.placements[0].x).toBe(0);
    expect(after.board.placements[0]).toMatchObject({
      x: -300,
      y: 777,
      width: 600,
    });
  });
  it("duplicate and remove affect presentation; references keep the same content", () => {
    let d = createCanvasDocument();
    d = applyCanvasCommands(d, 1, [
      { type: "duplicate_placement", id: "place.start", newId: "place.copy" },
    ]);
    expect(d.board.placements.at(-1)?.content).toBe("note.start");
    d = applyCanvasCommands(d, 2, [
      { type: "set_markdown", id: "text.start", source: "same content" },
      { type: "remove_placement", id: "place.start" },
    ]);
    expect(d.notes.some((n) => n.id === "note.start")).toBe(true);
    expect(d.blocks.find((b) => b.id === "text.start")).toHaveProperty(
      "source",
      "same content",
    );
    expect(d.board.placements.some((p) => p.id === "place.copy")).toBe(true);
  });
  it("rejects stale or partly invalid batches atomically", () => {
    const d = createCanvasDocument(),
      before = JSON.stringify(d);
    expect(() =>
      applyCanvasCommands(d, 0, [
        { type: "move", id: "place.start", x: 1, y: 1 },
      ]),
    ).toThrow(/已经改变/);
    expect(() =>
      applyCanvasCommands(d, 1, [
        { type: "set_markdown", id: "text.start", source: "changed" },
        { type: "move", id: "missing", x: 1, y: 1 },
      ]),
    ).toThrow();
    expect(JSON.stringify(d)).toBe(before);
  });
  it.each([
    [
      "future schema",
      (d: any) => {
        d.schema = "nomi-document-ir/future";
      },
    ],
    [
      "unknown required content",
      (d: any) => {
        d.blocks[0].type = "iframe";
      },
    ],
    [
      "dangling block",
      (d: any) => {
        d.notes[0].blocks = ["missing"];
      },
    ],
    [
      "dangling placement",
      (d: any) => {
        d.board.placements[0].content = "missing";
      },
    ],
    [
      "duplicate identity",
      (d: any) => {
        d.board.placements[0].id = d.notes[0].id;
      },
    ],
    [
      "non-finite geometry",
      (d: any) => {
        d.board.placements[0].x = Infinity;
      },
    ],
    [
      "oversized geometry",
      (d: any) => {
        d.board.placements[0].width = 1e20;
      },
    ],
    [
      "unsupported interactive capability",
      (d: any) => {
        d.blocks[2].program.requires.hostEffects = ["network.fetch"];
      },
    ],
  ])("rejects %s without discarding content", (_name, change) => {
    const d = createCanvasDocument();
    change(d);
    expect(() => parseCanvasDocument(d)).toThrow();
  });
  it("keeps zoom anchored at the pointer and enforces supported scale", () => {
    const camera = { x: 50, y: -70, zoom: 0.8 },
      pointer = { x: 320, y: 450 },
      world = screenToWorld(camera, pointer);
    expect(screenToWorld(zoomCanvasAt(camera, 1.5, pointer), pointer)).toEqual(
      world,
    );
    expect(zoomCanvasAt(camera, 100, pointer).zoom).toBe(2.5);
    expect(zoomCanvasAt(camera, 0.001, pointer).zoom).toBe(0.2);
  });
});
