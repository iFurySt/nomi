// Runs in the existing isolated Electron fixture; all clipboard/data are synthetic.
export async function canvasParityChecks(phase, expected) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    assert = (v, m) => {
      if (!v) throw Error(m);
    },
    repo = window.canvasFixture.repository("local-device"),
    saved = () => repo.load();
  const until = async (f) => {
    for (let i = 0; i < 200; i++) {
      if (await f()) return;
      await wait(20);
    }
    throw Error(
      "Parity timed out: " +
        f.toString() +
        "\n" +
        document.body.innerText.slice(-700),
    );
  };
  const button = (label) =>
      document.querySelector(`button[aria-label="${label}"]`),
    card = (id) => document.querySelector(`[data-placement="${id}"]`),
    bar = () => document.querySelector(".selection-toolbar"),
    clip = window.canvasFixture.clipboard;
  const checkPopover = () => {
    const panel = document.querySelector(".connector-panel"),
      bar = panel.closest(".connector-toolbar").getBoundingClientRect(),
      r = panel.getBoundingClientRect(),
      gap = Math.min(
        Math.abs(r.bottom - bar.top),
        Math.abs(r.top - bar.bottom),
      );
    assert(
      Math.abs(gap - 6) < 1.1,
      "Popover drifted away from toolbar: " + gap,
    );
    assert(
      r.left >= 11 &&
        r.right <= innerWidth - 11 &&
        r.top >= 11 &&
        r.bottom <= innerHeight - 11,
      "Popover escaped viewport",
    );
    assert(
      r.width <= 224.5 && panel.scrollWidth <= panel.clientWidth + 1,
      "Popover is oversized or overflows horizontally",
    );
  };
  const point = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const input = (el, value) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (key, more = {}) =>
    document
      .querySelector(".canvas-viewport")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...more }),
      );
  const select = async (id) => {
    card(id)
      .querySelector(".canvas-card-body")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await until(() => card(id).querySelector("[data-shape-text]"));
    card(id)
      .querySelector("[data-shape-text]")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await wait(40);
  };
  const more = async (label) => {
    button("对象更多操作").click();
    await wait(20);
    [...document.querySelectorAll('.selection-toolbar [role="menuitem"]')]
      .find((e) => e.querySelector("span")?.textContent === label)
      .click();
    await wait(50);
  };
  const apply = async (d) => {
    button("编辑文档 DSL").click();
    await until(() => document.querySelector('[aria-label="文档 DSL 源码"]'));
    input(
      document.querySelector('[aria-label="文档 DSL 源码"]'),
      JSON.stringify(d),
    );
    await wait(20);
    [...document.querySelectorAll(".canvas-dsl-actions button")]
      .find((b) => b.textContent.includes("应用"))
      .click();
    await until(
      () => !document.querySelector('[role="dialog"]:not(.canvas-tool-menu)'),
    );
    await until(async () => (await saved()).revision > d.revision);
  };
  const ids = ["parity.place.a", "parity.place.b", "parity.place.c"];
  if (phase === "setup") {
    const privateClip = { text: "", items: [] };
    window.canvasFixture.clipboard = privateClip;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          privateClip.text = text;
        },
        readText: async () => privateClip.text,
        write: async (items) => {
          privateClip.items = items;
        },
      },
    });
    const d = await saved();
    window.canvasFixture.parityOriginal = structuredClone(d);
    for (const [i, id] of ids.entries())
      d.blocks.push({
        id: "parity.shape." + i,
        type: "shape",
        shape: "rounded-rectangle",
        text: ["收集问题", "建立联系", "交互验证"][i],
        tone: ["sage", "sand", "blue"][i],
      });
    d.board.placements = ids.map((id, i) => ({
      id,
      content: "parity.shape." + i,
      x: i * 350,
      y: 400 + (i === 1 ? 25 : 0),
      width: 220,
      height: 140,
    }));
    d.board.connectors = [
      {
        id: "parity.connection",
        from: { placement: ids[0], side: "e" },
        to: { placement: ids[1], side: "n" },
        routing: "rounded",
        style: "solid",
        startArrow: false,
        endArrow: true,
        label: "理解",
      },
    ];
    await apply(d);
    button("适应画布内容").click();
    await wait(80);
    return {
      pointer: point(
        card(ids[0]).querySelector(".canvas-shape-content > span"),
      ),
    };
  }
  if (phase === "menus") {
    await until(() => bar());
    assert(bar().offsetHeight <= 40, "Shape bar too large");
    for (const label of ["切换形状", "形状填充", "形状边框", "对象更多操作"]) {
      button(label).click();
      await wait(40);
      checkPopover();
      button(label).click();
      await wait(20);
    }
    button("切换形状").click();
    await wait(20);
    assert(
      document.querySelectorAll(".selection-shape-grid button").length === 28,
      "Shape catalog incomplete",
    );
    document
      .querySelector('.selection-shape-grid button[title="三角形"]')
      .click();
    await wait(30);
    const el = card(ids[0]),
      r = el.getBoundingClientRect(),
      port = point(el.querySelector('[data-port="e"]'));
    assert(
      Math.abs(port.x - (r.right + 24)) < 1.5,
      "Idle triangle connection handle overlaps its resize box",
    );
    button("形状填充").click();
    await wait(20);
    button("填充颜色 #d9f2e5").click();
    button("形状填充").click();
    button("形状边框").click();
    await wait(20);
    button("边框虚线").click();
    button("边框线宽 3").click();
    button("边框颜色 #408c5b").click();
    button("形状边框").click();
    button("形状文字格式").click();
    await wait(20);
    const size = document.querySelector('[aria-label="形状字号"]');
    size.value = "18";
    size.dispatchEvent(new Event("change", { bubbles: true }));
    button("形状排版").click();
    await wait(20);
    for (const name of [
      "形状粗体",
      "形状斜体",
      "形状下划线",
      "形状删除线",
      "文字左对齐",
      "文字顶端对齐",
      "形状无序列表",
    ]) {
      button(name).click();
      await wait(15);
    }
    input(
      document.querySelector('[aria-label="形状文字链接"]'),
      "https://example.com/learn",
    );
    await wait(20);
    button("应用形状链接").click();
    button("形状排版").click();
    await wait(40);
    const b = (await saved()).blocks.find((b) => b.id === "parity.shape.0");
    assert(
      b.shape === "triangle" &&
        b.shapeStyle.strokeStyle === "dashed" &&
        b.shapeStyle.strokeWidth === 3 &&
        b.shapeStyle.fill === "#d9f2e5" &&
        b.shapeStyle.text.bold &&
        b.shapeStyle.text.align === "left" &&
        b.shapeStyle.text.link === "https://example.com/learn",
      "Shape formatting did not persist",
    );
    await more("复制样式");
    await select(ids[1]);
    await more("粘贴样式");
    assert(
      JSON.stringify(
        (await saved()).blocks.find((b) => b.id === "parity.shape.1")
          .shapeStyle,
      ) === JSON.stringify(b.shapeStyle),
      "Shape style copy changed content",
    );
    await more("锁定");
    assert(card(ids[1]).classList.contains("is-locked"), "Shape lock missing");
    assert(
      getComputedStyle(card(ids[1]).querySelector('[data-resize="e"]'))
        .display === "none",
      "Locked resize active",
    );
    await more("解锁");
    await more("顺时针旋转 90°");
    await more("水平翻转");
    let d = await saved(),
      p = d.board.placements.find((p) => p.id === ids[1]);
    assert(p.width === 140 && p.height === 220, "Rotation did not swap bounds");
    assert(
      d.blocks.find((b) => b.id === p.content).shapeStyle.flipX,
      "Flip missing",
    );
    await more("复制为图片");
    await until(() => clip.items.length === 1);
    assert(
      (await clip.items[0].getType("image/png")).size > 500,
      "Shape PNG empty",
    );
    await more("创建副本");
    await until(async () => (await saved()).board.placements.length === 4);
    d = await saved();
    const clone = d.board.placements.at(-1);
    assert(
      clone.content !== p.content,
      "Duplicate references original content",
    );
    await more("移出画布");
    await until(async () => (await saved()).board.placements.length === 3);
    // Restore rectangles for the layout matrix, retaining the tested style on A.
    d = await saved();
    for (const [i, id] of ids.entries()) {
      Object.assign(
        d.board.placements.find((p) => p.id === id),
        { x: i * 350, y: 400 + (i === 1 ? 25 : 0), width: 220, height: 140 },
      );
      const b = d.blocks.find((b) => b.id === "parity.shape." + i);
      b.shape = "rounded-rectangle";
      if (i === 1) b.shapeStyle = {};
    }
    await apply(d);
    await select(ids[0]);
    button("形状文字格式").click();
    return {
      shapeFormatting: true,
      shapePng: true,
      shapeIndependentDuplicate: true,
      shapeStyleClipboard: true,
      shapeLockRotateFlip: true,
    };
  }
  if (phase === "png-export")
    return Array.from(
      new Uint8Array(
        await (await clip.items[0].getType("image/png")).arrayBuffer(),
      ),
    );
  if (phase === "marquee-setup") {
    key("Escape");
    await wait(30);
    const boxes = ids.map((id) => card(id).getBoundingClientRect()),
      left = Math.min(...boxes.map((r) => r.left)) - 36,
      top = Math.min(...boxes.map((r) => r.top)) - 36,
      right = Math.max(...boxes.map((r) => r.right)) + 36,
      bottom = Math.max(...boxes.map((r) => r.bottom)) + 36;
    return {
      pointer: { x: left, y: top },
      dx: right - left,
      dy: bottom - top,
      doc: await saved(),
      camera: document.querySelector(".canvas-viewport").dataset.camera,
    };
  }
  if (phase === "marquee-check") {
    assert(
      document.querySelectorAll("[data-placement].selected").length === 3,
      "Marquee selection missing",
    );
    assert(
      JSON.stringify(await saved()) === JSON.stringify(expected.doc),
      "Marquee mutated document",
    );
    assert(
      document.querySelector(".canvas-viewport").dataset.camera ===
        expected.camera,
      "Marquee panned canvas",
    );
    return { marqueeSelection: true };
  }
  if (phase === "multi") {
    key("Escape");
    key("a", { metaKey: true });
    await until(() => document.querySelector('[aria-label="多选属性"]'));
    button("筛选选区").click();
    await wait(20);
    document.querySelector('[aria-label="对象筛选面板"] button').click();
    await wait(20);
    button("对齐与分布").click();
    await wait(20);
    [...document.querySelectorAll(".selection-toolbar .connector-menu button")]
      .find((b) => b.textContent === "顶端对齐")
      .click();
    await wait(30);
    assert(
      new Set((await saved()).board.placements.map((p) => p.y)).size === 1,
      "Multi align failed",
    );
    button("对齐与分布").click();
    await wait(20);
    [...document.querySelectorAll(".selection-toolbar .connector-menu button")]
      .find((b) => b.textContent === "水平等距分布")
      .click();
    await wait(30);
    button("组合对象").click();
    await wait(30);
    const d = await saved();
    assert(
      new Set(d.board.placements.map((p) => p.group)).size === 1 &&
        d.board.placements[0].group,
      "Group missing",
    );
    const handles = [
      ...document.querySelectorAll(
        '.canvas-selection [aria-label^="调整选区"]',
      ),
    ];
    assert(
      handles.filter(
        (h) =>
          getComputedStyle(h, "::after").display !== "none" &&
          Number(getComputedStyle(h, "::after").opacity) === 1,
      ).length === 4,
      "Group handles missing",
    );
    clip.items = [];
    await more("复制为图片");
    await until(() => clip.items.length === 1);
    assert(
      (await clip.items[0].getType("image/png")).size > 500,
      "Group PNG empty",
    );
    await more("复制");
    assert(
      JSON.parse(clip.text).document.board.connectors.length === 1,
      "Selection clipboard lost internal connector",
    );
    await more("创建副本");
    await until(async () => (await saved()).board.placements.length === 6);
    assert(
      (await saved()).board.connectors.length === 2,
      "Selection duplicate lost connectors",
    );
    await more("移出画布");
    await until(async () => (await saved()).board.placements.length === 3);
    const routed = await saved();
    routed.board.connectors[0].waypoints = [
      { x: 285, y: 470 },
      { x: 285, y: 360 },
      { x: 460, y: 360 },
    ];
    await apply(routed);
    key("a", { metaKey: true });
    await wait(30);
    return {
      doc: await saved(),
      pointer: point(
        card(ids[0]).querySelector(".canvas-shape-content > span"),
      ),
    };
  }
  if (phase === "moved") {
    const d = await saved();
    for (const p of d.board.placements) {
      const old = expected.doc.board.placements.find((q) => q.id === p.id);
      assert(
        Math.abs(p.x - old.x - 24) < 2 && Math.abs(p.y - old.y - 18) < 2,
        "Grouped move geometry changed",
      );
    }
    assert(d.revision === expected.doc.revision + 1, "Group move not atomic");
    assert(
      d.board.connectors[0].waypoints.every(
        (p, i) =>
          Math.abs(p.x - expected.doc.board.connectors[0].waypoints[i].x - 24) <
            2 &&
          Math.abs(p.y - expected.doc.board.connectors[0].waypoints[i].y - 18) <
            2,
      ),
      "Grouped manual bends did not move",
    );
    button("撤销画布修改").click();
    await wait(40);
    assert(
      JSON.stringify((await saved()).board.placements) ===
        JSON.stringify(expected.doc.board.placements),
      "Group move undo incomplete",
    );
    button("重做画布修改").click();
    await wait(40);
    const el = document.querySelector('[aria-label="调整选区 右边"]');
    return { doc: await saved(), pointer: point(el) };
  }
  if (phase === "resized") {
    const d = await saved();
    assert(
      d.board.placements.every(
        (p) =>
          p.width >
          expected.doc.board.placements.find((q) => q.id === p.id).width,
      ),
      "Group resize not proportional",
    );
    assert(d.revision === expected.doc.revision + 1, "Group resize not atomic");
    button("撤销画布修改").click();
    await wait(40);
    await more("取消组合");
    await until(async () =>
      (await saved()).board.placements.every((p) => !p.group),
    );
    return {
      multiAlignDistribute: true,
      groupMoveResizeUndo: true,
      groupClipboardBindings: true,
    };
  }
  if (phase === "gap-setup" || phase === "size-setup") {
    const d = await saved();
    d.board.placements.forEach((p, i) =>
      Object.assign(p, {
        x: i * 350 + (i === 2 && phase === "gap-setup" ? 37 : 0),
        y: 400,
        width: i === 2 && phase === "size-setup" ? 233 : 220,
        height: 140,
      }),
    );
    await apply(d);
    button("适应画布内容").click();
    await wait(50);
    await select(ids[2]);
    return {
      pointer: point(
        card(ids[2]).querySelector(
          phase === "gap-setup"
            ? ".canvas-shape-content > span"
            : '[data-resize="e"]',
        ),
      ),
      zoom: JSON.parse(
        document.querySelector(".canvas-viewport").dataset.camera,
      ).zoom,
    };
  }
  if (phase === "gap-check") {
    assert(
      document.querySelectorAll('[data-measure-guide="gap"]').length >= 2,
      "Equal gap guides missing",
    );
    assert(
      Math.abs(parseFloat(card(ids[2]).style.left) - 700) < 1,
      "Equal spacing did not snap",
    );
    return;
  }
  if (phase === "size-check") {
    assert(
      document.querySelectorAll('[data-measure-guide="size"]').length >= 2,
      "Same size guides missing",
    );
    assert(
      Math.abs(parseFloat(card(ids[2]).style.width) - 220) < 1,
      "Width did not snap",
    );
    return;
  }
  if (phase === "narrow") {
    await select(ids[0]);
    button("形状文字格式").click();
    await wait(30);
    assert(
      bar().getBoundingClientRect().right <= innerWidth,
      "Shape bar overflow",
    );
    button("切换形状").click();
    await wait(30);
    const r = document
      .querySelector('[aria-label="对象形状面板"]')
      .getBoundingClientRect();
    assert(
      r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      "Shape panel overflow",
    );
    checkPopover();
    return;
  }
  if (phase === "restore") {
    const d = window.canvasFixture.parityOriginal;
    d.revision = (await saved()).revision;
    await apply(d);
    return {
      equalGapGuides: true,
      resizeSizeGuides: true,
      shapeToolbarNarrow: true,
    };
  }
}
