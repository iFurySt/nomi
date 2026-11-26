// Map rendered text and formulas back to their original Markdown source ranges.
import React from "react";
import { readTable, adjustTable, tableControls } from "./tableEditing";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathMarkdown } from "../../../packages/ui/src/writing/mathDelimiters";
import { remarkMathAlignment } from "../../../packages/ui/src/writing/mathSource";
import { remarkTableBreaks } from "../../../packages/ui/src/writing/tableMarkdown";

const english = document.documentElement.lang === "en";

function sourcePositions({ readOnly }) {
  function formulaControl(code) {
    return readOnly
      ? {}
      : {
          role: "button",
          tabIndex: 0,
          "aria-label":
            (english ? "Edit equation " : "编辑公式 ") +
            code?.children?.[0]?.value,
        };
  }
  return (tree) => {
    function visit(node) {
      const start = node.position?.start.offset;
      if (node.type === "element" && start != null) {
        node.properties["data-start"] = start;
        node.properties["data-end"] = node.position.end.offset;
        if (node.properties.className?.includes("nomi-math-block")) {
          Object.assign(node.properties, formulaControl(node.children[0]));
        }
      }
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === "text" && child.position && child.value.trim()) {
          return {
            type: "element",
            tagName: "span",
            properties: {
              "data-start": child.position.start.offset,
              "data-end": child.position.end.offset,
            },
            children: [child],
          };
        }
        visit(child);
        // KaTeX replaces its input node. Keep an outer element with the
        // original Markdown range, including inline delimiters.
        if (
          child.properties?.className?.includes("math-inline") &&
          child.position
        ) {
          return {
            type: "element",
            tagName: "span",
            properties: {
              ...formulaControl(child),
              "data-formula": "",
              "data-start": child.position.start.offset,
              "data-end": child.position.end.offset,
            },
            children: [child],
          };
        }
        return child;
      });
    }
    visit(tree);
  };
}

const root = createRoot(document.getElementById("page"));
let currentTitle = "";
let locked = false;
let active = null;
let sections = [];
function sourceOffset(section, position) {
  let delta = 0;
  for (const { start, from, to } of section.replacements) {
    if (position < start + delta) break;
    if (position < start + delta + to)
      return start + Math.min(from, position - start - delta);
    delta += to - from;
  }
  return position - delta;
}

window.showManuscript = (title, blocks, readOnly) => {
  removeField();
  currentTitle = title;
  locked = readOnly;
  sections = blocks.map((block) => {
    const replacements = [];
    const markdown = block.editable
      ? normalizeMathMarkdown(block.source, (start, original, normalized) => {
          replacements.push({
            start,
            from: original.length,
            to: normalized.length,
          });
        })
      : block.source;
    return { ...block, markdown, replacements };
  });
  flushSync(() =>
    root.render(
      <>
        <h1 id="title">{title}</h1>
        {sections.map((section, index) =>
          section.editable ? (
            <article key={section.key} data-section={index}>
              <Markdown
                remarkPlugins={[
                  remarkGfm,
                  remarkMath,
                  remarkMathAlignment,
                  remarkTableBreaks,
                ]}
                rehypePlugins={[
                  [sourcePositions, { readOnly }],
                  [
                    rehypeKatex,
                    {
                      output: "mathml",
                      trust: false,
                      maxExpand: 200,
                      maxSize: 10,
                      throwOnError: false,
                    },
                  ],
                ]}
                components={{
                  table: ({ node, ...props }) => (
                    <div className="table-scroll">
                      <table {...props} />
                    </div>
                  ),
                  th: ({ node, children, ...props }) => (
                    <th {...props}>
                      <span className="cell-content">{children}</span>
                    </th>
                  ),
                  td: ({ node, children, ...props }) => (
                    <td {...props}>
                      <span className="cell-content">{children}</span>
                    </td>
                  ),
                  img: ({ alt }) => (
                    <span>{alt || (english ? "Image" : "图片")}</span>
                  ),
                  input: ({ checked }) => (
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      readOnly
                      aria-label={english ? "Checklist item" : "待办事项"}
                    />
                  ),
                }}
              >
                {section.markdown}
              </Markdown>
            </article>
          ) : (
            <aside key={section.key}>{section.source}</aside>
          ),
        )}
      </>,
    ),
  );
};

