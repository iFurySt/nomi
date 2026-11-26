// Work on the selected GFM table only. Cell boundaries are UTF-16 offsets in
// the original source, including optional outer pipes and escaped literal pipes.
function rowCells(line, start) {
  const boundaries = [];
  let backslashes = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && backslashes % 2 === 0) boundaries.push(i);
    backslashes = line[i] === "\\" ? backslashes + 1 : 0;
  }
  const ends = [-1, ...boundaries, line.length];
  if (boundaries.length && !line.slice(0, boundaries[0]).trim()) ends.shift();
  if (boundaries.length && !line.slice(boundaries.at(-1) + 1).trim())
    ends.pop();
  return ends.slice(1).map((end, index) => {
    const raw = line.slice(ends[index] + 1, end);
    const value = raw.trim();
    const from =
      start +
      ends[index] +
      1 +
      (value ? raw.indexOf(value) : Math.floor(raw.length / 2));
    return { value, from, to: from + value.length };
  });
}

export function readTable(source, start, end) {
  const raw = source.slice(start, end);
  let offset = start;
  const lines = raw.split("\n").map((line) => {
    const cells = rowCells(line, offset);
    offset += line.length + 1;
    return cells;
  });
  const [header, divider, ...body] = lines;
  if (
    !header?.length ||
    divider?.length !== header.length ||
    !divider.every(({ value }) => /^:?-+:?$/.test(value))
  )
    return null;
  const rows = [header, ...body];
  if (rows.some((row) => row.length > header.length)) return null;
  return {
    start,
    end,
    rows,
    divider,
    newline: raw.includes("\r\n") ? "\r\n" : "\n",
  };
}

export function adjustTable(model, row, column, axis, operation) {
  const rows = model.rows.map((cells) =>
    model.divider.map((_, i) => cells[i]?.value ?? ""),
  );
  const divider = model.divider.map((cell) => cell.value);
  const isRow = axis === "row";
  const count = isRow ? rows.length : divider.length;
  if (operation === "delete" && count === 1) return null;
  const index = (isRow ? row : column) + Number(operation === "after");
  const remove = operation === "delete";
  if (isRow) {
    rows.splice(
      index,
      Number(remove),
      ...(remove ? [] : [divider.map(() => "")]),
    );
    row = Math.min(index, rows.length - 1);
  } else {
    for (const cells of rows)
      cells.splice(index, Number(remove), ...(remove ? [] : [""]));
    divider.splice(index, Number(remove), ...(remove ? [] : ["---"]));
    column = Math.min(index, divider.length - 1);
  }
  const lines = [rows[0], divider, ...rows.slice(1)];
  return {
    text: lines
      .map((cells) => "| " + cells.join(" | ") + " |")
      .join(model.newline),
    row,
    column,
  };
}

export function tableControls(cell, model, english, adjust) {
  const table = cell.closest("table");
  const row = cell.parentElement.rowIndex;
  const column = cell.cellIndex;
  const controls = [];
  let menu;
  function handle(axis, anchor, label, choices, count) {
    const button = document.createElement("button");
    button.className = "table-handle " + axis;
    button.type = "button";
    button.textContent = "•••";
    button.setAttribute("aria-label", label);
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = (e) => {
      e.stopPropagation();
      const same = menu?.dataset.axis === axis;
      menu?.remove();
      menu = null;
      if (same) return;
      menu = document.createElement("div");
      menu.dataset.axis = axis;
      menu.className = "table-actions";
      menu.setAttribute("role", "group");
      menu.setAttribute("aria-label", label);
      choices.forEach((name, i) => {
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = name;
        action.disabled = i === 2 && count === 1;
        action.onmousedown = (e) => e.preventDefault();
        action.onclick = (e) => {
          e.stopPropagation();
          adjust(axis, ["before", "after", "delete"][i]);
        };
        menu.append(action);
      });
      table.closest(".table-scroll").before(menu);
    };
    anchor.append(button);
    controls.push(button);
  }
  handle(
    "row",
    table.rows[row].cells[0],
    english ? "Row actions" : "行操作",
    english
      ? ["Insert above", "Insert below", "Delete row"]
      : ["上方插入行", "下方插入行", "删除行"],
    model.rows.length,
  );
  handle(
    "column",
    table.rows[0].cells[column],
    english ? "Column actions" : "列操作",
    english
      ? ["Insert left", "Insert right", "Delete column"]
      : ["左侧插入列", "右侧插入列", "删除列"],
    model.divider.length,
  );
  return () => {
    menu?.remove();
    controls.forEach((button) => button.remove());
  };
}
