import { build, uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/notes");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["packages/host/src/renderer-permissions.ts"],
  outfile: join(output, "permissions.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/canvas.tsx"],
  outfile: join(output, "renderer.js"),
  bundle: true,
  format: "iife",
  jsx: "automatic",
  conditions: ["style", "browser"],
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@nomi/core": join(root, "packages/core/src/index.ts"),
    "@nomi/platform": join(root, "packages/platform/src/index.ts"),
    react: join(root, "apps/web/node_modules/react"),
    "react-dom": join(root, "apps/web/node_modules/react-dom"),
  },
  loader: uiFixtureAssetLoaders,
  logLevel: "warning",
});
await writeFile(
  join(output, "index.html"),
  '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
async function checks(phase) {
  const checkpoint = (step) => console.log("notes-check:", step);
  checkpoint(phase);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
  const until = async (test) => {
    for (let i = 0; i < 300; i++) {
      if (await test()) return;
      await wait(20);
    }
    throw Error(
      "Timed out: " +
        test +
        "\n" +
        document.body.innerText.slice(-1800) +
        "\nFocus/hover: " +
        JSON.stringify({
          focus: document.activeElement?.outerHTML.slice(0, 400),
          hover: [...document.querySelectorAll(":hover")].map(
            (el) => el.tagName + "." + el.className,
          ),
          gutter: document
            .querySelector(".writing-block-gutter")
            ?.outerHTML.slice(0, 500),
        }),
    );
  };
  const find = (t) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === t,
    );
  const input = (el, value) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const repo = window.canvasFixture.repository("local-device");
  const saved = () => repo.load();
  const title = () => document.querySelector('[aria-label="文稿标题"]');
  const checkTasks = () => {
    const tasks = [
      ...document.querySelectorAll('.tiptap li[data-type="taskItem"]'),
    ];
    assert(tasks.length > 0, "Task item styling marker is missing");
    for (const task of tasks) {
      const box = task
        .querySelector('input[type="checkbox"]')
        .getBoundingClientRect();
      const paragraph = task.querySelector(":scope > div > p");
      const text = paragraph.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);
      assert(
        text.left >= box.right &&
          Math.abs(box.top + box.height / 2 - text.top - lineHeight / 2) < 2,
        "Task checkbox and first text line are not aligned",
      );
    }
  };
  const openBlockMenu = async (
    editor = document.querySelector(".tiptap"),
    index = 0,
  ) => {
    const node = editor.children[index],
      rect = node.getBoundingClientRect();
    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + 10,
        clientY: rect.top + 4,
      }),
    );
    await wait(30);
    const trigger = editor
      .closest(".writing-rich-frame")
      .querySelector('[aria-haspopup="menu"]');
    trigger.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
    );
    await until(() => document.querySelector('[role="menu"]'));
  };
  const menuItem = (text) =>
    [...document.querySelectorAll('[role="menuitem"]')].find(
      (e) => e.textContent.trim() === text,
    );
  const insertFromMenu = async (
    text,
    editor = document.querySelector(".tiptap"),
    index = editor.children.length - 1,
  ) => {
    await openBlockMenu(editor, index);
    const submenu = menuItem("在下方插入");
    if (submenu) {
      submenu.focus();
      submenu.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      );
      await until(
        () => document.querySelectorAll('[role="menu"]').length === 2,
      );
    }
    const item = menuItem(text);
    assert(item, "Missing insert action: " + text);
    item.click();
    await wait(35);
  };

  if (phase === "initial" || phase === "restored") location.hash = "/notes";
  await until(() => title());
  const replaceImageDocument = async (next, noteId) => {
    location.hash = "/canvas";
    await until(() => document.querySelector('[aria-label="编辑文档 DSL"]'));
    document.querySelector('[aria-label="编辑文档 DSL"]').click();
    await until(() => document.querySelector('[aria-label="文档 DSL 源码"]'));
    input(
      document.querySelector('[aria-label="文档 DSL 源码"]'),
      JSON.stringify(next),
    );
    [...document.querySelectorAll(".canvas-dsl-actions button")]
      .find((b) => b.textContent.includes("应用"))
      .click();
    await until(() => !document.querySelector('[aria-label="文档 DSL 源码"]'));
    location.hash = "/notes?note=" + encodeURIComponent(noteId);
    await until(
      () => title()?.value === next.notes.find((n) => n.id === noteId).title,
    );
    await until(
      () =>
        document.querySelector(".notes-save")?.dataset.saveState === "saved",
    );
  };
  const imageOrder = async () => {
    const d = await saved(),
      note = d.notes.find((n) => n.id === "image.check.note");
    return note.blocks
      .flatMap((id) => {
        const b = d.blocks.find((b) => b.id === id);
        return b.type === "markdown"
          ? b.source.trim().split(/\n\n+/)
          : [b.type];
      })
      .join("|");
  };
  if (phase === "image-move-prepare") {
    const original = await saved(),
      image = original.blocks.find((b) => b.type === "image");
    window.canvasFixture.imageOriginal = original;
    const next = structuredClone(original);
    next.blocks.push(
      { id: "image.check.before", type: "markdown", source: "A1\n\nA2\n\nA3" },
      { id: "image.check.after", type: "markdown", source: "B1\n\nB2\n\nB3" },
    );
    next.notes.push({
      id: "image.check.note",
      title: "图片移动回归",
      blocks: ["image.check.before", image.id, "image.check.after"],
    });
    await replaceImageDocument(next, "image.check.note");
    await until(
      () => document.querySelector(".asset-image-open img")?.complete,
    );
    const caption = document.querySelector('[aria-label="图片说明"]');
    caption.focus();
    input(caption, "");
    await wait(30);
    assert(
      getComputedStyle(caption, "::placeholder").color === "rgba(0, 0, 0, 0)",
      "Focused caption still displays placeholder",
    );
    caption.blur();
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    return;
  }
  if (phase === "image-move-up" || phase === "image-move-down") {
    const section = document.querySelector(".writing-block-image");
    const rect = section.getBoundingClientRect();
    section.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }),
    );
    await until(() => section.querySelector('[aria-haspopup="menu"]'));
    section.querySelector('[aria-haspopup="menu"]').dispatchEvent(
      new PointerEvent("pointerover", {
        bubbles: true,
        pointerType: "mouse",
      }),
    );
    await until(() => document.querySelector(".writing-block-menu"));
    menuItem(phase === "image-move-up" ? "上移" : "下移").click();
    await until(() => !document.querySelector(".writing-block-menu"));
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    const expected =
      phase === "image-move-up"
        ? "A1|A2|image|A3|B1|B2|B3"
        : "A1|A2|A3|B1|image|B2|B3";
    assert(
      (await imageOrder()) === expected,
      "Image crossed an entire Markdown record instead of one visible block: " +
        (await imageOrder()),
    );
    assert(
      document.activeElement === document.body,
      "Menu did not leave body focus for native undo regression",
    );
    return;
  }
  if (phase === "image-move-undone" || phase === "image-move-redone") {
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    assert(
      (await imageOrder()) ===
        (phase === "image-move-undone"
          ? "A1|A2|A3|image|B1|B2|B3"
          : "A1|A2|image|A3|B1|B2|B3"),
      "Native undo/redo did not restore the atomic image move: " +
        (await imageOrder()),
    );
    return;
  }
  if (phase === "image-lightbox-open") {
    const thumbnail = document.querySelector(".asset-image-open img");
    const button = document.querySelector(".asset-image-open");
    assert(
      thumbnail.getBoundingClientRect().width <= thumbnail.naturalWidth + 1,
      "Small inline image is enlarged beyond its original size",
    );
    assert(
      getComputedStyle(button).paddingTop === "0px" &&
        getComputedStyle(button).backgroundColor === "rgba(0, 0, 0, 0)",
      "Inline image inherits ordinary button padding or background",
    );
    window.canvasFixture.imagePreviewBefore = JSON.stringify(await saved());
    document.querySelector(".asset-image-open").click();
    await until(
      () => document.querySelector(".asset-image-lightbox img")?.complete,
    );
    const large = document.querySelector(".asset-image-lightbox img"),
      rect = large.getBoundingClientRect();
    assert(
      large.src === document.querySelector(".asset-image-open img").src &&
        large.naturalWidth > 0,
      "Lightbox does not use the verified original",
    );
    assert(
      rect.width <= innerWidth && rect.height <= innerHeight,
      "Large image escaped viewport",
    );
    return;
  }
  if (phase === "image-lightbox-closed") {
    await until(() => !document.querySelector(".asset-image-lightbox"));
    await until(() =>
      document.activeElement?.classList.contains("asset-image-open"),
    );
    assert(
      JSON.stringify(await saved()) === window.canvasFixture.imagePreviewBefore,
      "Preview changed document content",
    );
    return;
  }
  if (phase === "image-move-restore") {
    const original = window.canvasFixture.imageOriginal;
    original.revision = (await saved()).revision;
    await replaceImageDocument(
      original,
      original.notes.find((n) => n.title === "Transformer").id,
    );
    return {
      imageCaptionFocus: true,
      imageAdjacentMoves: true,
      imageMoveNativeUndoRedo: true,
      imageLightbox: true,
    };
  }
  const noteRow = (id) =>
    [...document.querySelectorAll("[data-note-row]")].find(
      (row) => row.dataset.noteRow === id,
    );
  if (phase === "hierarchy-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "层级回归");
    await wait(30);
    const rootId = new URLSearchParams(location.hash.split("?")[1]).get("note");
    noteRow(rootId).querySelector(".notes-row-add").click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "子页回归");
    await wait(30);
    const childId = new URLSearchParams(location.hash.split("?")[1]).get(
      "note",
    );
    noteRow(childId).querySelector(".notes-row-add").click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "叶页回归");
    await wait(30);
    const leafId = new URLSearchParams(location.hash.split("?")[1]).get("note");
    window.canvasFixture.hierarchyIds = { rootId, childId, leafId };
    await until(() => noteRow(leafId));
    assert(
      noteRow(rootId).getAttribute("aria-level") === "1" &&
        noteRow(childId).getAttribute("aria-level") === "2" &&
        noteRow(leafId).getAttribute("aria-level") === "3",
      "Nested documents lost tree depth",
    );
    assert(
      [...document.querySelectorAll(".notes-breadcrumb button")]
        .map((b) => b.textContent)
        .join("|") === "层级回归|子页回归",
      "Child breadcrumb missing",
    );
    document.querySelector(".notes-breadcrumb button").click();
    await until(() => title()?.value === "层级回归");
    assert(
      document.querySelector(".notes-children button").textContent ===
        "子页回归",
      "Parent page has no child navigation",
    );
    noteRow(rootId).querySelector(".notes-row-toggle").click();
    await until(() => !noteRow(childId));
    noteRow(rootId).querySelector(".notes-row-toggle").click();
    await until(() => noteRow(childId));
    const search = document.querySelector('[aria-label="搜索文稿"]');
    input(search, "叶页回归");
    await wait(30);
    assert(
      document.querySelectorAll("[data-note-row]").length === 3 &&
        noteRow(rootId) &&
        noteRow(childId) &&
        noteRow(leafId),
      "Search hides the matching page ancestry",
    );
    input(search, "");
    await wait(30);
    noteRow(childId)
      .querySelector(".notes-row-menu")
      .dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
    await until(() => menuItem("移动到…"));
    menuItem("移动到…").click();
    await until(() => document.querySelector(".notes-move-dialog"));
    assert(
      ![...document.querySelectorAll(".notes-move-targets button")].some(
        (b) =>
          b.textContent.includes("子页回归") ||
          b.textContent.includes("叶页回归"),
      ),
      "Move picker permits descendants",
    );
    [...document.querySelectorAll(".notes-move-targets button")]
      .find((b) => b.textContent === "观察与问题")
      .click();
    await until(() => !document.querySelector(".notes-move-dialog"));
    await until(
      () =>
        title()?.value === "子页回归" &&
        document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    assert(
      (await saved()).notes.find((n) => n.id === childId).parentId ===
        "note.questions",
      "Move did not update semantic parent",
    );
    return;
  }
  if (phase === "hierarchy-move-undone" || phase === "hierarchy-move-redone") {
    const { rootId, childId, leafId } = window.canvasFixture.hierarchyIds;
    await until(
      async () =>
        (await saved()).notes.find((n) => n.id === childId)?.parentId ===
        (phase === "hierarchy-move-undone" ? rootId : "note.questions"),
    );
    assert(
      (await saved()).notes.find((n) => n.id === leafId).parentId === childId,
      "Moving parent detached its descendants",
    );
    return;
  }
  if (phase === "hierarchy-delete") {
    const { childId, leafId } = window.canvasFixture.hierarchyIds;
    const remove = async () => {
      noteRow(childId)
        .querySelector(".notes-row-menu")
        .dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            pointerType: "mouse",
          }),
        );
      await until(() => menuItem("删除文稿"));
      menuItem("删除文稿").click();
      await until(() => document.querySelector('[role="dialog"]'));
    };
    const revision = (await saved()).revision;
    await remove();
    assert(
      document
        .querySelector('[role="dialog"]')
        .textContent.includes("1 篇子文稿"),
      "Parent deletion does not explain its scope",
    );
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "取消")
      .click();
    await until(() => !document.querySelector('[role="dialog"]'));
    assert(
      (await saved()).revision === revision,
      "Cancel deletion modified the document",
    );
    await remove();
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "删除文稿及子文稿")
      .click();
    await until(
      async () =>
        !(await saved()).notes.some((n) => n.id === childId || n.id === leafId),
    );
    return;
  }
  if (phase === "hierarchy-restored-width-target") {
    const { childId, leafId } = window.canvasFixture.hierarchyIds;
    await until(
      async () =>
        (await saved()).notes.some((n) => n.id === childId) &&
        (await saved()).notes.some((n) => n.id === leafId),
    );
    const divider = document.querySelector(".notes-library-resizer"),
      rect = divider.getBoundingClientRect();
    window.canvasFixture.widthBefore = Number(
      divider.getAttribute("aria-valuenow"),
    );
    window.canvasFixture.widthEvents = [];
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "lostpointercapture",
    ])
      divider.addEventListener(type, (event) =>
        window.canvasFixture.widthEvents.push([
          type,
          event.clientX,
          event.buttons,
        ]),
      );
    window.canvasFixture.widthRevision = (await saved()).revision;
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + 100),
    };
  }
  if (phase === "hierarchy-width-in-progress") {
    await until(
      () =>
        Number(
          localStorage.getItem("nomi:notes:local-device:library-width"),
        ) ===
        window.canvasFixture.widthBefore + 90,
    );
    assert(
      (await saved()).revision === window.canvasFixture.widthRevision,
      "In-progress view resize changed document content",
    );
    return;
  }
  if (phase === "hierarchy-width-result") {
    const divider = document.querySelector(".notes-library-resizer");
    await until(
      () => !document.querySelector(".notes-workspace").dataset.resizing,
    );
    await wait(40);
    assert(
      Number(divider.getAttribute("aria-valuenow")) ===
        window.canvasFixture.widthBefore + 90,
      "Native sidebar drag did not follow pointer: " +
        JSON.stringify({
          before: window.canvasFixture.widthBefore,
          after: divider.getAttribute("aria-valuenow"),
          resizing: document.querySelector(".notes-workspace").dataset.resizing,
          events: window.canvasFixture.widthEvents,
        }),
    );
    assert(
      Number(localStorage.getItem("nomi:notes:local-device:library-width")) ===
        window.canvasFixture.widthBefore + 90,
      "Sidebar width was not saved",
    );
    assert(
      (await saved()).revision === window.canvasFixture.widthRevision,
      "View resizing wrote content history",
    );
    return {
      nestedPages: true,
      hierarchicalSearch: true,
      parentMoveUndoRedo: true,
      subtreeDeleteUndo: true,
      nativeSidebarResize: true,
    };
  }
  if (phase === "tree-drag-prepare") {
    const create = async (name, parent) => {
      if (parent) noteRow(parent).querySelector(".notes-row-add").click();
      else document.querySelector('[aria-label="新建文稿"]').click();
      await until(() => title()?.value === "未命名文稿");
      input(title(), name);
      await wait(35);
      return new URLSearchParams(location.hash.split("?")[1]).get("note");
    };
    const a = await create("拖动源文稿");
    const child = await create("拖动子文稿", a);
    const leaf = await create("拖动叶文稿", child);
    const peer = await create("拖动同级文稿 C", a);
    const b = await create("拖动目标文稿");
    window.canvasFixture.treeDragIds = { a, b, child, leaf, peer };
    title().blur();
    document.getElementById("main-content").focus();
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    window.canvasFixture.treeDragBlocks = JSON.stringify(
      (await saved()).blocks,
    );
    return;
  }
  if (phase.startsWith("tree-drag-points-")) {
    const kind = phase.slice("tree-drag-points-".length);
    const { a, b, child, leaf, peer } = window.canvasFixture.treeDragIds;
    const tree = document.querySelector(".notes-library nav");
    if (kind === "expand") {
      noteRow(a).querySelector(".notes-row-toggle").click();
      await until(() => noteRow(a).getAttribute("aria-expanded") === "false");
    }
    tree.scrollTop = tree.scrollHeight;
    await wait(40);
    const boundary = kind.startsWith("boundary-");
    const source = boundary
      ? kind === "boundary-external"
        ? b
        : peer
      : kind === "invalid" || kind === "expand"
        ? b
        : a;
    const sourceRect = noteRow(source)
      .querySelector(".notes-list-select")
      .getBoundingClientRect();
    const bounds = tree.getBoundingClientRect();
    assert(
      sourceRect.top >= bounds.top && sourceRect.bottom <= bounds.bottom,
      "Drag source is offscreen",
    );
    const target = noteRow(
      boundary
        ? kind === "boundary-before"
          ? child
          : a
        : kind === "invalid"
          ? leaf
          : kind === "expand"
            ? a
            : b,
    ).getBoundingClientRect();
    let x = Math.round(target.left + 70),
      y = Math.round(target.top + target.height / 2);
    if (kind === "boundary-before") y = Math.round(target.top + 3);
    else if (boundary) y = Math.round(target.bottom - 3);
    if (kind === "reorder" || kind === "cancel") y = Math.round(target.top + 3);
    if (kind === "after" || kind === "noop") y = Math.round(target.bottom - 3);
    if (kind === "root") {
      const last = [...tree.querySelectorAll("[data-note-row]")]
        .at(-1)
        .getBoundingClientRect();
      y = Math.round(Math.min(bounds.bottom - 10, last.bottom + 15));
    }
    if (kind === "outside") x = Math.round(bounds.right + 100);
    if (kind === "scroll") y = Math.round(bounds.top + 5);
    window.canvasFixture.treeDragRevision = (await saved()).revision;
    window.canvasFixture.treeDragScroll = tree.scrollTop;
    return {
      from: {
        x: Math.round(sourceRect.left + 65),
        y: Math.round(sourceRect.top + sourceRect.height / 2),
      },
      to: { x, y },
    };
  }
  if (phase.startsWith("tree-drag-preview-")) {
    const kind = phase.slice("tree-drag-preview-".length);
    await until(() => document.querySelector(".notes-tree-drag-preview"));
    assert(
      (await saved()).revision === window.canvasFixture.treeDragRevision,
      "Drag preview wrote content",
    );
    const marker = document.querySelector("[data-note-drop], [data-root-drop]");
    if (["invalid", "noop", "outside"].includes(kind))
      assert(!marker, "Invalid/no-op target offers a drop");
    else if (kind === "expand")
      await until(
        () =>
          noteRow(window.canvasFixture.treeDragIds.a).getAttribute(
            "aria-expanded",
          ) === "true",
      );
    else if (kind === "scroll")
      await until(
        () =>
          document.querySelector(".notes-library nav").scrollTop <
          window.canvasFixture.treeDragScroll - 20,
      );
    else assert(marker, "No tree drop feedback");
    if (kind.startsWith("boundary-")) {
      const { a, child } = window.canvasFixture.treeDragIds;
      assert(
        marker.dataset.noteRow === (kind === "boundary-before" ? child : a),
        "Child-gap marker jumped to the subtree end",
      );
      assert(
        marker.dataset.noteDrop ===
          (kind === "boundary-before" ? "before" : "after"),
        "Child-gap marker is on the wrong edge",
      );
      assert(
        parseFloat(getComputedStyle(marker, "::after").left) === 32,
        "Child-gap marker lost child indentation",
      );
    }
    return;
  }
  if (phase.startsWith("tree-drag-result-")) {
    const kind = phase.slice("tree-drag-result-".length);
    const { a, b, child, leaf, peer } = window.canvasFixture.treeDragIds;
    await until(
      () =>
        !document.querySelector(".notes-tree-drag-preview") &&
        !document.body.classList.contains("notes-tree-dragging"),
    );
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    const doc = await saved(),
      source = doc.notes.find((n) => n.id === a);
    assert(
      JSON.stringify(doc.blocks) === window.canvasFixture.treeDragBlocks,
      "Tree drag rewrote content",
    );
    assert(
      doc.notes.find((n) => n.id === child).parentId === a &&
        doc.notes.find((n) => n.id === leaf).parentId === child,
      "Tree drag broke descendants",
    );
    if (kind.startsWith("boundary-")) {
      const dragged = kind === "boundary-external" ? b : peer;
      assert(
        doc.revision === window.canvasFixture.treeDragRevision + 1,
        "Child-gap drop did not commit once",
      );
      assert(
        doc.notes.find((n) => n.id === dragged).parentId === a,
        "Child-gap drop used root instead of parent",
      );
      const children = doc.notes
        .filter((n) => n.parentId === a)
        .map((n) => n.id);
      assert(
        children[0] === dragged && children[1] === child,
        "Child-gap drop appended after C instead of before B",
      );
      return { expandedParentDrop: true };
    }
    if (
      ["invalid", "noop", "outside", "cancel", "expand", "scroll"].includes(
        kind,
      )
    ) {
      assert(
        doc.revision === window.canvasFixture.treeDragRevision,
        "Cancelled/no-op drag wrote history",
      );
    } else {
      assert(
        doc.revision === window.canvasFixture.treeDragRevision + 1,
        "Drop did not commit exactly once",
      );
      assert(
        source.parentId === (kind === "nest" ? b : undefined),
        "Drop committed the wrong parent",
      );
      const roots = doc.notes.filter((n) => !n.parentId).map((n) => n.id);
      if (kind === "reorder")
        assert(
          roots.indexOf(a) + 1 === roots.indexOf(b),
          "Before drop ignored sibling order",
        );
      if (kind === "after")
        assert(
          roots.indexOf(b) + 1 === roots.indexOf(a),
          "After drop ignored sibling order",
        );
      if (kind === "root")
        assert(roots.at(-1) === a, "Root end drop did not promote");
    }
    return {
      nativeNoteTreeDrag: true,
      noteDragSubtree: true,
      noteDragOrder: true,
      noteDragCancel: true,
    };
  }
  if (phase === "tree-drag-boundary-undone") {
    const { a, b, child, peer } = window.canvasFixture.treeDragIds;
    await until(async () => {
      const doc = await saved();
      return (
        doc.notes
          .filter((n) => n.parentId === a)
          .map((n) => n.id)
          .join("|") === [child, peer].join("|") &&
        !doc.notes.find((n) => n.id === b).parentId
      );
    });
    return;
  }
  if (phase === "tree-drag-undone" || phase === "tree-drag-redone") {
    const { a, b } = window.canvasFixture.treeDragIds;
    await until(
      async () =>
        (await saved()).notes.find((n) => n.id === a)?.parentId ===
        (phase === "tree-drag-redone" ? b : undefined),
    );
    return;
  }
  const revealRow = () => noteRow(window.canvasFixture.titleRevealId);
  if (phase === "title-reveal-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(
      title(),
      "长标题完整阅读体验：学习、笔记、知识与交互实验都可以放在自己的文稿树里——到这里完整结束",
    );
    await wait(40);
    window.canvasFixture.titleRevealId = new URLSearchParams(
      location.hash.split("?")[1],
    ).get("note");
    title().blur();
    document.getElementById("main-content").focus();
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    window.canvasFixture.titleRevealRevision = (await saved()).revision;
    revealRow().scrollIntoView({ block: "nearest" });
    return;
  }
  if (phase === "title-reveal-idle") {
    const row = revealRow(),
      viewport = row.querySelector(".notes-title-viewport"),
      tools = row.querySelector(".notes-row-actions");
    await until(
      () =>
        !row.dataset.actionsVisible && getComputedStyle(tools).opacity === "0",
    );
    assert(
      getComputedStyle(tools).position === "absolute" &&
        getComputedStyle(tools).pointerEvents === "none",
      "Hidden row actions reserve layout or intercept the title",
    );
    assert(
      row.getBoundingClientRect().right -
        viewport.getBoundingClientRect().right <
        8,
      "Idle title still reserves trailing action space",
    );
    assert(
      !row.querySelector(".notes-title-text").getAnimations().length,
      "Idle row title is moving",
    );
    window.canvasFixture.titleIdleWidth = viewport.clientWidth;
    const rect = row.getBoundingClientRect();
    return {
      x: Math.round(rect.left + 55),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  if (phase === "title-reveal-hover") {
    const row = revealRow(),
      label = row.querySelector(".notes-title-text");
    await until(
      () => row.dataset.actionsVisible && label.getAnimations().length,
    );
    assert(
      row.querySelector(".notes-title-viewport").clientWidth ===
        window.canvasFixture.titleIdleWidth,
      "Hover causes title layout to jump",
    );
    await until(
      () =>
        getComputedStyle(row.querySelector(".notes-row-actions")).opacity ===
        "1",
    );
    const animation = label.getAnimations()[0],
      timing = animation.effect.getTiming();
    assert(
      timing.iterations === 1 && timing.fill === "forwards",
      "Title animation repeats or snaps back",
    );
    return;
  }
  if (phase === "title-reveal-end") {
    const row = revealRow(),
      label = row.querySelector(".notes-title-text"),
      frame = row.querySelector(".notes-title-viewport");
    label.getAnimations()[0].finish();
    await until(() => frame.dataset.scrolledEnd === "true");
    const tail = document.createRange();
    tail.selectNodeContents(label);
    tail.setStart(label.firstChild, label.textContent.length - 1);
    assert(
      tail.getBoundingClientRect().right <=
        row.querySelector(".notes-row-actions").getBoundingClientRect().left -
          2,
      "End of title is covered by action buttons",
    );
    const left = label.getBoundingClientRect().left;
    await wait(120);
    assert(
      Math.abs(label.getBoundingClientRect().left - left) < 0.1,
      "Title does not remain stopped at its tail",
    );
    assert(
      (await saved()).revision === window.canvasFixture.titleRevealRevision,
      "Reading a title changed document content",
    );
    return;
  }
  if (phase === "title-reveal-reduced") {
    const row = revealRow(),
      label = row.querySelector(".notes-title-text"),
      frame = row.querySelector(".notes-title-viewport");
    await until(
      () => !label.getAnimations().length && frame.title === label.textContent,
    );
    return;
  }
  if (phase === "title-reveal-reset") {
    const row = revealRow(),
      label = row.querySelector(".notes-title-text"),
      frame = row.querySelector(".notes-title-viewport");
    await until(
      () => !row.dataset.actionsVisible && !label.getAnimations().length,
    );
    assert(
      !frame.dataset.scrolledEnd &&
        Math.abs(
          label.getBoundingClientRect().left -
            frame.getBoundingClientRect().left,
        ) < 1,
      "Leaving the row did not restore the title start",
    );
    return {
      overlayRowActions: true,
      titleRevealOnce: true,
      titleTailUncovered: true,
      titleRevealReset: true,
    };
  }
  if (phase === "dogfood-title-prepare") {
    const search = document.querySelector('[aria-label="搜索文稿"]');
    input(search, "no-matching-note-dogfood");
    await wait(30);
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿" && search.value === "");
    assert(
      document.querySelector("[data-note-row][data-selected]"),
      "New note is hidden by the previous search",
    );
    input(title(), "实际写作回归");
    await wait(30);
    const editor = document.querySelector(".tiptap");
    assert(
      editor.getBoundingClientRect().height < 60,
      "A short text fragment reserves a large blank canvas",
    );
    title().focus();
    title().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert(
      document.activeElement === title(),
      "IME confirmation moved focus out of the title",
    );
    return;
  }
  if (phase === "dogfood-title-result") {
    await until(() => document.activeElement?.matches(".tiptap"));
    assert(
      !document.querySelector(".tiptap").textContent,
      "Title Enter inserted content into the body",
    );
    const editor = document.querySelector(".tiptap");
    const transfer = new DataTransfer();
    transfer.setData(
      "text/html",
      "<p>第一段原始文字</p><p>第二段保持不变</p><ul><li><p>阅读</p></li><li><p>验证</p><ul><li><p>原始记录</p></li></ul></li></ul>",
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    await until(() => editor.querySelectorAll("li").length === 3);
    for (const p of editor.querySelectorAll("li > p"))
      assert(
        getComputedStyle(p).marginBottom === "0px",
        "List paragraphs retain full prose spacing",
      );
    await wait(50);
    editor.focus();
    const node = editor.firstElementChild.firstChild;
    const range = document.createRange();
    range.setStart(node, 3);
    range.setEnd(node, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await wait(30);
    assert(
      window.getSelection()?.toString() === "原始",
      "Replacement setup lost its selection",
    );
    return;
  }
  if (phase === "dogfood-replaced") {
    await until(
      () =>
        document.querySelector(".tiptap p").textContent === "第一段替换文字",
    );
    return;
  }
  if (phase === "dogfood-undo-selection") {
    await until(
      () =>
        document.querySelector(".tiptap p").textContent === "第一段原始文字",
    );
    await until(() => window.getSelection()?.toString() === "原始");
    assert(
      document.activeElement?.matches(".tiptap"),
      "Undo lost editor focus",
    );
    return;
  }
  if (phase === "dogfood-redo-selection") {
    await until(
      () =>
        document.querySelector(".tiptap p").textContent === "第一段替换文字",
    );
    const selection = window.getSelection();
    assert(
      selection.isCollapsed &&
        selection.anchorNode ===
          document.querySelector(".tiptap p").firstChild &&
        selection.anchorOffset === 5,
      "Redo caret moved to the end of the document",
    );
    return;
  }
  if (phase === "dogfood-continued") {
    await until(
      () => document.querySelector(".tiptap p").textContent === "第一段续文字",
    );
    assert(
      document.querySelectorAll(".tiptap p")[1].textContent ===
        "第二段保持不变",
      "Continued typing changed a different block",
    );
    return {
      titleEnterFocus: true,
      newNoteClearsSearch: true,
      compactWritingLayout: true,
      undoRedoCaret: true,
    };
  }
  if (phase === "quiet-input-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "安静输入回归");
    await wait(30);
    const editor = document.querySelector(".tiptap");
    editor.focus();
    const rect = editor.firstElementChild.getBoundingClientRect();
    return { x: Math.round(rect.left + 60), y: Math.round(rect.top + 12) };
  }
  if (phase === "quiet-plus-target") {
    await until(() =>
      document.querySelector('.writing-block-gutter [aria-label="添加内容"]'),
    );
    const rect = document
      .querySelector('.writing-block-gutter [aria-label="添加内容"]')
      .getBoundingClientRect();
    const point = {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
    assert(
      document
        .elementFromPoint(point.x, point.y)
        ?.closest('[aria-label="添加内容"]'),
      "Quiet plus pointer target is covered or outside the viewport: " +
        JSON.stringify(point),
    );
    return point;
  }
  if (phase === "quiet-plus-hover") {
    await until(() => document.querySelector(".writing-block-menu"));
    const button = document.querySelector(
      '.writing-block-gutter [aria-label="添加内容"]',
    );
    const style = getComputedStyle(button);
    assert(
      style.borderTopWidth === "0px" &&
        style.outlineStyle === "none" &&
        style.boxShadow === "none" &&
        getComputedStyle(button.parentElement).boxShadow === "none",
      "Empty-line plus still draws a border",
    );
    return true;
  }
  if (phase === "quiet-input-hidden" || phase === "quiet-delete-hidden") {
    const empty = phase === "quiet-delete-hidden";
    await until(
      () =>
        document.querySelector(".tiptap").textContent === (empty ? "" : "静"),
    );
    await wait(200);
    assert(
      !document.querySelector(".writing-block-gutter,.writing-block-menu"),
      "Typing/deleting left block tools visible before pointer movement",
    );
    assert(
      document.activeElement.matches(".tiptap"),
      "Hiding tools stole the writing focus",
    );
    return true;
  }
  if (phase === "quiet-pointer-restored") {
    await until(() => {
      const button = document.querySelector(
        '.writing-block-gutter [aria-label="添加内容"]',
      );
      return button && getComputedStyle(button.parentElement).opacity === "1";
    });
    const button = document.querySelector(
      '.writing-block-gutter [aria-label="添加内容"]',
    );
    assert(
      button && getComputedStyle(button.parentElement).opacity === "1",
      "Pointer movement did not restore the empty-line plus",
    );
    const editor = document.querySelector(".tiptap");
    const transfer = new DataTransfer();
    transfer.setData("text/html", "<p>第一行</p><p>第二行</p>");
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    await until(() => editor.children.length === 2);
    const range = document.createRange();
    range.selectNodeContents(editor.firstElementChild);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = editor.lastElementChild.getBoundingClientRect();
    return { x: Math.round(rect.left + 30), y: Math.round(rect.top + 10) };
  }
  if (phase === "quiet-row-restored") {
    const editor = document.querySelector(".tiptap"),
      gutter = editor
        .closest(".writing-rich-frame")
        .querySelector(".writing-block-gutter");
    assert(
      gutter &&
        getComputedStyle(gutter).opacity === "1" &&
        Math.abs(
          gutter.getBoundingClientRect().top -
            editor.lastElementChild.getBoundingClientRect().top,
        ) < 1,
      "Restored gutter followed the caret instead of the hovered row",
    );
    return { quietTypingTools: true, borderlessEmptyPlus: true };
  }
  if (phase === "selection-edge-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "左侧框选回归");
    await wait(25);
    const editor = document.querySelector(".tiptap");
    editor.focus();
    const transfer = new DataTransfer();
    transfer.setData(
      "text/html",
      "<p>Gutter selection starts here.</p><p>Across the second line.</p>",
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    await until(() => editor.children.length === 2);
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    window.edgeRevision = (await saved()).revision;

    const first = editor.firstElementChild.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(editor.lastElementChild);
    const last = range.getBoundingClientRect();
    return {
      x: Math.round(first.left - 1),
      y: Math.round(
        first.top +
          parseFloat(getComputedStyle(editor.firstElementChild).lineHeight) / 2,
      ),
      toX: Math.round(last.right + 1),
      toY: Math.round(last.top + last.height / 2),
    };
  }
  if (phase === "selection-edge-result") {
    const value = window.getSelection().toString();
    assert(
      value.includes("Gutter selection starts here.") &&
        value.includes("Across the second line."),
      "Gutter drag did not select across paragraphs: " + value,
    );
    assert(
      (await saved()).revision === window.edgeRevision,
      "Selecting text modified the document",
    );
    return { gutterTextSelection: true };
  }
  if (phase === "hover-menu-open") {
    await until(() => document.querySelector(".writing-block-menu"));
    return true;
  }
  if (phase === "hover-menu-closed") {
    await until(() => !document.querySelector(".writing-block-menu"));
    await wait(300);
    assert(
      !document.querySelector(".writing-block-menu"),
      "Click-closed menu reopened while pointer stayed on the trigger",
    );
    return { hoverMenuClickClose: true };
  }
  if (phase === "clipboard-table-target") {
    find("表格输出回归").click();
    await until(() => title()?.value === "表格输出回归");
    await openBlockMenu();
    const rect = document
      .querySelector('[aria-label="复制表格文本"]')
      .getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  if (phase === "clipboard-write-result") {
    await until(
      () =>
        document.querySelector('[aria-label="复制表格文本"]').dataset.copied,
    );
    return '名字\t备注\r\nA,B\t"说""你好"""\r\n多行\t"第一段\n第二段"';
  }
  if (phase === "clipboard-code-target") {
    const rect = document
      .querySelector('[aria-label="复制代码"]')
      .getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  if (phase === "clipboard-code-result") {
    await until(
      () => document.querySelector('[aria-label="复制代码"]').dataset.copied,
    );
    return document.querySelector("pre code").textContent;
  }
  if (phase === "code-preview") {
    find("代码高亮回归").click();
    await until(() => title()?.value === "代码高亮回归");
    const block = document.querySelector(".writing-code-block");
    block.scrollIntoView({ block: "center" });
    const rect = block.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  if (phase === "code-hover-result") {
    await until(
      () =>
        getComputedStyle(document.querySelector(".code-copy")).opacity === "1",
    );
    assert(
      getComputedStyle(document.querySelector(".hljs-keyword")).color !==
        getComputedStyle(document.querySelector("pre code")).color,
      "Code tokens are not visually highlighted",
    );
    return { syntaxHighlight: true, codeHoverCopy: true };
  }
  if (phase === "asset-preview") {
    find("Transformer").click();
    await until(() => title()?.value === "Transformer");
    const caption = document.querySelector('[aria-label="图片说明"]');
    assert(
      caption.value === "图 1 · 注意力示意",
      "Image caption lost after reopening",
    );
    document.querySelector(".canvas-image").scrollIntoView({ block: "start" });
    return true;
  }
  if (phase === "pdf-preview") {
    await until(() => document.querySelector('.asset-pdf[aria-busy="false"]'));
    await until(
      () =>
        Math.abs(
          parseFloat(document.querySelector(".asset-pdf canvas").style.width) -
            document.querySelector(".asset-pdf").clientWidth,
        ) < 2,
    );
    await wait(40);
    document.querySelector(".asset-pdf").scrollIntoView({ block: "start" });
    document.querySelector(".asset-pdf-page").scrollTop = 0;
    await wait(60);
    const page = document.querySelector(".asset-pdf canvas");
    const pixels = page
      .getContext("2d")
      .getImageData(0, 0, page.width, page.height).data;
    assert(
      pixels.some((value, index) => index % 4 === 0 && value < 120),
      "Resized PDF preview became blank",
    );
    return true;
  }
  if (phase === "math-preview") {
    find("Transformer").click();
    await until(() => title()?.value === "Transformer");
    const formula = document.querySelector('.tiptap [data-type="block-math"]');
    formula.scrollIntoView({ block: "center" });
    formula.click();
    await until(
      () =>
        document.querySelector('[aria-label="LaTeX 公式"]') ===
        document.activeElement,
    );
    return document.activeElement.value;
  }
  if (phase === "math-native-result") {
    const formula = document.querySelector('.tiptap [data-type="block-math"]');
    await until(() => formula.getAttribute("data-latex").endsWith("+1"));
    assert(
      document.querySelector('[aria-label="LaTeX 公式"]') ===
        document.activeElement,
      "Live formula preview stole input focus",
    );
    assert(
      formula.dataset.mathAlign === "right",
      "Live formula editing lost alignment",
    );
    const popup = document
      .querySelector(".writing-math-popover")
      .getBoundingClientRect();
    assert(
      popup.left >= 0 &&
        popup.right <= innerWidth &&
        popup.top >= 0 &&
        popup.bottom <= innerHeight,
      "Formula popup escaped the viewport",
    );
    return { nativeFormulaInput: true };
  }
  if (phase === "math-outside-target") {
    const rect = document
      .querySelector('[aria-label="搜索文稿"]')
      .getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  if (phase === "math-outside-result") {
    await until(() => !document.querySelector(".writing-math-popover"));
    assert(
      document
        .querySelector('.tiptap [data-type="block-math"]')
        .getAttribute("data-latex")
        .endsWith("+1"),
      "Clicking outside lost live formula changes",
    );
    return { formulaOutsideFinish: true };
  }
  if (phase === "table-output-preview") {
    find("表格输出回归").click();
    await until(() => title()?.value === "表格输出回归");
    const editor = document.querySelector(".tiptap");
    assert(
      editor.querySelector("td:last-child").textContent === '说"你好"' &&
        !editor.querySelector("table").textContent.includes("<br>"),
      "Table line breaks failed to reopen as rich content",
    );
    await openBlockMenu(editor);
    return true;
  }
  if (phase === "menu-pointer-prepare") {
    find("属性菜单锚点回归").click();
    await until(() => title()?.value === "属性菜单锚点回归");
    document.querySelector(".notes-scroll").scrollTop = 0;
    const editor = document.querySelector(".tiptap");
    window.menuOriginalContent = editor.innerHTML;
    const heading = editor.querySelector("h1").getBoundingClientRect();
    const item = editor.querySelector("ol > li").getBoundingClientRect();
    return {
      caretX: Math.round(heading.left + 10),
      caretY: Math.round(heading.top + 10),
      hoverX: Math.round(item.left + 10),
      hoverY: Math.round(item.top + 5),
    };
  }
  if (phase === "menu-pointer-target") {
    assert(
      document.hasFocus() && document.activeElement.matches(".tiptap"),
      "Properties regression requires a focused editor in a visible window",
    );
    assert(
      window.getSelection().anchorNode.parentElement.closest("h1"),
      "Caret must remain in the heading while hovering another block",
    );
    const trigger = document.querySelector(
      '.writing-block-gutter [aria-haspopup="menu"]',
    );
    assert(
      trigger.getAttribute("aria-label") === "编号列表属性",
      "Native hover did not target the list",
    );
    const rect = trigger.getBoundingClientRect();
    window.menuAnchorTop = rect.top;
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  if (phase === "menu-pointer-result") {
    await wait(100);
    assert(
      location.hash.startsWith("#/notes"),
      "Opening properties unexpectedly navigated to Canvas",
    );
    const menu = document.querySelector(".writing-block-menu");
    assert(menu, "Native trigger click immediately selected a menu action");
    assert(
      menu.querySelector(".writing-menu-label").textContent === "编号列表",
      "Native menu focus changed the block to the old caret",
    );
    const trigger = document.querySelector(
      '.writing-block-gutter [aria-haspopup="menu"]',
    );
    assert(
      Math.abs(trigger.getBoundingClientRect().top - window.menuAnchorTop) < 1,
      "Native properties click moved the anchor",
    );
    const rect = menu.getBoundingClientRect();
    assert(
      rect.top >= 0 && rect.bottom <= innerHeight,
      "Block menu escaped the viewport",
    );
    menuItem("在下方插入").focus();
    menuItem("在下方插入").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
    await until(() => document.querySelectorAll('[role="menu"]').length === 2);
    document.querySelector('.writing-add-menu [role="menuitem"]').focus();
    await wait(30);
    assert(
      trigger.getAttribute("aria-label") === "编号列表属性" &&
        Math.abs(trigger.getBoundingClientRect().top - window.menuAnchorTop) <
          1,
      "Submenu focus moved the properties anchor",
    );
    assert(
      document.querySelector(".tiptap").innerHTML ===
        window.menuOriginalContent,
      "Opening properties modified article content",
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await until(() => !document.querySelector('[role="menu"]'));
    return { stableBlockMenu: true };
  }
  if (phase === "tail-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "正文留白点击回归");
    await wait(30);
    const editor = document.querySelector(".tiptap");
    editor.focus();
    const data = new DataTransfer();
    data.setData("text/html", "<p>第一行</p><p>最后一行</p>");
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    title().focus();
    const pane = document
      .querySelector(".notes-scroll")
      .getBoundingClientRect();
    const body = editor.getBoundingClientRect();
    const y = Math.round(pane.bottom - 40);
    assert(y > body.bottom + 20, "Tail fixture is not outside the editor");
    window.tailRevision = (await saved()).revision;
    const points = [
      Math.round(body.left + 50),
      Math.round(pane.right - 15),
    ].map((x) => ({ x, y }));
    assert(
      points.every(
        ({ x, y }) =>
          getComputedStyle(document.elementFromPoint(x, y)).cursor === "text",
      ),
      "Blank writing area does not show text cursor",
    );
    return points;
  }
  if (phase === "tail-clicked") {
    const editor = document.querySelector(".tiptap");
    await until(() => document.activeElement === editor);
    const selection = window.getSelection();
    assert(
      selection.isCollapsed &&
        selection.anchorNode.textContent === "最后一行" &&
        selection.anchorOffset === 4,
      "Blank area did not place caret at the document end",
    );
    assert(
      editor.children.length === 2 &&
        (await saved()).revision === window.tailRevision,
      "Clicking blank space added content",
    );
    return true;
  }
  if (phase === "tail-typed") {
    await until(
      () =>
        document.querySelector(".tiptap").lastElementChild.textContent ===
        "最后一行继续输入",
    );
    assert(
      document.querySelector(".tiptap").children.length === 2,
      "Blank area typing added an unwanted paragraph",
    );
    return { blankAreaTyping: true };
  }
  if (phase === "notion-native-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "Notion 原生粘贴隔离验证");
    const editor = document.querySelector(".tiptap");
    editor.focus();
    editor.addEventListener(
      "paste",
      (event) => {
        const type = [...event.clipboardData.types].find((type) =>
          /^text\/_notion-blocks-v3-/.test(type),
        );
        const data = JSON.parse(event.clipboardData.getData(type));
        const blocks = data.blocks.map(
          (entry) => entry.blockSubtree.block[entry.blockId].value,
        );
        window.notionNativeExpected = {
          blocks: blocks.length,
          blanks: blocks.filter(
            (block) =>
              block.type === "text" &&
              !(block.properties?.title ?? []).map((run) => run[0]).join(""),
          ).length,
        };
      },
      { once: true },
    );
    return true;
  }
  if (phase === "notion-native-result") {
    await until(() => window.notionNativeExpected);
    const expected = window.notionNativeExpected;
    const nodes = [...document.querySelector(".tiptap").children];
    const blocks = nodes.reduce(
      (count, node) =>
        count + (node.matches("ul,ol") ? node.children.length : 1),
      0,
    );
    const blanks = nodes.filter(
      (node) => node.tagName === "P" && !node.textContent,
    ).length;
    assert(
      expected.blanks > 0 &&
        blanks === expected.blanks &&
        blocks === expected.blocks,
      "Native Notion clipboard blank count mismatch: " +
        JSON.stringify({ expected, blocks, blanks }),
    );
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    return { nativeNotionClipboard: { blocks, blanks } };
  }
  if (phase === "selection-preview") {
    find("上下文写作验证").click();
    await until(() => title()?.value === "上下文写作验证");
    await wait(50);
    const editor = document.querySelector(".tiptap");
    editor.focus();
    const text = editor.querySelector("strong").firstChild;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(first, first.textContent.length);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await until(() => document.querySelector(".writing-selection-toolbar"));
    return true;
  }
  if (phase === "outline-preview") {
    find("目录与表格预览").click();
    await until(() => title()?.value === "目录与表格预览");
    document.querySelector(".notes-scroll").scrollTop = 0;
    await until(() => document.querySelector(".writing-outline"));
    document.querySelector(".writing-outline").dispatchEvent(
      new PointerEvent("pointerover", {
        bubbles: true,
        pointerType: "mouse",
      }),
    );
    await until(() => document.querySelector(".writing-outline-panel"));
    checkTasks();
    return true;
  }
  if (phase === "outline-mobile") {
    checkTasks();
    const outline = document
      .querySelector(".writing-outline")
      .getBoundingClientRect();
    const pane = document
      .querySelector(".notes-scroll")
      .getBoundingClientRect();
    assert(
      outline.left >= pane.left &&
        outline.right <=
          document.querySelector(".tiptap").getBoundingClientRect().left &&
        Math.abs(
          pane.left -
            document
              .querySelector(".notes-writing-area")
              .getBoundingClientRect().left,
        ) < 1,
      "Mobile overlay outline reserved space or crossed the content margin",
    );
    return true;
  }
  if (phase === "empty-preview") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "空行插入预览");
    await wait(50);
    await openBlockMenu();
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    return true;
  }
  if (phase === "pointer-prepare") {
    document.querySelector('[aria-label="新建文稿"]').click();
    await until(() => title()?.value === "未命名文稿");
    input(title(), "鼠标拖动验证");
    await wait(30);
    const editor = document.querySelector(".tiptap");
    editor.focus();
    const transfer = new DataTransfer();
    transfer.setData(
      "text/html",
      "<p>鼠标拖动第一段</p><p>保留第二段</p><p>保留第三段</p>",
    );
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    await wait(50);
    document.querySelector(".notes-scroll").scrollTop = 0;
    const first = editor.firstElementChild.getBoundingClientRect();
    editor.firstElementChild.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: first.left + 10,
        clientY: first.top + 5,
      }),
    );
    await wait(50);
    const handle = editor
        .closest(".writing-rich-frame")
        .querySelector("[draggable]")
        .getBoundingClientRect(),
      last = editor.lastElementChild.getBoundingClientRect();
    document.querySelector(".writing-title").focus();
    const second = editor.children[1].getBoundingClientRect();
    return {
      x: Math.round(handle.left + handle.width / 2),
      y: Math.round(handle.top + handle.height / 2),
      gutterX: Math.round(first.left - 54),
      gutterY: Math.round((second.top + second.bottom) / 2),
      firstY: Math.round(first.top + 5),
      toX: Math.round(last.left - 90),
      bodyX: Math.round(last.left + 60),
      rightX: Math.round(last.right + 24),
      toY: Math.round(last.bottom - 2),
    };
  }
  if (phase === "gutter-hover") {
    const editor = document.querySelector(".tiptap");
    const frame = editor.closest(".writing-rich-frame");
    const gutter = frame.querySelector(".writing-block-gutter");
    const second = editor.children[1].getBoundingClientRect();
    await until(
      () =>
        getComputedStyle(gutter).opacity === "1" &&
        Math.abs(gutter.getBoundingClientRect().top - second.top) < 1,
    );
    assert(
      !frame.contains(document.activeElement),
      "Hover verification depends on editor focus",
    );
    return true;
  }
  if (phase === "margin-drag") {
    await until(() => document.querySelector(".writing-drop-line"));
    assert(
      document.querySelectorAll(".writing-drop-line").length === 1 &&
        ![...document.querySelectorAll(".writing-native-dropcursor")].some(
          (node) => getComputedStyle(node).display !== "none",
        ),
      "Duplicate native drop cursor is visible during block drag",
    );
    const line = document
      .querySelector(".writing-drop-line")
      .getBoundingClientRect();
    const last = document
      .querySelector(".tiptap")
      .lastElementChild.getBoundingClientRect();
    assert(
      Math.abs(line.top - last.bottom) < 1,
      "Margin drag marker does not match drop target",
    );
    return true;
  }
  if (phase === "pointer-result") {
    await until(
      () =>
        [...document.querySelector(".tiptap").children]
          .map((e) => e.textContent)
          .join("|") === "保留第二段|保留第三段|鼠标拖动第一段",
    );
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    const editor = document.querySelector(".tiptap"),
      first = editor.firstElementChild,
      rect = first.getBoundingClientRect();
    first.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + 10,
        clientY: rect.top + 5,
      }),
    );
    await wait(30);
    editor
      .closest(".writing-rich-frame")
      .querySelector('[aria-haspopup="menu"]')
      .dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
    await until(() => document.querySelector('[role="menu"]'));
    return { nativeBlockDrag: true };
  }
  if (phase === "selection-navigation") {
    const snapshot = await saved();
    const originalId = new URLSearchParams(location.hash.split("?")[1]).get(
      "note",
    );
    const key = "nomi:notes:local-device:selected";
    const [first, second] = snapshot.notes;
    const selectedId = () =>
      document.querySelector("[data-note-row][data-selected]")?.dataset.noteRow;
    const open = async (id) => {
      location.hash = "/notes?note=" + encodeURIComponent(id);
      await until(
        () => selectedId() === id && localStorage.getItem(key) === id,
      );
    };
    const canvas = async () => {
      document.querySelector('.rail-destinations a[href="#/canvas"]').click();
      await until(
        () => !title() && document.querySelector('[aria-label="编辑文档 DSL"]'),
      );
    };
    const notes = async (id) => {
      document.querySelector('.rail-destinations a[href="#/notes"]').click();
      await until(
        () => selectedId() === id && localStorage.getItem(key) === id,
      );
    };
    await open(second.id);
    await canvas();
    assert(
      localStorage.getItem(key) === second.id,
      "Leaving Notes erased selection",
    );
    await notes(second.id);
    await canvas();
    await open(first.id);
    assert(
      selectedId() === first.id,
      "Explicit note link did not override remembered selection",
    );
    await open(second.id);
    window.history.back();
    await until(
      () => selectedId() === first.id && localStorage.getItem(key) === first.id,
    );
    window.history.forward();
    await until(
      () =>
        selectedId() === second.id && localStorage.getItem(key) === second.id,
    );
    await canvas();
    localStorage.setItem(key, "deleted-note");
    await notes(first.id);
    assert(
      (await saved()).revision === snapshot.revision,
      "Selection navigation changed document revision",
    );
    await open(originalId);
    return {
      rememberedNote: true,
      explicitNotePriority: true,
      noteHistory: true,
      missingNoteFallback: true,
    };
  }
  if (phase === "restored") {
    assert(
      title()?.value === "空行插入预览",
      "Last selected note lost after reload",
    );
    const savedWidth = Number(
      localStorage.getItem("nomi:notes:local-device:library-width"),
    );
    assert(
      Number(
        document
          .querySelector(".notes-library-resizer")
          .getAttribute("aria-valuenow"),
      ) === savedWidth,
      "Sidebar width lost after reload",
    );
    await until(() => find("单一空正文回归"));
    find("单一空正文回归").click();
    await until(() => title()?.value === "单一空正文回归");
    assert(
      document.querySelectorAll(".tiptap").length === 1 &&
        document.querySelector(".tiptap").textContent === "一个连续的正文",
      "Single empty body lost after reload",
    );
    await until(() => find("列表项拖动回归"));
    find("列表项拖动回归").click();
    await until(() => title()?.value === "列表项拖动回归");
    assert(
      [...document.querySelectorAll(".tiptap li")]
        .map((node) => node.textContent)
        .join("|") === "A|C|X|Y|B",
      "List item moves lost after reload",
    );
    await until(() => find("Notion 空块回归"));
    find("Notion 空块回归").click();
    await until(() => title()?.value === "Notion 空块回归");
    const notionNodes = [...document.querySelector(".tiptap").children];
    assert(
      notionNodes.length === 9 &&
        notionNodes.filter((node) => node.tagName === "P" && !node.textContent)
          .length === 6 &&
        document.querySelector(".tiptap strong") &&
        document.querySelector(".tiptap a"),
      "Notion blank blocks or rich styles lost after reload",
    );
    await until(() => find("粘贴空行回归"));
    find("粘贴空行回归").click();
    await until(() => title()?.value === "粘贴空行回归");
    const paragraphs = [...document.querySelector(".tiptap").children];
    assert(
      paragraphs.length === 7 &&
        paragraphs[1].textContent === "" &&
        paragraphs[2].textContent === "",
      "Blank paragraphs lost after full reload",
    );
    find("Transformer").click();
    await until(() => title()?.value === "Transformer");
    assert(
      document.querySelector(".tiptap").textContent.includes("作者的表达"),
      "Rich content lost",
    );
    assert(document.querySelector(".katex"), "Formula lost");
    assert(
      document.querySelector(
        '.tiptap [data-type="block-math"][data-math-align="right"]',
      ),
      "Formula alignment lost after full reload",
    );
    assert(document.querySelector(".learning-slider input"), "Experiment lost");
    assert(
      document.querySelector('[aria-label="图片说明"]').value ===
        "图 1 · 注意力示意",
      "Caption lost after full reload",
    );
    return { restored: true };
  }
  const before = await saved();
  for (const target of [
    title(),
    document.querySelector(".notes-list-select"),
    document.querySelector(".notes-row-menu"),
  ]) {
    target.focus();
    await wait(20);
    const style = getComputedStyle(target);
    assert(
      style.outlineStyle === "none" && style.boxShadow === "none",
      "Writing focus still draws a frame: " + target.className,
    );
  }
  document.activeElement.blur();
  await wait(120);
  assert(
    (await saved()).revision === before.revision,
    "Opening rich editor rewrote original",
  );
  // Clipboard producer divs, plain text line breaks, block menus and transactional dragging.
  {
    const create = async (name) => {
      document.querySelector('[aria-label="新建文稿"]').click();
      await until(() => title()?.value === "未命名文稿");
      input(title(), name);
      await wait(20);
      const editor = document.querySelector(".tiptap");
      editor.focus();
      const rect = editor.firstElementChild.getBoundingClientRect();
      for (const offset of [22, 23])
        editor.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: rect.left + offset,
            clientY: rect.top + 4,
          }),
        );
      await wait(20);
      return editor;
    };
    const paste = (editor, html, text = "", notion) => {
      const transfer = new DataTransfer();
      if (html) transfer.setData("text/html", html);
      transfer.setData("text/plain", text);
      if (notion)
        transfer.setData(
          "text/_notion-blocks-v3-production",
          JSON.stringify(notion),
        );
      editor.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    };
    const openProperties = async (editor, index = 0) => {
      const node = editor.children[index],
        rect = node.getBoundingClientRect();
      node.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: rect.left + 20,
          clientY: rect.top + 4,
        }),
      );
      await wait(20);
      const button = editor
        .closest(".writing-rich-frame")
        .querySelector('[aria-haspopup="menu"]');
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
      await until(() => document.querySelector('[role="menu"]'));
    };
    checkpoint("single-empty-editor");
    await create("单一空正文回归");
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    const emptyId = new URLSearchParams(location.hash.split("?")[1]).get(
      "note",
    );
    location.hash = "/canvas";
    await until(() => document.querySelector('[aria-label="编辑文档 DSL"]'));
    document.querySelector('[aria-label="编辑文档 DSL"]').click();
    await until(() => document.querySelector('[aria-label="文档 DSL 源码"]'));
    const dsl = document.querySelector('[aria-label="文档 DSL 源码"]');
    const documentValue = JSON.parse(dsl.value);
    const emptyNote = documentValue.notes.find((note) => note.id === emptyId);
    const peer = {
      ...documentValue.blocks.find((block) => block.id === emptyNote.blocks[0]),
      id: "test.empty.peer",
      source: "",
    };
    documentValue.blocks.push(peer);
    emptyNote.blocks.push(peer.id);
    input(dsl, JSON.stringify(documentValue));
    find("校验并应用").click();
    await until(() => !document.querySelector('[aria-label="文档 DSL 源码"]'));
    location.hash = "/notes?note=" + emptyId;
    await until(() => title()?.value === "单一空正文回归");
    assert(
      document.querySelectorAll(".tiptap").length === 1,
      "Adjacent empty blocks created two editors",
    );
    assert(
      (await saved()).notes.find((note) => note.id === emptyId).blocks
        .length === 2,
      "Opening an empty note rewrote its blocks",
    );
    document.querySelector(".tiptap").focus();
    document.execCommand("insertText", false, "一个连续的正文");
    await until(async () =>
      (await saved()).blocks.some(
        (block) =>
          block.type === "markdown" && block.source.includes("一个连续的正文"),
      ),
    );
    await until(
      () => document.querySelector(".notes-save").dataset.saveState === "saved",
    );
    assert(
      (await saved()).notes.find((note) => note.id === emptyId).blocks
        .length === 1,
      "Typing left a second empty body",
    );
    checkpoint("block-menu-anchor");
    const menuEditor = await create("属性菜单锚点回归");
    paste(
      menuEditor,
      "<h1>光标留在标题</h1><p>正文段落</p><ol><li>阅读<ol><li>嵌套项目</li></ol></li><li>推导</li></ol><p>最后一段</p>",
    );
    await wait(40);
    checkpoint("outline-table");
    const outlineEditor = await create("目录与表格预览");
    const outlineGeometry = () =>
      [title(), outlineEditor].map((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
    const withoutOutline = outlineGeometry();
    const assertStableOutline = (phase) => {
      const current = outlineGeometry();
      assert(
        current.every(
          (rect, i) =>
            Math.abs(rect.left - withoutOutline[i].left) < 1 &&
            Math.abs(rect.width - withoutOutline[i].width) < 1,
        ),
        `Unpinned outline moved/resized content (${phase})`,
      );
    };
    paste(
      outlineEditor,
      "",
      "## 注意力机制\n\n- [ ] 写下一个问题\n- [ ] 添加参考资料\n- [x] 试着修改这篇笔记\n\n| 组件 | 输入 | 作用 |\n| --- | --- | --- |\n| Query | 当前词的表示 | 寻找相关信息 |\n| Key | 上下文的表示 | 计算匹配程度 |\n| Value | 上下文的内容 | 汇集注意力结果 |\n\n" +
        "理解一个词，需要观察它与上下文的关系。".repeat(70) +
        "\n\n### 从相似度到权重\n\n" +
        "点积衡量相关性，Softmax 将分数转成权重。".repeat(60) +
        "\n\n## 多头注意力\n\n" +
        "不同的头关注不同的关系。".repeat(80),
    );
    await until(
      () =>
        document.querySelectorAll(".writing-outline-rail span").length === 3,
    );
    assert(
      outlineEditor.querySelector("table") &&
        getComputedStyle(outlineEditor.querySelector("td")).paddingLeft ===
          "15px",
      "Styled Markdown table paste failed",
    );
    const outline = document.querySelector(".writing-outline");
    assertStableOutline("first heading appeared");
    checkTasks();
    const checkbox = outlineEditor.querySelector('input[type="checkbox"]');
    checkbox.click();
    await until(
      () =>
        checkbox.checked && checkbox.closest("li").dataset.checked === "true",
    );
    assert(
      outline.getBoundingClientRect().right <=
        outlineEditor.getBoundingClientRect().left,
      "Collapsed outline is not inside the left content margin",
    );
    outline.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
    );
    await until(
      () => outline.querySelectorAll('[role="navigation"] button').length === 3,
    );
    assertStableOutline("hover expanded");
    const sectionLinks = outline.querySelectorAll('[role="navigation"] button');
    assert(
      sectionLinks[1].dataset.level === "3",
      "Outline heading hierarchy lost",
    );
    const heading = outlineEditor.querySelector("h3");
    outlineEditor.focus();
    const headingRange = document.createRange();
    headingRange.selectNodeContents(heading);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(headingRange);
    document.execCommand("insertText", false, "从分数到权重");
    await until(
      () =>
        outline.querySelectorAll('[role="navigation"] button')[1]
          .textContent === "从分数到权重",
    );
    sectionLinks[2].click();
    await until(
      () => sectionLinks[2].getAttribute("aria-current") === "location",
    );
    document.querySelector('[aria-label="固定目录"]').click();
    await until(() => outline.dataset.pinned);
    assert(
      outlineGeometry()[0].left > withoutOutline[0].left + 1,
      "Pinned outline did not reserve layout space",
    );
    assert(
      getComputedStyle(outline.querySelector(".writing-outline-panel"))
        .borderRightWidth === "0px",
      "Pinned outline still has a vertical divider",
    );
    assert(
      outline.getBoundingClientRect().right <=
        document.querySelector(".notes-scroll").getBoundingClientRect().left +
          1,
      "Pinned outline is not on the left",
    );
    document.querySelector('[aria-label="取消固定目录"]').click();
    outline.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await until(() => !document.querySelector(".writing-outline-panel"));
    assertStableOutline("unpin and collapse");
    document.querySelector(".notes-scroll").scrollTop = 0;
    checkpoint("list-items");
    const listEditor = await create("列表项拖动回归");
    await until(() => !document.querySelector(".writing-outline"));
    assert(
      Math.abs(title().getBoundingClientRect().left - withoutOutline[0].left) <
        1,
      "Hiding outline shifted the document title",
    );
    paste(
      listEditor,
      "<ul><li>A</li><li>B</li><li>C</li></ul><p>separator</p><ol><li>X</li><li>Y</li></ol><p>tail</p>",
    );
    await wait(50);
    const li = (text) =>
      [...listEditor.querySelectorAll("li")].find(
        (node) => node.textContent === text,
      );
    const dragListItem = async (text, target) => {
      const node = li(text),
        rect = node.getBoundingClientRect();
      node.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: rect.left + 8,
          clientY: rect.top + 3,
        }),
      );
      await wait(30);
      const handle = listEditor
        .closest(".writing-rich-frame")
        .querySelector("[draggable]");
      assert(
        Math.abs(handle.getBoundingClientRect().top - rect.top) < 1,
        "List item does not have its own drag handle",
      );
      const dataTransfer = new DataTransfer();
      handle.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      const pane = document.querySelector(".notes-scroll"),
        bounds = target.getBoundingClientRect();
      const coords = { clientX: bounds.left - 70, clientY: bounds.top + 2 };
      for (const type of ["dragover", "drop"])
        pane.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            ...coords,
          }),
        );
      handle.dispatchEvent(
        new DragEvent("dragend", { bubbles: true, dataTransfer }),
      );
      await wait(80);
    };
    await dragListItem("B", li("Y"));
    assert(
      [...listEditor.querySelectorAll("ul li")]
        .map((node) => node.textContent)
        .join("") === "AC" &&
        [...listEditor.querySelectorAll("ol li")]
          .map((node) => node.textContent)
          .join("") === "XBY",
      "Cross-list item move changed other items",
    );
    document.querySelector(".writing-article").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(60);
    assert(
      [...listEditor.querySelectorAll("ul li")]
        .map((node) => node.textContent)
        .join("") === "ABC",
      "List item undo failed",
    );
    await dragListItem(
      "B",
      [...listEditor.children].find(
        (node) => node.tagName === "P" && node.textContent === "tail",
      ),
    );
    assert(
      [...listEditor.querySelectorAll("li")]
        .map((node) => node.textContent)
        .join("|") === "A|C|X|Y|B" &&
        listEditor.querySelectorAll("ul").length === 2,
      "Item dragged outside list lost style or neighbors",
    );
    checkpoint("contextual-start");
    const blank = await create("空行菜单回归");
    assert(
      blank
        .closest(".writing-rich-frame")
        .querySelector('[aria-label="添加内容"]'),
      "Empty paragraph has no plus",
    );
    assert(
      !blank.closest(".writing-rich-frame").querySelector("[draggable]"),
      "Empty paragraph still shows drag handle",
    );
    await openBlockMenu(blank);
    document.querySelector('[aria-label="插入标题 2"]').click();
    await wait(50);
    assert(
      blank.children.length === 1 && blank.firstElementChild.tagName === "H2",
      "Empty paragraph insertion leaves an extra paragraph: " + blank.innerHTML,
    );
    document.execCommand("insertText", false, "空行直接变成标题");
    await wait(30);
    assert(
      !blank
        .closest(".writing-rich-frame")
        .querySelector('[aria-label="添加内容"]'),
      "Plus remains on populated heading",
    );
    const codeEditor = await create("代码高亮回归");
    const codeSource = 'const message = "Nomi";\nconsole.log(message);';
    paste(
      codeEditor,
      '<pre><code class="language-javascript">const message = "Nomi";\nconsole.log(message);</code></pre>',
    );
    await until(() => codeEditor.querySelector(".hljs-keyword"));
    assert(
      codeEditor.querySelector("pre code").textContent === codeSource,
      "Highlighting changed source text",
    );
    const codeClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.copiedCode = value;
        },
      },
    });
    try {
      codeEditor.querySelector('[aria-label="复制代码"]').click();
      await until(
        () =>
          codeEditor.querySelector('[aria-label="复制代码"]').dataset.copied,
      );
      assert(
        window.copiedCode === codeSource,
        "Code copy included formatting or toolbar text",
      );
    } finally {
      if (codeClipboard)
        Object.defineProperty(navigator, "clipboard", codeClipboard);
      else delete navigator.clipboard;
    }
    const dividerEditor = await create("分割线回归");
    paste(dividerEditor, "<p>上方文字</p><hr><p>下方文字</p>");
    await until(() => dividerEditor.querySelector("hr"));
    const divider = dividerEditor.querySelector("hr");
    const dividerStyle = getComputedStyle(divider);
    assert(
      divider.getBoundingClientRect().height === 28 &&
        dividerStyle.backgroundPosition === "50% 50%" &&
        dividerStyle.backgroundSize === "100% 1px" &&
        dividerStyle.borderTopWidth === "0px" &&
        !dividerStyle.backgroundImage.includes("rgb(0, 0, 0)"),
      "Divider is not a centered gray hairline",
    );
    const table = await create("表格菜单回归");
    await insertFromMenu("表格", table);
    await until(() => table.querySelector("table"));
    assert(
      table.firstElementChild.querySelector("table") ||
        table.firstElementChild.tagName === "TABLE",
      "Table insertion left a duplicate empty paragraph",
    );
    await openBlockMenu(table);
    menuItem("加一行").click();
    await wait(50);
    assert(
      table.querySelectorAll("tr").length === 4,
      "Table row tools are missing after removing toolbar",
    );
    const outputEditor = await create("表格输出回归");
    paste(
      outputEditor,
      '<table><tr><th>名字</th><th>备注</th></tr><tr><td>A,B</td><td>说"你好"</td></tr><tr><td>多行</td><td><p>第一段</p><p>第二段</p></td></tr></table>',
    );
    await until(() => outputEditor.querySelector("table"));
    await openBlockMenu(outputEditor);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedTableText = text;
        },
      },
    });
    try {
      document.querySelector('[aria-label="复制表格文本"]').click();
      await until(() => window.copiedTableText);
      assert(
        window.copiedTableText ===
          '名字\t备注\r\nA,B\t"说""你好"""\r\n多行\t"第一段\n第二段"',
        "Copied table lost cell text or line breaks",
      );
      await until(
        () =>
          document.querySelector('[aria-label="复制表格文本"]').dataset.copied,
      );
    } finally {
      if (clipboardDescriptor)
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else delete navigator.clipboard;
    }
    document.querySelector('[aria-label="下载 CSV"]').click();
    await until(() => !document.querySelector('[role="menu"]'));
    const inlineEditor = await create("行内公式回归");
    document.execCommand("insertText", false, "前 x^2 后");
    await wait(30);
    const inlineRange = document.createRange();
    inlineRange.setStart(inlineEditor.querySelector("p").firstChild, 2);
    inlineRange.setEnd(inlineEditor.querySelector("p").firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(inlineRange);
    document.dispatchEvent(new Event("selectionchange"));
    await until(() => document.querySelector('[aria-label="行内公式"]'));
    document.querySelector('[aria-label="行内公式"]').click();
    await until(() => document.querySelector('[aria-label="LaTeX 公式"]'));
    input(document.querySelector('[aria-label="LaTeX 公式"]'), "x^3");
    await until(() => inlineEditor.querySelector('[data-type="inline-math"]'));
    assert(
      inlineEditor
        .querySelector('[data-type="inline-math"]')
        .getAttribute("data-latex") === "x^3" &&
        inlineEditor.querySelector("p").textContent.startsWith("前 ") &&
        inlineEditor.querySelector("p").textContent.endsWith(" 后"),
      "Inline formula did not replace only the selected text",
    );
    document
      .querySelector('[aria-label="LaTeX 公式"]')
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await until(() => !document.querySelector(".writing-math-popover"));
    const styled = await create("上下文写作验证");
    document.execCommand("insertText", false, "局部样式，保持选区。");
    await wait(30);
    const text = styled.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await until(() => document.querySelector('[aria-label="选中文字样式"]'));
    const bubble = () => document.querySelector('[aria-label="选中文字样式"]');
    const bubbleStart = bubble().getBoundingClientRect();
    const stableBubble = () => {
      const box = bubble().getBoundingClientRect();
      assert(
        Math.abs(box.left - bubbleStart.left) < 0.5 &&
          Math.abs(box.top - bubbleStart.top) < 0.5,
        "Formatting moved selection popup: " +
          JSON.stringify({
            before: { x: bubbleStart.left, y: bubbleStart.top },
            after: { x: box.left, y: box.top },
          }),
      );
    };
    const mark = (name) => {
      const button = bubble().querySelector(`[aria-label="${name}"]`);
      button.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      button.click();
    };
    mark("粗体");
    await wait(50);
    assert(
      styled.querySelector("strong")?.textContent === "局部样式",
      "Selection bold touched wrong text",
    );
    assert(
      window.getSelection().toString() === "局部样式",
      "Format click lost selection",
    );
    stableBubble();
    mark("斜体");
    await wait(50);
    assert(
      styled.querySelector("em")?.textContent === "局部样式",
      "Selection italic missing",
    );
    stableBubble();
    mark("斜体");
    await wait(50);
    stableBubble();
    mark("斜体");
    await wait(50);
    stableBubble();
    const scrollPane = document.querySelector(".notes-scroll");
    const viewportArticle = document.querySelector(".writing-article");
    viewportArticle.style.minHeight = "1600px";
    const beforeScroll = bubble().getBoundingClientRect();
    scrollPane.scrollTop = 16;
    await wait(80);
    assert(
      Math.abs(bubble().getBoundingClientRect().top - beforeScroll.top + 16) <
        1,
      "Pinned selection popup did not follow scroll",
    );
    scrollPane.scrollTop = 0;
    viewportArticle.style.minHeight = "";
    await wait(80);
    mark("链接");
    await until(() => document.querySelector('[aria-label="链接地址"]'));
    input(
      document.querySelector('[aria-label="链接地址"]'),
      "https://example.com/article",
    );
    find("保存链接").click();
    await wait(80);
    assert(
      styled.querySelector("a")?.textContent === "局部样式" &&
        styled.querySelector("a")?.getAttribute("href") ===
          "https://example.com/article",
      "Link dialog lost selection",
    );
    styled.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await wait(30);
    assert(!bubble(), "Escape did not dismiss selection popup");
    await openBlockMenu(styled);
    document.querySelector('[role="menuitem"][aria-label="删除线"]').click();
    await wait(50);
    assert(
      [...styled.querySelectorAll("s")]
        .map((node) => node.textContent)
        .join("") === "局部样式，保持选区。",
      "Block-level basic formatting does not target hovered block",
    );
    checkpoint("contextual-roundtrip");
    await insertFromMenu("表格", styled);
    assert(
      document.querySelector(".tiptap table"),
      "Source mode insertion lost table",
    );
    assert(
      document.querySelector(".tiptap strong") &&
        document.querySelector(".tiptap em") &&
        document.querySelector(".tiptap a") &&
        document.querySelector(".tiptap s"),
      "Contextual styles lost in Markdown round trip",
    );
    checkpoint("clipboard-start");
    const notionEditor = await create("Notion 空块回归");
    const notion = {
      blocks: [
        ["text", ""],
        ["text", "A"],
        ["text", ""],
        ["text", ""],
        ["bulleted_list", "B"],
        ["bulleted_list", "C"],
        ["text", ""],
        ["text", "D"],
        ["text", ""],
        ["text", ""],
      ].map(([type, text], index) => ({
        blockId: String(index),
        blockSubtree: {
          __version__: 3,
          block: {
            [index]: {
              value: {
                type,
                alive: true,
                ...(text ? { properties: { title: [[text]] } } : {}),
              },
            },
          },
        },
      })),
    };
    paste(
      notionEditor,
      '<p><strong>A</strong></p><ul><li>B</li><li>C</li></ul><p><a href="https://example.com">D</a></p>',
      "A\n\n- B\n- C\n\nD",
      notion,
    );
    await wait(80);
    const notionShape = () =>
      [...document.querySelector(".tiptap").children].map((node) => [
        node.tagName,
        node.textContent,
      ]);
    const expectedNotion = [
      ["P", ""],
      ["P", "A"],
      ["P", ""],
      ["P", ""],
      ["UL", "BC"],
      ["P", ""],
      ["P", "D"],
      ["P", ""],
      ["P", ""],
    ];
    assert(
      JSON.stringify(notionShape()) === JSON.stringify(expectedNotion),
      "Notion blank restoration mismatch: " + JSON.stringify(notionShape()),
    );
    assert(
      notionEditor.querySelector("strong") && notionEditor.querySelector("a"),
      "Notion restoration lost rich styles",
    );
    assert(
      JSON.stringify(notionShape()) === JSON.stringify(expectedNotion),
      "Notion blanks lost in Markdown roundtrip",
    );
    const editor = await create("粘贴空行回归");
    paste(
      editor,
      '<div data-block-id="a">段落 A</div><div data-block-id="blank"><br></div><div data-block-id="blank2"></div><div><strong>段落 B</strong></div><h2>标题</h2><p><br></p><p>段落 C</p>',
      "段落 A\n\n\n段落 B\n标题\n\n段落 C",
    );
    await wait(80);
    const blocks = () =>
      [...document.querySelector(".tiptap").children].map((e) => [
        e.tagName,
        e.textContent,
      ]);
    const original = blocks();
    assert(
      original.length === 7 &&
        original[1][1] === "" &&
        original[2][1] === "" &&
        original[5][1] === "",
      "HTML clipboard lost blank paragraphs: " + JSON.stringify(original),
    );
    assert(editor.querySelector("strong"), "Paste lost bold text");
    assert(
      JSON.stringify(blocks()) === JSON.stringify(original),
      "Markdown round trip lost blank paragraphs",
    );
    // Leave/reopen to cover persisted Markdown rather than only the editor DOM.
    const plain = await create("纯文本空行回归");
    paste(plain, "", "第一段\r\n\r\n\r\n第二段\n");
    await wait(50);
    assert(
      plain.children.length === 5,
      "Plain clipboard collapsed consecutive lines",
    );
    assert(
      document.querySelector(".tiptap").children.length === 5,
      "Plain blank lines lost after Markdown mode",
    );
    find("粘贴空行回归").click();
    await wait(70);
    assert(
      JSON.stringify(blocks()) === JSON.stringify(original),
      "Saved HTML empty paragraphs lost on reopen",
    );
    const formulaPaste = await create("公式粘贴回归");
    paste(
      formulaPaste,
      '<p>公式之前</p><div data-type="block-math" data-latex="x^2"></div><p>公式之后</p>',
    );
    await wait(60);
    assert(
      formulaPaste.querySelector(".katex"),
      "Clipboard normalization destroyed an existing math node",
    );
    checkpoint("drag-start");
    const dragEditor = await create("块操作回归");
    paste(dragEditor, "<p>第一段</p><p>第二段</p><p>第三段</p>");
    await wait(50);
    await openProperties(dragEditor, 1);
    document.querySelector('[aria-label="转换为标题 2"]').click();
    await wait(50);
    assert(
      dragEditor.children[1].tagName === "H2" &&
        dragEditor.children[1].textContent === "第二段",
      "Type conversion changed the wrong paragraph",
    );
    const move = async (sourceEditor, index, targetSection, y) => {
      const child = sourceEditor.children[index],
        rect = child.getBoundingClientRect();
      child.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: rect.left + 15,
          clientY: rect.top + 4,
        }),
      );
      await wait(20);
      const handle = sourceEditor
        .closest(".writing-rich-frame")
        .querySelector("[draggable]");
      const transfer = new DataTransfer();
      handle.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      targetSection.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientY: y,
          clientX: rect.left + 20,
        }),
      );
      await wait(20);
      assert(
        document.querySelector(".writing-drop-line"),
        "Drag has no insertion indicator",
      );
      targetSection.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientY: y,
          clientX: rect.left + 20,
        }),
      );
      handle.dispatchEvent(
        new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }),
      );
      await wait(60);
    };
    await move(
      dragEditor,
      0,
      dragEditor.closest(".writing-block"),
      dragEditor.lastElementChild.getBoundingClientRect().bottom + 2,
    );
    assert(
      [...dragEditor.children].map((e) => e.textContent).join("|") ===
        "第二段|第三段|第一段",
      "Paragraph drag failed",
    );
    document.querySelector(".writing-article").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(50);
    assert(
      [...dragEditor.children].map((e) => e.textContent).join("|") ===
        "第一段|第二段|第三段",
      "Drag undo lost content",
    );
    checkpoint("experiment-start");
    await insertFromMenu("交互实验");
    await wait(30);
    find("添加 Softmax 温度实验").click();
    await until(() => document.querySelector(".learning-slider"));
    const experiment = document.querySelector(".writing-block-interactive");
    const transfer = new DataTransfer();
    experiment.querySelector("[draggable]").dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    const second = dragEditor.children[1].getBoundingClientRect();
    dragEditor.closest(".writing-block").dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: second.left + 10,
        clientY: second.top + 1,
      }),
    );
    await wait(70);
    const rows = [...document.querySelectorAll("[data-writing-block]")];
    assert(
      rows[0].textContent.includes("第一段") &&
        rows[1].classList.contains("writing-block-interactive") &&
        rows[2].textContent.includes("第二段") &&
        rows[2].textContent.includes("第三段"),
      "Embed drag did not split text at the target paragraph",
    );
    const first = document.querySelector(".tiptap");
    await move(
      first,
      0,
      experiment,
      experiment.getBoundingClientRect().bottom - 1,
    );
    assert(
      [...document.querySelectorAll("[data-writing-block]")].findIndex((e) =>
        e.classList.contains("writing-block-interactive"),
      ) <
        [...document.querySelectorAll("[data-writing-block]")].findIndex((e) =>
          e.textContent.includes("第一段"),
        ),
      "Paragraph cannot cross embed",
    );
    const article = document.querySelector(".writing-article");
    article.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(60);
    const undoRows = [...document.querySelectorAll("[data-writing-block]")];
    assert(
      undoRows[0].textContent.includes("第一段") &&
        undoRows[1].classList.contains("writing-block-interactive") &&
        undoRows[2].textContent.includes("第二段"),
      "Keyboard undo did not restore cross-block move atomically",
    );
    assert(
      !document.querySelector('[aria-label="在此块后添加"]'),
      "Independent plus button remains",
    );
  }
  document.querySelector('[aria-label="新建文稿"]').click();
  await until(() => title()?.value === "未命名文稿");
  input(title(), "Transformer");
  await wait(30);
  checkpoint("original-start");
  const rich = document.querySelector(".tiptap");
  rich.focus();
  await until(
    () => document.querySelector(".notes-save").dataset.saveState === "saved",
  );
  const writes = window.canvasFixture.documentWrites;
  const status = document.querySelector(".notes-save").textContent;
  for (const character of "作者的表达，由我自己书写。") {
    document.execCommand("insertText", false, character);
    await wait(35);
    assert(
      document.querySelector(".notes-save").textContent === status,
      "Save label flashes during input",
    );
  }
  assert(
    window.canvasFixture.documentWrites === writes,
    "Each keystroke still writes to IndexedDB",
  );
  await until(
    () => document.querySelector(".notes-save").dataset.saveState === "saved",
  );
  assert(
    window.canvasFixture.documentWrites === writes + 1,
    "Typing was not coalesced into one save",
  );
  assert(
    JSON.stringify(await saved()).includes("作者的表达"),
    "Latest text not saved",
  );
  assert(
    !document.querySelector(".writing-format-host, .writing-insert"),
    "Permanent article toolbars remain",
  );
  checkpoint("formula-start");
  await insertFromMenu("公式");
  await until(() => document.querySelector('[aria-label="LaTeX 公式"]'));
  input(
    document.querySelector('[aria-label="LaTeX 公式"]'),
    "Attention(Q,K,V)=\\mathrm{softmax}(QK^T/\\sqrt{d_k})V",
  );
  await until(() => document.querySelector(".katex"));
  assert(
    document.querySelector(".writing-math-popover") &&
      !document.querySelector('[aria-modal="true"]'),
    "Formula editing still opens a modal or requires a save step",
  );
  document
    .querySelector('[aria-label="LaTeX 公式"]')
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await until(() => !document.querySelector(".writing-math-popover"));
  const formula = document.querySelector('.tiptap [data-type="block-math"]');
  formula.click();
  await until(() => document.querySelector('[aria-label="LaTeX 公式"]'));
  input(
    document.querySelector('[aria-label="LaTeX 公式"]'),
    formula.getAttribute("data-latex") + "+0",
  );
  await until(() =>
    document
      .querySelector('.tiptap [data-type="block-math"]')
      .getAttribute("data-latex")
      .endsWith("+0"),
  );
  document
    .querySelector('[aria-label="LaTeX 公式"]')
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await until(() => !document.querySelector(".writing-math-popover"));
  for (const [alignment, label] of [
    ["left", "左对齐"],
    ["center", "居中对齐"],
    ["right", "右对齐"],
  ]) {
    const formulaNode = document.querySelector(
      '.tiptap [data-type="block-math"]',
    );
    const formulaEditor = formulaNode.closest(".tiptap");
    await openBlockMenu(
      formulaEditor,
      [...formulaEditor.children].indexOf(formulaNode),
    );
    document.querySelector(`[aria-label="${label}"]`).click();
    await until(
      () =>
        document.querySelector('.tiptap [data-type="block-math"]').dataset
          .mathAlign === alignment,
    );
    const rendered = document.querySelector('.tiptap [data-type="block-math"]');
    const inner = rendered.querySelector(".katex-display > .katex");
    assert(
      getComputedStyle(inner).textAlign === alignment,
      "KaTeX inner layout ignored alignment",
    );
    const bases = rendered.querySelectorAll(".katex-html > .base");
    const first = bases[0].getBoundingClientRect(),
      last = bases[bases.length - 1].getBoundingClientRect();
    const box = rendered.getBoundingClientRect();
    const difference =
      alignment === "left"
        ? first.left - box.left
        : alignment === "right"
          ? box.right - last.right
          : (first.left + last.right - box.left - box.right) / 2;
    assert(
      Math.abs(difference) < 2,
      `Formula did not visually align ${alignment}: ${difference}`,
    );
  }
  await insertFromMenu("交互实验");
  await wait(30);
  find("添加 Softmax 温度实验").click();
  await until(() => document.querySelector(".learning-slider input"));
  const slider = document.querySelector(".learning-slider input");
  const old = document.querySelector('[data-probability="0"]').textContent;
  input(slider, "1.4");
  slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  await wait(40);
  assert(
    document.querySelector('[data-probability="0"]').textContent !== old,
    "Experiment did not recompute",
  );
  // Insert text after experiment, then check Markdown mode and editable table/task syntax.
  assert(!find("文字"), "Text still requires an insert button");
  await until(() => document.querySelectorAll(".tiptap").length === 2);
  const last = [...document.querySelectorAll(".tiptap")].at(-1);
  last.focus();
  document.execCommand("insertText", false, "实");
  await wait(20);
  assert(
    document.activeElement === last && last.isConnected,
    "First typing remounted the continuation editor",
  );
  document.execCommand("insertText", false, "验之后继续写作。");
  await wait(60);
  const firstSnapshot = await saved();
  const firstSource = firstSnapshot.blocks.find(
    (block) =>
      block.id ===
      firstSnapshot.notes.find((note) => note.title === "Transformer")
        .blocks[0],
  ).source;
  assert(
    firstSource.includes("$$") && firstSource.includes("作者的表达"),
    "Stored formula serialization failed",
  );
  last.focus();
  const textRange = document.createRange();
  textRange.selectNodeContents(last);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(textRange);
  const markdownPaste = new DataTransfer();
  markdownPaste.setData(
    "text/plain",
    "## 后续笔记\n\n- [x] 作者的表达\n\n| Q | K |\n| --- | --- |\n| 1 | 2 |",
  );
  last.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: markdownPaste,
    }),
  );
  await until(() => document.querySelector(".tiptap table"));
  assert(
    document.querySelector('.tiptap input[type="checkbox"]'),
    "Pasted task list did not render",
  );
  checkpoint("attachments-start");
  // Attach originals through the actual input, and preserve unsupported Markdown imports.
  const attach = async (file) => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const el = [...document.querySelectorAll('input[type="file"]')].find(
      (e) => !e.accept,
    );
    el.files = transfer.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(100);
  };
  await attach(
    new File(["attachment-original"], "original.txt", { type: "text/plain" }),
  );
  await until(
    () =>
      document.querySelector(".asset-text-preview pre")?.textContent ===
      "attachment-original",
  );
  await attach(
    new File([await window.canvasFixture.image()], "diagram.png", {
      type: "image/png",
    }),
  );
  await until(() => document.querySelector(".canvas-image img")?.complete);
  const caption = document.querySelector('[aria-label="图片说明"]');
  input(caption, "图 1 · 注意力示意");
  await until(
    () => document.querySelector(".notes-save").dataset.saveState === "saved",
  );
  const captioned = (await saved()).blocks.find(
    (block) => block.type === "image",
  );
  assert(captioned.caption === "图 1 · 注意力示意", "Caption was not saved");
  assert(
    getComputedStyle(caption).textAlign === "center" &&
      getComputedStyle(caption).fontStyle === "italic" &&
      getComputedStyle(document.querySelector(".writing-block-image"))
        .borderTopWidth === "0px",
    "Image still has a frame or caption is not centered italic text",
  );
  await attach(
    new File([window.canvasFixture.pdf()], "preview.pdf", {
      type: "application/pdf",
    }),
  );
  await until(() =>
    document.querySelector('.asset-pdf[aria-busy="false"] canvas'),
  );
  const pdfCanvas = document.querySelector(".asset-pdf canvas");
  assert(
    pdfCanvas.width > 100 && pdfCanvas.height > 100,
    "PDF canvas has no rendered dimensions",
  );
  const pixels = pdfCanvas
    .getContext("2d")
    .getImageData(0, 0, pdfCanvas.width, pdfCanvas.height).data;
  assert(
    pixels.some((value, index) => index % 4 === 0 && value < 120),
    "PDF preview is blank",
  );
  document.querySelector('[aria-label="PDF 下一页"]').click();
  await until(
    () =>
      document.querySelector(
        '.asset-pdf[aria-busy="false"] [aria-label="PDF 页码"]',
      ).textContent === "2 / 2",
  );
  document.querySelector('[aria-label="PDF 上一页"]').click();
  await until(
    () =>
      document.querySelector(
        '.asset-pdf[aria-busy="false"] [aria-label="PDF 页码"]',
      ).textContent === "1 / 2",
  );
  await attach(
    new File(["broken pdf"], "broken.pdf", { type: "application/pdf" }),
  );
  await until(() =>
    document.querySelector(".asset-file-card[data-preview-fallback]"),
  );
  assert(
    document
      .querySelector(".asset-file-card[data-preview-fallback]")
      .getAttribute("download") === "broken.pdf",
    "Failed PDF preview lost its original download",
  );
  // Preserve pending edits on failure and provide explicit recovery.
  window.canvasFixture.failWrites = true;
  input(title(), "Transformer temporary");
  await until(() => document.querySelector('.notes-notice[role="alert"]'));
  const failed = [];
  window.dispatchEvent(
    new CustomEvent("nomi-flush-documents", {
      detail: { waitUntil: (p) => failed.push(p) },
    }),
  );
  assert(
    (await Promise.all(failed)).some((ok) => !ok),
    "Close flush allowed exiting after a failed save",
  );
  assert(
    (await saved()).notes.some((n) => n.title === "Transformer"),
    "Failed write overwrote disk",
  );
  window.canvasFixture.failWrites = false;
  input(title(), "Transformer");
  find("重试保存")?.click();
  await until(
    () =>
      !document.querySelector('.notes-notice[role="alert"]') &&
      document.querySelector(".notes-save").dataset.saveState === "saved",
  );
  // Right-click a non-selected note; Escape cancels, Delete targets it, Undo restores it.
  const other = find("列表项拖动回归").closest("[data-note-row]");
  const rightClick = () =>
    other.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: 180,
        clientY: 260,
        button: 2,
      }),
    );
  rightClick();
  await until(() => document.querySelector('[role="menuitem"]'));
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await until(() => !document.querySelector('[role="menu"]'));
  assert(find("列表项拖动回归"), "Escape deleted note");
  rightClick();
  await until(() => document.querySelector('[role="menuitem"]'));
  menuItem("删除文稿").click();
  await until(() => !find("列表项拖动回归"));
  assert(title().value === "Transformer", "Right-click changed active note");
  find("撤销删除").click();
  await until(() => title()?.value === "列表项拖动回归");
  assert(
    [...document.querySelectorAll(".tiptap li")]
      .map((node) => node.textContent)
      .join("|") === "A|C|X|Y|B",
    "Undo lost deleted content",
  );
  find("Transformer").click();
  await until(() => title()?.value === "Transformer");
  checkpoint("flush-start");
  // A close request must flush the final pending edit before allowing the host to quit.
  input(title(), "Transformer pending");
  const flushed = [];
  window.dispatchEvent(
    new CustomEvent("nomi-flush-documents", {
      detail: { waitUntil: (p) => flushed.push(p) },
    }),
  );
  assert(
    (await Promise.all(flushed)).every(Boolean),
    "Host flush rejected a valid write",
  );
  assert(
    (await saved()).notes.some((n) => n.title === "Transformer pending"),
    "Close flush lost pending title",
  );
  input(title(), "Transformer");
  title().focus();
  title().blur();
  await until(
    () => document.querySelector(".notes-save").dataset.saveState === "saved",
  );
  checkpoint("original-export");
  const doc = await saved(),
    note = doc.notes.find((n) => n.title === "Transformer");
  window.notesTestId = note.id;
  assert(
    !doc.board.placements.some((p) => p.content === note.id),
    "New note was put on canvas automatically",
  );
  await openBlockMenu();
  menuItem("放到画布").click();
  await until(() => document.querySelector(".canvas-viewport"));
  await until(() =>
    document.querySelector('.nomi-math-block[data-math-align="right"]'),
  );
  assert(
    getComputedStyle(
      document.querySelector(
        '.nomi-math-block[data-math-align="right"] .katex-display > .katex',
      ),
    ).textAlign === "right",
    "Formula alignment lost in Canvas Markdown preview",
  );
  await until(async () =>
    (await saved()).board.placements.some((p) => p.content === note.id),
  );
  location.hash = "/notes?note=" + note.id;
  await until(() => title()?.value === "Transformer");
  assert(
    document.querySelector(".tiptap").textContent.includes("作者的表达"),
    "Canvas switch lost note",
  );
  assert(
    !document.querySelector(
      '[aria-label="编辑模式"], [aria-label="撤销文稿更改"], [aria-label="重做文稿更改"], .notes-import, .writing-source, input[accept*=".md"]',
    ) && !find("导出"),
    "Retired writing controls are still present",
  );
  // The archive contract stays verified independently of the removed product UI.
  await window.canvasFixture.archiveNote(note.id);
  await wait(300);
  assert(
    document.documentElement.scrollWidth === innerWidth,
    "Desktop overflows",
  );
  assert(window.canvasFixture.requests === 0, "Unexpected network request");
  return {
    contextualFormatting: true,
    stableFormattingPopup: true,
    gutterHover: true,
    marginDragFeedback: true,
    listItemDragging: true,
    emptyLineInsertion: true,
    selectionPreserved: true,
    noPermanentToolbars: true,
    clipboardBlankLines: true,
    notionBlankBlocks: true,
    paragraphDrag: true,
    crossEmbedDrag: true,
    blockTypeMenu: true,
    richInput: true,
    formula: true,
    markdownPaste: true,
    tables: true,
    tasks: true,
    interactive: true,
    quotaRecovery: true,
    sharedCanvas: true,
    zipExport: true,
    initialSourcePreserved: true,
    attachments: true,
    coalescedWrites: true,
    stableSaveLabel: true,
    rightClickDeleteUndo: true,
    continuousTyping: true,
    closeFlush: true,
    focusedWriting: true,
    quietFocus: true,
    outline: true,
    inlineTasks: true,
    leftOutline: true,
    hoverBlockMenus: true,
    liveFormulaPopup: true,
    formulaAlignment: true,
    tableOutput: true,
    imageCaptions: true,
    pdfPreview: true,
    pdfPagination: true,
    attachmentFallback: true,
  };
}
const imageChecks = `win.setSize(1360,1050);await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");
await win.webContents.executeJavaScript(check('image-move-prepare'));
const imageKey=async(redo=false)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'Z',modifiers:redo?['meta','shift']:['meta']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Z',modifiers:redo?['meta','shift']:['meta']});await new Promise(r=>setTimeout(r,60));};
await win.webContents.executeJavaScript(check('image-move-up'));await imageKey();await win.webContents.executeJavaScript(check('image-move-undone'));await imageKey(true);await win.webContents.executeJavaScript(check('image-move-redone'));await imageKey();await win.webContents.executeJavaScript(check('image-move-undone'));
await win.webContents.executeJavaScript(check('image-move-down'));await imageKey();await win.webContents.executeJavaScript(check('image-move-undone'));
await win.webContents.executeJavaScript(check('image-lightbox-open'));writeFileSync(join(${JSON.stringify(output)},'notes-image-lightbox.png'),(await win.webContents.capturePage()).toPNG());
win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await win.webContents.executeJavaScript(check('image-lightbox-closed'));
win.setSize(390,980);await win.webContents.executeJavaScript(check('image-lightbox-open'));writeFileSync(join(${JSON.stringify(output)},'notes-image-lightbox-mobile.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.querySelector('.asset-image-lightbox [data-close]').click()");await win.webContents.executeJavaScript(check('image-lightbox-closed'));win.setSize(1360,1050);Object.assign(report,await win.webContents.executeJavaScript(check('image-move-restore')));

`;
const main = `const {app,BrowserWindow,clipboard}=require('electron');const {execFileSync}=require('node:child_process');const {join,dirname}=require('node:path');const {writeFileSync,readFileSync,mkdirSync}=require('node:fs');const {unzipSync}=require(${JSON.stringify(require.resolve("fflate", { paths: [join(root, "packages/ui")] }))});app.setPath('userData',join(${JSON.stringify(output)},'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1360,height:1050,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});win.webContents.on('console-message',event=>{if(event.message.startsWith('notes-check:')||event.level===3)console.log(event.message.slice(0,800));});const {allowsClipboardWrite}=require(join(${JSON.stringify(output)},'permissions.cjs'));const expectedUrl=require('node:url').pathToFileURL(join(${JSON.stringify(output)},'index.html')).href;win.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(allowsClipboardWrite(permission,{...details,mainFrameUrl:contents.mainFrame.url,expectedUrl})));win.webContents.session.setPermissionCheckHandler((contents,permission,_origin,details)=>!!contents&&allowsClipboardWrite(permission,{...details,mainFrameUrl:contents.mainFrame.url,expectedUrl}));let downloaded,csvDownloaded;win.webContents.session.on('will-download',(_e,item)=>{const csv=item.getFilename()==='table.csv';item.setSavePath(join(${JSON.stringify(output)},csv?'table.csv':'article.zip'));item.once('done',()=>{if(csv)csvDownloaded=true;else downloaded=true;});});
try {await win.loadFile(join(${JSON.stringify(output)},'index.html'));const check=phase=>'('+${JSON.stringify(checks.toString())}+')('+JSON.stringify(phase)+')';const report=await win.webContents.executeJavaScript(check('initial'));Object.assign(report,await win.webContents.executeJavaScript(check('selection-navigation')));if(!await win.webContents.executeJavaScript("(async()=> (await navigator.permissions.query({name:'clipboard-write'})).state==='granted' && (await navigator.permissions.query({name:'clipboard-read'})).state==='denied')()"))throw Error('Clipboard permission boundary failed');report.clipboardWritePolicy=true;
const runImageChecks=async()=>{win.show();app.focus({steal:true});win.focus();${imageChecks}};
if(process.env.NOMI_CHECK_NOTE_IMAGES==='1') {await runImageChecks();writeFileSync(join(${JSON.stringify(output)},'report.json'),JSON.stringify({...report,scope:'image-interactions'},null,2));console.log(JSON.stringify(report));app.exit(0);return;}

if(process.env.NOMI_CHECK_NOTION_CLIPBOARD==='1'){await win.webContents.executeJavaScript(check('notion-native-prepare'));win.webContents.paste();Object.assign(report,await win.webContents.executeJavaScript(check('notion-native-result')));}
win.show();app.focus({steal:true});win.focus();await new Promise(r=>setTimeout(r,80));
const hierarchyKey=async(redo=false)=>{for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Z',modifiers:redo?['meta','shift']:['meta']});await new Promise(r=>setTimeout(r,60));};
await win.webContents.executeJavaScript(check('hierarchy-prepare'));await hierarchyKey();await win.webContents.executeJavaScript(check('hierarchy-move-undone'));await hierarchyKey(true);await win.webContents.executeJavaScript(check('hierarchy-move-redone'));await win.webContents.executeJavaScript(check('hierarchy-delete'));await hierarchyKey();const sidebarPoint=await win.webContents.executeJavaScript(check('hierarchy-restored-width-target'));win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...sidebarPoint});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...sidebarPoint});for(let i=1;i<=6;i++){await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:sidebarPoint.x+15*i,y:sidebarPoint.y});await new Promise(r=>setTimeout(r,20));}await win.webContents.executeJavaScript(check('hierarchy-width-in-progress'));await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:sidebarPoint.x+90,y:sidebarPoint.y});win.webContents.debugger.detach();Object.assign(report,await win.webContents.executeJavaScript(check('hierarchy-width-result')));writeFileSync(join(${JSON.stringify(output)},'notes-hierarchy.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript(check('tree-drag-prepare'));
const treeDrag = async (kind, cancel = false) => {
  const points = await win.webContents.executeJavaScript(check('tree-drag-points-' + kind));
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {enabled:true});
  const pointer = (type, point, down) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, button: down ? 'left' : 'none', buttons: down ? 1 : 0, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  await pointer('mouseMoved', points.from, false);
  await pointer('mousePressed', points.from, true);
  for (let i = 1; i <= 10; i++) {
    await pointer('mouseMoved', {x: Math.round(points.from.x + (points.to.x - points.from.x) * i / 10), y: Math.round(points.from.y + (points.to.y - points.from.y) * i / 10)}, true);
    await new Promise(r => setTimeout(r, 15));
  }
  await win.webContents.executeJavaScript(check('tree-drag-preview-' + kind));
  if (kind === 'boundary-after') writeFileSync(join(${JSON.stringify(output)},'notes-tree-child-gap.png'),(await win.webContents.capturePage()).toPNG());
  if (kind === 'nest') writeFileSync(join(${JSON.stringify(output)},'notes-tree-drag.png'),(await win.webContents.capturePage()).toPNG());
  if (cancel) { win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'}); }
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1});
  win.webContents.debugger.detach();
  Object.assign(report, await win.webContents.executeJavaScript(check('tree-drag-result-' + kind)));
};
for(const kind of ['boundary-after','boundary-before','boundary-external']) { await treeDrag(kind); await hierarchyKey(); await win.webContents.executeJavaScript(check('tree-drag-boundary-undone')); }
await treeDrag('nest'); await hierarchyKey(); await win.webContents.executeJavaScript(check('tree-drag-undone')); await hierarchyKey(true); await win.webContents.executeJavaScript(check('tree-drag-redone'));
await treeDrag('invalid'); await treeDrag('cancel', true); await treeDrag('outside'); await treeDrag('root'); await treeDrag('reorder'); await treeDrag('after'); await treeDrag('noop'); await treeDrag('expand', true); await treeDrag('scroll', true);
await win.webContents.executeJavaScript(check('title-reveal-prepare'));win.webContents.sendInputEvent({type:'mouseMove',x:1100,y:80});const titlePoint=await win.webContents.executeJavaScript(check('title-reveal-idle'));writeFileSync(join(${JSON.stringify(output)},'notes-title-idle.png'),(await win.webContents.capturePage()).toPNG());win.webContents.sendInputEvent({type:'mouseMove',...titlePoint});await win.webContents.executeJavaScript(check('title-reveal-hover'));writeFileSync(join(${JSON.stringify(output)},'notes-title-hover.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript(check('title-reveal-end'));writeFileSync(join(${JSON.stringify(output)},'notes-title-end.png'),(await win.webContents.capturePage()).toPNG());win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await win.webContents.executeJavaScript(check('title-reveal-reduced'));await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();win.webContents.sendInputEvent({type:'mouseMove',x:1100,y:80});Object.assign(report,await win.webContents.executeJavaScript(check('title-reveal-reset')));
await win.webContents.executeJavaScript(check('dogfood-title-prepare'));for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Enter'});await win.webContents.executeJavaScript(check('dogfood-title-result'));win.webContents.insertText('替换');await win.webContents.executeJavaScript(check('dogfood-replaced'));
const writingHistoryKey=async(redo=false)=>{for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Z',modifiers:redo?['meta','shift']:['meta']});await new Promise(r=>setTimeout(r,50));};await writingHistoryKey();await win.webContents.executeJavaScript(check('dogfood-undo-selection'));await writingHistoryKey(true);await win.webContents.executeJavaScript(check('dogfood-redo-selection'));await writingHistoryKey();await win.webContents.executeJavaScript(check('dogfood-undo-selection'));win.webContents.insertText('续');Object.assign(report,await win.webContents.executeJavaScript(check('dogfood-continued')));
const tailPoints=await win.webContents.executeJavaScript(check('tail-prepare'));for(const point of tailPoints){win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await win.webContents.executeJavaScript(check('tail-clicked'));}win.webContents.insertText('继续输入');Object.assign(report,await win.webContents.executeJavaScript(check('tail-typed')));
win.show();app.focus({steal:true});win.focus();await new Promise(r=>setTimeout(r,80));
const quietPoint=await win.webContents.executeJavaScript(check('quiet-input-prepare'));win.webContents.sendInputEvent({type:'mouseMove',...quietPoint});const plusPoint=await win.webContents.executeJavaScript(check('quiet-plus-target'));win.webContents.sendInputEvent({type:'mouseMove',...plusPoint});await win.webContents.executeJavaScript(check('quiet-plus-hover'));for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...quietPoint});win.webContents.insertText('静');await win.webContents.executeJavaScript(check('quiet-input-hidden'));win.webContents.sendInputEvent({type:'keyDown',keyCode:'Backspace'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Backspace'});await win.webContents.executeJavaScript(check('quiet-delete-hidden'));win.webContents.sendInputEvent({type:'mouseMove',x:quietPoint.x-10,y:quietPoint.y});await new Promise(r=>setTimeout(r,150));const secondRow=await win.webContents.executeJavaScript(check('quiet-pointer-restored'));win.webContents.insertText('静');await new Promise(r=>setTimeout(r,80));if(await win.webContents.executeJavaScript("!!document.querySelector('.writing-block-gutter')"))throw Error('Typing in an existing paragraph left the gutter visible');win.webContents.sendInputEvent({type:'mouseMove',...secondRow});await new Promise(r=>setTimeout(r,150));Object.assign(report,await win.webContents.executeJavaScript(check('quiet-row-restored')));writeFileSync(join(${JSON.stringify(output)},'notes-quiet-gutter.png'),(await win.webContents.capturePage()).toPNG());
const edge=await win.webContents.executeJavaScript(check('selection-edge-prepare'));win.webContents.debugger.attach('1.3');for(const offset of [0,3]){await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x+offset,y:edge.y});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:edge.x+offset,y:edge.y});for(let i=1;i<=8;i++){await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:Math.round(edge.x+offset+(edge.toX-edge.x-offset)*i/8),y:Math.round(edge.y+(edge.toY-edge.y)*i/8)});await new Promise(r=>setTimeout(r,15));}await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:edge.toX,y:edge.toY});Object.assign(report,await win.webContents.executeJavaScript(check('selection-edge-result')));win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});await new Promise(r=>setTimeout(r,180));}win.webContents.debugger.detach();
const menuPoints=await win.webContents.executeJavaScript(check('menu-pointer-prepare'));
win.webContents.sendInputEvent({type:'mouseMove',x:menuPoints.caretX,y:menuPoints.caretY});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:menuPoints.caretX,y:menuPoints.caretY});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:menuPoints.caretX,y:menuPoints.caretY});await new Promise(r=>setTimeout(r,60));win.webContents.sendInputEvent({type:'mouseMove',x:menuPoints.hoverX,y:menuPoints.hoverY});await new Promise(r=>setTimeout(r,60));
const menuTarget=await win.webContents.executeJavaScript(check('menu-pointer-target'));win.webContents.sendInputEvent({type:'mouseMove',...menuTarget});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...menuTarget});await new Promise(r=>setTimeout(r,80));win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...menuTarget});Object.assign(report,await win.webContents.executeJavaScript(check('menu-pointer-result')));
const hoverMenu=async()=>{win.webContents.sendInputEvent({type:'mouseMove',x:menuPoints.hoverX,y:menuPoints.hoverY});await new Promise(r=>setTimeout(r,60));const target=await win.webContents.executeJavaScript("(()=>{const rect=document.querySelector('.writing-block-gutter [aria-haspopup=menu]').getBoundingClientRect();return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()");win.webContents.sendInputEvent({type:'mouseMove',...target});await win.webContents.executeJavaScript(check('hover-menu-open'));return target;};const hoverTarget=await hoverMenu();for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...hoverTarget});Object.assign(report,await win.webContents.executeJavaScript(check('hover-menu-closed')));await hoverMenu();await win.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
const pointer=await win.webContents.executeJavaScript(check('pointer-prepare'));
win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.setInterceptDrags',{enabled:true});
let intercepted;win.webContents.debugger.on('message',(_event,method,params)=>{if(method==='Input.dragIntercepted')intercepted=params.data;});
win.webContents.sendInputEvent({type:'mouseMove',x:pointer.gutterX,y:pointer.gutterY});await new Promise(r=>setTimeout(r,160));await win.webContents.executeJavaScript(check('gutter-hover'));win.webContents.sendInputEvent({type:'mouseMove',x:pointer.gutterX,y:pointer.firstY});await new Promise(r=>setTimeout(r,40));
win.webContents.sendInputEvent({type:'mouseMove',x:pointer.x,y:pointer.y});
win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:pointer.x,y:pointer.y});
for(let i=1;i<=6;i++){win.webContents.sendInputEvent({type:'mouseMove',x:pointer.x+8*i,y:pointer.y+4*i});await new Promise(r=>setTimeout(r,25));}
for(let i=0;i<40&&!intercepted;i++)await new Promise(r=>setTimeout(r,25));
if(!intercepted)throw Error('Native pointer did not start a block drag');
for(const type of ['dragEnter','dragOver'])await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type,x:pointer.toX,y:pointer.toY,data:intercepted});
await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type:'dragOver',x:pointer.bodyX,y:pointer.toY,data:intercepted});await new Promise(r=>setTimeout(r,80));await win.webContents.executeJavaScript(check('margin-drag'));await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type:'dragOver',x:pointer.rightX,y:pointer.toY,data:intercepted});await new Promise(r=>setTimeout(r,80));await win.webContents.executeJavaScript(check('margin-drag'));await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type:'dragOver',x:pointer.toX,y:pointer.toY,data:intercepted});await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'notes-drag.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type:'drop',x:pointer.toX,y:pointer.toY,data:intercepted});
win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:pointer.toX,y:pointer.toY});win.webContents.debugger.detach();
Object.assign(report,await win.webContents.executeJavaScript(check('pointer-result')));
await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'notes-block-menu.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'notes-block-menu-dark.png'),(await win.webContents.capturePage()).toPNG());win.setSize(390,980);await new Promise(r=>setTimeout(r,150));writeFileSync(join(${JSON.stringify(output)},'notes-block-menu-mobile.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1360,1050);await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");
await win.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
const codePoint=await win.webContents.executeJavaScript(check('code-preview'));win.webContents.sendInputEvent({type:'mouseMove',...codePoint});Object.assign(report,await win.webContents.executeJavaScript(check('code-hover-result')));writeFileSync(join(${JSON.stringify(output)},'notes-code.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");writeFileSync(join(${JSON.stringify(output)},'notes-code-dark.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");if(process.env.NOMI_CHECK_DESKTOP_CLIPBOARD==='1'){const swift=${JSON.stringify(join(root, "scripts/pasteboard-snapshot.swift"))};const backup=join(${JSON.stringify(output)},'pasteboard.json');const expectedValues=[];execFileSync('/usr/bin/swift',[swift,'save',backup]);try{const codeExpected=await win.webContents.executeJavaScript("document.querySelector('pre code').textContent");expectedValues.push(codeExpected);const point=await win.webContents.executeJavaScript(check('clipboard-code-target'));for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...point});await win.webContents.executeJavaScript(check('clipboard-code-result'));if((await clipboard.readText())!==codeExpected)throw Error('Native code clipboard mismatch');const tablePoint=await win.webContents.executeJavaScript(check('clipboard-table-target'));const tableExpected=${JSON.stringify('名字\t备注\r\nA,B\t"说""你好"""\r\n多行\t"第一段\n第二段"')};expectedValues.push(tableExpected);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...tablePoint});await win.webContents.executeJavaScript(check('clipboard-write-result'));if((await clipboard.readText())!==tableExpected)throw Error('Native table clipboard mismatch');report.nativeClipboardWrite=true;}finally{const current=(await clipboard.readText());execFileSync('/usr/bin/swift',[swift,'restore',backup,expectedValues.includes(current)?current:'']);}}
await win.webContents.executeJavaScript(check('asset-preview'));await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-image-caption.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript(check('pdf-preview'));await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'notes-pdf.png'),(await win.webContents.capturePage()).toPNG());win.setSize(390,980);await new Promise(r=>setTimeout(r,180));await win.webContents.executeJavaScript(check('pdf-preview'));writeFileSync(join(${JSON.stringify(output)},'notes-pdf-mobile.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1360,1050);await win.webContents.executeJavaScript(check('selection-preview'));await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-selection.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");win.setSize(390,980);await new Promise(r=>setTimeout(r,180));writeFileSync(join(${JSON.stringify(output)},'notes-selection-mobile.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1360,1050);await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");const latexPreview=await win.webContents.executeJavaScript(check('math-preview'));win.webContents.insertText(latexPreview+'+1');Object.assign(report,await win.webContents.executeJavaScript(check('math-native-result')));await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'notes-formula-popup.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");win.setSize(390,980);await new Promise(r=>setTimeout(r,180));await win.webContents.executeJavaScript(check('math-native-result'));writeFileSync(join(${JSON.stringify(output)},'notes-formula-popup-mobile.png'),(await win.webContents.capturePage()).toPNG());const formulaOutside=await win.webContents.executeJavaScript(check('math-outside-target'));for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...formulaOutside});Object.assign(report,await win.webContents.executeJavaScript(check('math-outside-result')));win.setSize(1360,1050);await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");await win.webContents.executeJavaScript(check('table-output-preview'));await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-table-output.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await win.webContents.executeJavaScript(check('outline-preview'));await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-outline-table.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript(${JSON.stringify("document.querySelector('[aria-label=\"固定目录\"]').click()")});await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-outline-pinned.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript(${JSON.stringify("document.querySelector('[aria-label=\"取消固定目录\"]').click()")});await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-outline-table-dark.png'),(await win.webContents.capturePage()).toPNG());win.setSize(390,980);await new Promise(r=>setTimeout(r,180));if(!await win.webContents.executeJavaScript("document.documentElement.scrollWidth===innerWidth"))throw Error('Outline/table mobile overflow');await win.webContents.executeJavaScript(check('outline-mobile'));writeFileSync(join(${JSON.stringify(output)},'notes-outline-table-mobile.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1360,1050);await win.webContents.executeJavaScript("document.documentElement.dataset.theme='light'");await win.webContents.executeJavaScript(check('empty-preview'));await new Promise(r=>setTimeout(r,80));writeFileSync(join(${JSON.stringify(output)},'notes-empty-menu.png'),(await win.webContents.capturePage()).toPNG());await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});Object.assign(report,await win.webContents.executeJavaScript(check('restored')));await new Promise(r=>setTimeout(r,200));writeFileSync(join(${JSON.stringify(output)},'notes-desktop.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("(()=>{const row=document.querySelector('[data-note-row][data-selected]');const r=row.getBoundingClientRect();row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2,clientX:r.right-12,clientY:r.bottom-6}));})()");await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-context.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await win.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'");await new Promise(r=>setTimeout(r,100));writeFileSync(join(${JSON.stringify(output)},'notes-dark.png'),(await win.webContents.capturePage()).toPNG());win.setSize(390,980);await new Promise(r=>setTimeout(r,200));if(!await win.webContents.executeJavaScript("document.documentElement.scrollWidth===innerWidth && document.querySelector('.notes-workspace').getBoundingClientRect().right<=innerWidth+1"))throw Error('Mobile overflow');writeFileSync(join(${JSON.stringify(output)},'notes-mobile.png'),(await win.webContents.capturePage()).toPNG());
await runImageChecks();
if(!csvDownloaded||readFileSync(join(${JSON.stringify(output)},'table.csv'),'utf8')!==${JSON.stringify('﻿名字,备注\r\n"A,B","说""你好"""\r\n多行,"第一段\n第二段"')} )throw Error('CSV download lost content');if(!downloaded)throw Error('No export download');const files=unzipSync(readFileSync(join(${JSON.stringify(output)},'article.zip')));const md=Buffer.from(files['_posts/2026-10-25-transformer.md']||Object.entries(files).find(([p])=>p.startsWith('_posts/'))?.[1]||[]).toString();if(!md.includes('作者的表达')||!md.includes('<iframe'))throw Error('Export missing article or embed');if(!Object.entries(files).some(([path,bytes])=>path.endsWith('.txt')&&Buffer.from(bytes).toString()==='attachment-original')||!Object.keys(files).some(path=>path.endsWith('.png')))throw Error('Attachment originals missing');const snapshot=JSON.parse(Buffer.from(files['transformer.nomi.json']).toString());if(snapshot.notes.length!==1||snapshot.board.placements.length)throw Error('Export leaks unrelated notes or canvas');
for(const [path,bytes] of Object.entries(files)){const dest=join(${JSON.stringify(output)},'export',path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);}win.setSize(1000,1000);await win.loadFile(join(${JSON.stringify(output)},'export/assets/nomi/transformer/index.html'));await new Promise(r=>setTimeout(r,400));const offline=await win.webContents.executeJavaScript(${JSON.stringify(`(async()=>{const range=document.querySelector('.learning-slider input');if(!range||getComputedStyle(document.querySelector('.nomi-math-block[data-math-align="right"] .katex-display > .katex')).textAlign!=='right'||!document.querySelector('.katex')||!document.body.textContent.includes('作者的表达'))return false;const before=document.querySelector('[data-probability="0"]').textContent;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(range,'2');range.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,40));return document.querySelector('[data-probability="0"]').textContent!==before;})()`)});if(!offline)throw Error('Offline reader failed');writeFileSync(join(${JSON.stringify(output)},'notes-export.png'),(await win.webContents.capturePage()).toPNG());writeFileSync(join(${JSON.stringify(output)},'report.json'),JSON.stringify({...report,offlineRuntime:true,mobile:true},null,2));console.log(JSON.stringify(report));app.exit(0);}catch(e){try{writeFileSync(join(${JSON.stringify(output)},'failure.png'),(await win.webContents.capturePage()).toPNG());}catch{}console.error(e);app.exit(1);}});setTimeout(()=>app.exit(1),60000);`;
await writeFile(join(output, "main.cjs"), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(output, "main.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const timer = setTimeout(() => child.kill("SIGKILL"), 90000);
const code = await new Promise((r) => child.once("exit", (c) => r(c ?? 1)));
clearTimeout(timer);
await rm(join(output, "profile"), { recursive: true, force: true });
if (code === 0) {
  for (const name of process.env.NOMI_CHECK_NOTE_IMAGES === "1"
    ? [
        "report.json",
        "notes-image-lightbox.png",
        "notes-image-lightbox-mobile.png",
      ]
    : [
        "report.json",
        "notes-desktop.png",
        "notes-quiet-gutter.png",
        "notes-hierarchy.png",
        "notes-tree-drag.png",
        "notes-tree-child-gap.png",
        "notes-title-idle.png",
        "notes-title-hover.png",
        "notes-title-end.png",
        "notes-dark.png",
        "notes-context.png",
        "notes-block-menu.png",
        "notes-selection.png",
        "notes-code.png",
        "notes-code-dark.png",
        "notes-image-caption.png",
        "notes-image-lightbox.png",
        "notes-image-lightbox-mobile.png",
        "notes-pdf.png",
        "notes-pdf-mobile.png",
        "notes-selection-mobile.png",
        "notes-formula-popup.png",
        "notes-formula-popup-mobile.png",
        "notes-table-output.png",
        "notes-empty-menu.png",
        "notes-outline-table.png",
        "notes-outline-pinned.png",
        "notes-outline-table-dark.png",
        "notes-outline-table-mobile.png",
        "notes-block-menu-dark.png",
        "notes-block-menu-mobile.png",
        "notes-drag.png",
        "notes-mobile.png",
        "notes-export.png",
      ])
    await copyFile(join(output, name), join(reports, name));
  await rm(output, { recursive: true, force: true });
} else console.error("Evidence:", output);
process.exitCode = code;