function notify(type, value, key = "") {
  window.webkit.messageHandlers.manuscript.postMessage({ type, value, key });
}
new ResizeObserver(() =>
  notify("height", document.getElementById("page").offsetHeight),
).observe(document.getElementById("page"));

// Keep the committed Markdown intact. Only the source range behind the tapped
// glyphs becomes editable, so neighbouring formulas and list markers stay put.
const page = document.getElementById("page");
function removeField() {
  if (!active) return;
  const { host, field } = active;
  active.cleanup?.();
  if (active.tableCell) notify("tableCell", false);
  active = null;
  field.remove();
  if (host) host.hidden = false;
}
function valueOf(a) {
  if (!a.dirty) return a.base.slice(a.start, a.end);
  const value = a.field.innerText.replace(/\r\n?/g, "\n");
  return a.tableCell
    ? value
        .replace(/(\\*)\|/g, (match, slashes) =>
          slashes.length % 2 ? match : "\\" + match,
        )
        .replace(/\n/g, "<br>")
    : value;
}
function sourceOf(a) {
  return a.base.slice(0, a.start) + valueOf(a) + a.base.slice(a.end);
}
function commitField() {
  if (!active) return;
  const { section } = active;
  const source = sourceOf(active);
  removeField();
  if (section) section.source = source;
  else currentTitle = source;
  window.showManuscript(currentTitle, sections, locked);
}
function rangeOf(el, section) {
  return [
    sourceOffset(section, +el.dataset.start),
    sourceOffset(section, +el.dataset.end),
  ];
}
function selectText(field, from, to = from) {
  const text =
    field.firstChild ?? field.appendChild(document.createTextNode(""));
  const range = document.createRange();
  range.setStart(text, Math.min(text.length, Math.max(0, from)));
  range.setEnd(text, Math.min(text.length, Math.max(0, to)));
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function openField(
  host,
  section,
  start,
  end,
  cursor,
  selectionEnd = cursor,
  formula = false,
) {
  if (locked) return;
  const base = section ? section.source : currentTitle;
  if (formula) {
    const raw = base.slice(start, end);
    const delimiters =
      /^(\$\$|\$|\\\(|\\\[)([\s\S]*?)(\$\$|\$|\\\)|\\\])$/.exec(raw);
    if (delimiters) {
      start += delimiters[1].length;
      end -= delimiters[3].length;
    }
  }
  const field = document.createElement("span");
  field.className = "source-field";
  field.contentEditable = "plaintext-only";
  field.setAttribute("role", "textbox");
  field.setAttribute(
    "aria-label",
    formula
      ? "LaTeX"
      : section
        ? english
          ? "Body"
          : "正文"
        : english
          ? "Title"
          : "标题",
  );
  if (formula) {
    field.spellcheck = false;
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("autocorrect", "off");
  }
  field.textContent = base.slice(start, end);
  // Nest the field inside an identical heading/paragraph style when the
  // entire element (such as the title) is the editing target.
  if (host) {
    const css = getComputedStyle(host);
    for (const prop of [
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "letter-spacing",
      "display",
      "margin",
      "padding",
    ]) {
      field.style.setProperty(prop, css.getPropertyValue(prop));
    }
    host.after(field);
    host.hidden = true;
  } else {
    const article = page.querySelector(
      `article[data-section="${sections.indexOf(section)}"]`,
    );
    const next = Array.from(article.children).find(
      (el) => el.hasAttribute("data-start") && rangeOf(el, section)[0] >= start,
    );
    article.insertBefore(field, next ?? null);
  }
  active = { host, section, field, start, end, base, dirty: false };
  field.addEventListener("input", (event) => {
    if (active?.field !== field) return;
    active.dirty = true;
    notify(section ? "body" : "title", sourceOf(active), section?.key ?? "");
    notify("undo", document.queryCommandEnabled("undo"));
    if (
      section &&
      !formula &&
      !event.isComposing &&
      (event.inputType === "insertParagraph" ||
        event.inputType === "insertLineBreak" ||
        /^\s$/.test(event.data ?? "")) &&
      /(?:\$[^$\n]+\$|\\[()[\]])/.test(valueOf(active))
    ) {
      const caret = window.manuscriptSelection();
      commitField();
      window.focusManuscriptAt(caret.key, caret.location);
    }
  });
  field.addEventListener("keydown", (event) => {
    if (!section && event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      const text = valueOf(active);
      const selection = getSelection();
      const from = Math.min(selection.anchorOffset, selection.focusOffset);
      const to = Math.max(selection.anchorOffset, selection.focusOffset);
      const body = sections.find((item) => item.editable);
      if (!body) return;
      const suffix = text.slice(to);
      currentTitle = text.slice(0, from);
      notify("title", currentTitle);
      if (suffix) {
        body.source = suffix + (body.source ? "\n\n" : "") + body.source;
        notify("body", body.source, body.key);
      }
      window.showManuscript(currentTitle, sections, locked);
      window.focusManuscriptAt(body.key, 0);
    }
  });
  field.focus();
  selectText(field, cursor - start, selectionEnd - start);
  notify("edit", start, section?.key ?? "");
  notify("undo", document.queryCommandEnabled("undo"));
}
function articleFor(section) {
  return page.querySelector(
    `article[data-section="${sections.indexOf(section)}"]`,
  );
}
function leafAt(section, from, to = from) {
  const article = articleFor(section);
  const nodes = Array.from(article.querySelectorAll("[data-start][data-end]"));
  return nodes.reverse().find((node) => {
    const [a, b] = rangeOf(node, section);
    return a <= from && b >= to;
  });
}
function cellModel(cell, section) {
  const table = cell.closest("table");
  if (!table.parentElement.parentElement.matches("article")) return null;
  const [start, end] = rangeOf(table, section);
  return readTable(section.source, start, end);
}

function openCell(cell, section, position, selectionEnd = position) {
  const model = cellModel(cell, section);
  if (!model) return false;
  const row = cell.parentElement.rowIndex;
  const column = cell.cellIndex;
  const value = model.rows[row]?.[column];
  // GFM may synthesize empty trailing cells. Materialize their delimiters
  // before editing so typing cannot spill into the following row.
  if (!value) {
    const cells = model.rows[row];
    if (!cells) return false;
    const lines = section.source.slice(model.start, model.end).split("\n");
    const index = row === 0 ? 0 : row + 1;
    lines[index] =
      "| " +
      model.divider.map((_, i) => cells[i]?.value ?? "").join(" | ") +
      " |";
    replaceTable(section, model, { text: lines.join("\n"), row, column });
    return true;
  }
  openField(
    cell.querySelector(".cell-content"),
    section,
    value.from,
    value.to,
    position ?? value.to,
    selectionEnd ?? value.to,
  );
  active.tableCell = true;
  notify("tableCell", true);
  active.cleanup = tableControls(cell, model, english, (axis, operation) => {
    const latest = sourceOf(active);
    const updated = readTable(
      latest,
      model.start,
      model.end + latest.length - active.base.length,
    );
    if (!updated) return;
    const change = adjustTable(updated, row, column, axis, operation);
    if (change) {
      section.source = latest;
      replaceTable(section, updated, change);
    }
  });
  return true;
}

function replaceTable(section, model, change) {
  section.source =
    section.source.slice(0, model.start) +
    change.text +
    section.source.slice(model.end);
  notify("body", section.source, section.key);
  window.showManuscript(currentTitle, sections, locked);
  section = sections.find((s) => s.key === section.key);
  const table = Array.from(articleFor(section).querySelectorAll("table")).find(
    (el) => rangeOf(el, section)[0] === model.start,
  );
  const cell = table?.rows[change.row]?.cells[change.column];
  if (cell) openCell(cell, section);
}

// Empty GFM items have no rendered text node. Keep the caret after the
// marker inside the item so typing immediately fills the new list entry.
function focusEmptyItem(section, position) {
  const lineStart = section.source.lastIndexOf("\n", position - 1) + 1;
  const marker = section.source.slice(lineStart, position);
  if (
    !/^\s*(?:[-+*](?: \[[ xX]\])?|\d+[.)]) $/.test(marker) ||
    !["", "\n", "\r"].includes(section.source.charAt(position))
  )
    return false;
  const item = Array.from(
    articleFor(section).querySelectorAll("li[data-start]"),
  ).find((el) => {
    const [start] = rangeOf(el, section);
    return start >= lineStart && start < position;
  });
  if (!item) return false;
  const host = document.createElement("span");
  while (item.firstChild) host.append(item.firstChild);
  item.append(host);
  let box;
  const hadTaskStyle = item.classList.contains("task-list-item");
  if (/\[[ xX]\]/.test(marker)) {
    item.classList.add("task-list-item");
    box = document.createElement("input");
    box.type = "checkbox";
    box.checked = /\[[xX]\]/.test(marker);
    box.setAttribute("aria-label", english ? "Checklist item" : "待办事项");
    item.prepend(box);
  }
  openField(host, section, position, position, position);
  active.cleanup = () => {
    box?.remove();
    if (!hadTaskStyle) item.classList.remove("task-list-item");
    host.replaceWith(...host.childNodes);
  };
  return true;
}

function focusTableCell(section, from, to = from) {
  const cell = leafAt(section, from, to)?.closest("th,td");
  return cell && openCell(cell, section, from, to);
}
window.focusManuscriptAt = (key, offset) => {
  if (active || locked) return;
  const section = sections.find((s) => s.key === key && s.editable);
  if (!section) return;
  const position = Math.min(Math.max(0, offset), section.source.length);
  if (focusTableCell(section, position) || focusEmptyItem(section, position))
    return;
  const texts = Array.from(
    articleFor(section).querySelectorAll("span[data-start]"),
  );
  const leaf = texts.find((node) => {
    const [from, to] = rangeOf(node, section);
    return (
      from <= position &&
      position <= to &&
      !node.closest("[data-formula],.nomi-math-block")
    );
  });
  const [start, end] = leaf ? rangeOf(leaf, section) : [position, position];
  openField(leaf, section, start, end, position);
};
window.focusManuscriptEnd = () => {
  if (active || locked) return;
  const section = sections.findLast((block) => block.editable);
  if (section) window.focusManuscriptAt(section.key, section.source.length);
  else
    openField(
      page.querySelector("#title"),
      null,
      0,
      currentTitle.length,
      currentTitle.length,
    );
};
window.manuscriptSelection = () => {
  if (!active?.section) return null;
  const { section, field, start } = active;
  const selection = getSelection();
  let from = valueOf(active).length,
    to = from;
  if (
    selection.rangeCount &&
    field.contains(selection.anchorNode) &&
    field.contains(selection.focusNode)
  ) {
    const range = selection.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(field);
    before.setEnd(range.startContainer, range.startOffset);
    from = before.toString().length;
    to = from + range.toString().length;
  }
  return {
    key: section.key,
    source: sourceOf(active),
    location: start + from,
    length: to - from,
  };
};
window.manuscriptBodySelection = (format) => {
  if (active?.tableCell) {
    if (format === "table") page.querySelector(".table-handle.column")?.click();
    return null;
  }
  if (!active?.section) {
    commitField();
    window.focusManuscriptEnd();
  }
  return window.manuscriptSelection();
};
window.applyManuscriptFormat = (base, source, from, to) => {
  if (locked || !active?.section || sourceOf(active) !== base) return;
  const key = active.section.key;
  active.section.source = source;
  removeField();
  window.showManuscript(currentTitle, sections, locked);
  const section = sections.find((s) => s.key === key);
  if (
    focusTableCell(section, from, to) ||
    (from === to && focusEmptyItem(section, from))
  ) {
    notify("body", source, key);
    return;
  }
  const node = leafAt(section, from, to);
  const [start, end] = node ? rangeOf(node, section) : [from, to];
  openField(
    node,
    section,
    start,
    end,
    from,
    to,
    Boolean(node?.closest("[data-formula],.nomi-math-block")),
  );
  notify("body", source, key);
};
window.endManuscriptEditing = commitField;
document.addEventListener("keydown", (event) => {
  if (
    event.target.matches('[role="button"][data-start]') &&
    ["Enter", " "].includes(event.key)
  ) {
    event.preventDefault();
    event.target.click();
  }
});
document.addEventListener("click", (event) => {
  if (active?.field.contains(event.target)) return;
  const article = event.target.closest("article");
  let section = article ? sections[Number(article.dataset.section)] : null;
  const sectionKey = section?.key;
  const item = event.target.closest("li[data-start]");
  const checkbox = event.target.matches("input[type=checkbox]");
  const link = event.target.closest("a");
  if (link) {
    event.preventDefault();
    notify("link", link.getAttribute("href"));
    return;
  }
  if (
    locked ||
    event.target.closest("aside") ||
    (!active && getSelection()?.toString())
  )
    return;
  const cell = event.target.closest("th,td");
  if (
    cell &&
    section &&
    !event.target.closest("[data-formula],.nomi-math-block") &&
    cellModel(cell, section)
  ) {
    const row = cell.parentElement.rowIndex,
      column = cell.cellIndex;
    const tables = Array.from(article.querySelectorAll("table"));
    const index = tables.indexOf(cell.closest("table"));
    const hit = document.caretRangeFromPoint(event.clientX, event.clientY);
    const leaf = hit?.startContainer.parentElement.closest("span[data-start]");
    const cursor =
      leaf && cell.contains(leaf)
        ? rangeOf(leaf, section)[0] + hit.startOffset
        : undefined;
    const delta =
      active?.section === section && cursor >= active.end
        ? valueOf(active).length - (active.end - active.start)
        : 0;
    commitField();
    section = sections.find((s) => s.key === sectionKey);
    const next =
      articleFor(section).querySelectorAll("table")[index]?.rows[row]?.cells[
        column
      ];
    if (
      next &&
      openCell(next, section, cursor == null ? undefined : cursor + delta)
    )
      return;
  }
  const title = event.target.closest("#title");
  const math = event.target.closest("[data-formula],.nomi-math-block");
  const range = document.caretRangeFromPoint(event.clientX, event.clientY);
  const hit = range?.startContainer.parentElement;
  const nearest = hit && event.target.contains(hit) ? hit : event.target;
  let host = title ?? math ?? nearest.closest("[data-start][data-end]");
  // A tap on paragraph padding can resolve to the paragraph itself. Pick an
  // editable text run without exposing the surrounding list or formula source.
  if (
    !math &&
    !checkbox &&
    !title &&
    host?.querySelector("math,input,span[data-start]")
  ) {
    const runs = [...host.querySelectorAll("span[data-start]")].filter(
      (node) => !node.closest("[data-formula],.nomi-math-block"),
    );
    const distance = (node) => {
      const r = node.getBoundingClientRect();
      return Math.hypot(
        Math.max(r.left - event.clientX, 0, event.clientX - r.right),
        Math.max(r.top - event.clientY, 0, event.clientY - r.bottom),
      );
    };
    host = runs.sort((a, b) => distance(a) - distance(b))[0] ?? null;
  }
  let [start, end] = title
    ? [0, currentTitle.length]
    : section && host
      ? rangeOf(host, section)
      : [0, 0];
  let itemStart = checkbox && item ? rangeOf(item, section)[0] : 0;
  const local =
    range && host?.contains(range.startContainer) ? range.startOffset : 0;
  let target = host;
  if (active) {
    const key = active.section?.key;
    const delta = valueOf(active).length - (active.end - active.start);
    if (key === sectionKey && start >= active.end) {
      start += delta;
      end += delta;
    }
    if (key === sectionKey && itemStart >= active.end) itemStart += delta;
    commitField();
    section = sections.find((s) => s.key === sectionKey);
    target = title
      ? page.querySelector("#title")
      : section && host
        ? leafAt(section, start, end)
        : null;
  }
  if (checkbox) {
    event.preventDefault();
    if (section && item) notify("task", itemStart, section.key);
  } else if (target) {
    openField(
      target,
      section,
      start,
      end,
      Math.min(end, start + local),
      undefined,
      Boolean(math),
    );
  } else window.focusManuscriptEnd();
});
