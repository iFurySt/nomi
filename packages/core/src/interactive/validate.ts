import { learningFunctionArity } from "./functions";
import { InteractiveError, interactiveComponents } from "./types";
import type { InteractiveNode, InteractiveProgram } from "./types";
import {
  evaluateProgram,
  hydrateStudyState,
  interactiveFunctions,
  validStateValue,
} from "./runtime";

export const MAX_INTERACTIVE_BYTES = 262_144;
const fail = (
  message: string,
  code: ConstructorParameters<typeof InteractiveError>[0] = "schema",
): never => {
  throw new InteractiveError(code, message);
};
const object = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail("Expected an object.");
  return v as Record<string, any>;
};
const keys = (v: Record<string, any>, allowed: string[]) => {
  for (const k of Object.keys(v))
    if (!allowed.includes(k)) fail(`Unknown field: ${k}`);
};
const id = (v: unknown): string => {
  if (
    typeof v !== "string" ||
    !/^[a-zA-Z][\w.-]{0,95}$/.test(v) ||
    ["constructor", "prototype", "__proto__"].includes(v)
  )
    fail("Invalid identifier.");
  return v as string;
};
const number = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v))
    fail("Expected a finite number.");
  return v as number;
};
const integer = (v: unknown, lo: number, hi: number): number => {
  const n = number(v);
  if (!Number.isInteger(n) || n < lo || n > hi)
    fail("Integer outside supported limits.", "budget");
  return n;
};
const list = (v: unknown, max = 256): any[] => {
  if (!Array.isArray(v) || v.length > max)
    fail("List exceeds supported limit.", "budget");
  return v as any[];
};
const text = (v: unknown, max = 4096) => {
  if (typeof v !== "string" || v.length > max) fail("Expected bounded text.");
};
const fields: Record<string, string[]> = {
  Panel: ["children"],
  TextInput: ["label", "multiline"],
  Table: ["columns", "rows", "caption"],
  Metric: ["label", "value", "unit"],
  Scene: ["width", "height", "label", "items"],
  Row: ["children"],
  Text: ["text", "role"],
  Button: ["label"],
  SegmentedControl: ["label", "options"],
  Slider: ["label", "min", "max", "step", "marks"],
  Math: ["source"],
  Plot: ["series", "markers", "xAxis", "yAxis", "seriesLabels"],
};
const enhancedFields: Record<string, string[]> = {
  Table: [
    "visibleRows",
    "window",
    "highlightRow",
    "hint",
    "showCount",
    "columnAlign",
    "emptyText",
  ],
  Button: ["icon", "variant", "disabled"],
  TextInput: ["resetTargets", "hideLabel"],
};
export interface PlotSeries {
  series: number;
  points: { x: number; y: number }[];
}
export interface PlotMarker {
  series: number;
  x: number;
  y: number;
}
export interface PlotAxis {
  label: string;
  domain: [number, number];
  scale?: "linear";
  format?: "percent";
}
export function validateResolvedProps(
  component: string,
  p: Record<string, any>,
  version = 1,
) {
  if (component === "TextInput") {
    text(p.label, 128);
    if (p.hideLabel !== undefined && typeof p.hideLabel !== "boolean")
      fail("Invalid input label visibility.");
    if (p.multiline !== undefined && typeof p.multiline !== "boolean")
      fail("Invalid input mode.");
  }
  if (component === "Metric") {
    text(p.label, 128);
    if (typeof p.value === "number") number(p.value);
    else text(p.value, 256);
    if (p.unit !== undefined) text(p.unit, 64);
  }
  if (component === "Table") {
    const columns = list(p.columns, 12);
    if (!columns.length) fail("Missing columns.");
    columns.forEach((v) => text(v, 128));
    if (p.caption !== undefined) text(p.caption, 256);
    if (p.hint !== undefined) text(p.hint, 128);
    if (p.emptyText !== undefined) text(p.emptyText, 128);
    if (p.showCount !== undefined && typeof p.showCount !== "boolean")
      fail("Invalid table count visibility.");
    if (p.columnAlign !== undefined) {
      if (
        list(p.columnAlign, 12).length !== columns.length ||
        p.columnAlign.some(
          (a: unknown) => !["left", "right"].includes(String(a)),
        )
      )
        fail("Invalid table alignment.");
    }
    if (p.visibleRows !== undefined) integer(p.visibleRows, 1, 20);
    if (p.highlightRow !== undefined) integer(p.highlightRow, -1, 1023);
    if (p.window !== undefined && !["start", "end"].includes(p.window))
      fail("Invalid table window.");
    for (const row of list(p.rows, 1024)) {
      if (list(row, 12).length !== columns.length)
        fail("Table column mismatch.");
      row.forEach((v: unknown) => {
        if (version === 2 && v && typeof v === "object" && !Array.isArray(v)) {
          const cell = object(v);
          keys(cell, ["tokens", "emphasis", "groups", "joiners"]);
          const tokens = list(cell.tokens, 1025);
          tokens.forEach((t) => text(t, 2048));
          for (const index of list(cell.emphasis ?? [], 1025))
            integer(index, 0, tokens.length - 1);
          if (cell.joiners !== undefined) {
            if (
              list(cell.joiners, 1024).length !== Math.max(0, tokens.length - 1)
            )
              fail("Invalid token joiners.");
            cell.joiners.forEach((j: unknown) => {
              if (!["+", "→"].includes(String(j)))
                fail("Invalid token joiner.");
            });
          }
          const grouped = new Set<number>();
          for (const group of list(cell.groups ?? [], 512)) {
            const indices = list(group, 1025);
            if (indices.length < 2)
              fail("Token group requires adjacent tokens.");
            indices.forEach((index, i) => {
              integer(index, 0, tokens.length - 1);
              if (
                grouped.has(index as number) ||
                (i && index !== (indices[i - 1] as number) + 1)
              )
                fail("Invalid token group.");
              grouped.add(index as number);
            });
          }
        } else if (typeof v === "number") number(v);
        else text(v, 2048);
      });
    }
  }
  if (component === "Scene") {
    integer(p.width, 100, 1200);
    integer(p.height, 80, 800);
    text(p.label, 256);
    const color = (v: unknown) => {
      if (
        v !== undefined &&
        ![
          "ink",
          "muted",
          "accent",
          "blue",
          "green",
          "orange",
          "surface",
          "none",
        ].includes(v as string)
      )
        fail("Invalid semantic color.");
    };
    for (const item of list(p.items, 128)) {
      const q = object(item);
      keys(q, [
        "type",
        "x",
        "y",
        "width",
        "height",
        "radius",
        "x2",
        "y2",
        "text",
        "fill",
        "stroke",
      ]);
      if (!["rect", "circle", "line", "text"].includes(q.type))
        fail("Unsupported graphic.");
      for (const k of ["x", "y"])
        if (Math.abs(number(q[k])) > 4000) fail("Graphic outside bounds.");
      for (const k of ["width", "height", "radius", "x2", "y2"])
        if (q[k] !== undefined && Math.abs(number(q[k])) > 4000)
          fail("Graphic outside bounds.");
      if (
        q.type === "rect" &&
        (!(number(q.width) > 0) || !(number(q.height) > 0))
      )
        fail("Invalid rectangle.");
      if (q.type === "circle" && !(number(q.radius) > 0))
        fail("Invalid circle.");
      if (q.type === "line") {
        number(q.x2);
        number(q.y2);
      }
      if (q.type === "text") text(q.text, 256);
      color(q.fill);
      color(q.stroke);
    }
  }
  if (component === "Text") {
    text(p.text);
    if (p.role !== undefined && p.role !== "heading")
      fail("Unsupported text role.");
  }
  if (component === "Math") text(p.source, 8192);
  if (component === "Button") {
    text(p.label, 128);
    if (p.icon !== undefined && !["previous", "restart"].includes(p.icon))
      fail("Unsupported button icon.");
    if (
      p.variant !== undefined &&
      !["primary", "secondary"].includes(p.variant)
    )
      fail("Unsupported button variant.");
    if (p.disabled !== undefined && typeof p.disabled !== "boolean")
      fail("Invalid disabled state.");
  }
  if (component === "Slider") {
    text(p.label, 128);
    if (!(number(p.min) < number(p.max)) || !(number(p.step) > 0))
      fail("Invalid slider range.");
    for (const mark of list(p.marks ?? [], 16)) {
      const m = object(mark);
      text(m.label, 128);
      if (number(m.value) < p.min || m.value > p.max)
        fail("Invalid slider mark.");
    }
  }
  if (component === "SegmentedControl") {
    text(p.label, 128);
    const options = list(p.options, 16);
    if (!options.length) fail("Missing options.");
    const seen = new Set();
    for (const option of options) {
      const o = object(option);
      text(o.value, 96);
      text(o.label, 128);
      if (seen.has(o.value)) fail("Duplicate option.");
      seen.add(o.value);
    }
  }
  if (component === "Plot") {
    const axis = (v: unknown) => {
      const a = object(v);
      text(a.label, 128);
      const d = list(a.domain, 2);
      if (
        d.length !== 2 ||
        !(number(d[0]) < number(d[1])) ||
        !Number.isFinite(d[1] - d[0]) ||
        (a.scale !== undefined && a.scale !== "linear") ||
        (a.format !== undefined && a.format !== "percent")
      )
        fail("Unsupported axis.");
    };
    axis(p.xAxis);
    axis(p.yAxis);
    list(p.seriesLabels, 8).forEach((v) => text(v, 128));
    const series = list(p.series, 8);
    if (!series.length) fail("Missing plot data.");
    const ids = new Set();
    for (const entry of series) {
      const s = object(entry);
      integer(s.series, 0, 7);
      if (ids.has(s.series)) fail("Duplicate series.");
      ids.add(s.series);
      const points = list(s.points, 512);
      if (points.length < 2) fail("Missing curve points.");
      for (const point of points) {
        const q = object(point);
        number(q.x);
        number(q.y);
      }
    }
    const markerIds = new Set();
    for (const marker of list(p.markers, 8)) {
      const m = object(marker);
      if (!ids.has(m.series) || markerIds.has(m.series))
        fail("Unknown or duplicate marker series.");
      markerIds.add(m.series);
      number(m.x);
      number(m.y);
    }
  }
}
export function parseInteractiveProgram(
  input: string | unknown,
): InteractiveProgram {
  if (typeof input === "string") {
    if (input.length > MAX_INTERACTIVE_BYTES)
      fail("Program is too large.", "budget");
    try {
      input = JSON.parse(input);
    } catch {
      fail("The definition is not valid JSON.");
    }
  }
  let size = 0;
  const json = (v: unknown, depth = 0): void => {
    if (depth > 40 || ++size > 20_000)
      fail("Program is too deeply nested or large.", "budget");
    if (v === null || typeof v === "boolean" || typeof v === "string") return;
    if (typeof v === "number") {
      number(v);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > 2048) fail("Array too large.", "budget");
      v.forEach((x) => json(x, depth + 1));
      return;
    }
    const o = object(v);
    if (![Object.prototype, null].includes(Object.getPrototypeOf(o)))
      fail("Only JSON data is accepted.");
    for (const [k, val] of Object.entries(o)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        fail("Unsafe key.");
      json(val, depth + 1);
    }
  };
  json(input);
  if (
    new TextEncoder().encode(JSON.stringify(input)).length >
    MAX_INTERACTIVE_BYTES
  )
    fail("Program is too large.", "budget");
  const p = object(input);
  keys(p, [
    "schema",
    "id",
    "version",
    "profile",
    "requires",
    "budget",
    "state",
    "derived",
    "actions",
    "root",
    "nodes",
  ]);
  const v2 =
    p.schema === "nomi-interactive-ir/draft-2" &&
    p.profile === "portable.learning/draft-2";
  if (
    !v2 &&
    (p.schema !== "nomi-interactive-ir/draft-1" ||
      p.profile !== "portable.learning/draft-1")
  )
    fail("Unsupported interactive protocol.", "capability");
  id(p.id);
  integer(p.version, 1, 1_000_000);
  id(p.root);
  const req = object(p.requires);
  keys(req, ["components", "functions", "expressions", "hostEffects"]);
  if (list(req.hostEffects).length)
    fail("Host effects are not enabled in this profile.", "capability");
  const kinds = [
    "literal",
    "state",
    "variable",
    "derived",
    "call",
    "match",
    "object",
    "map",
    "sampleFamily",
  ];
  for (const [k, v] of Object.entries(object(req.components)))
    if (
      !interactiveComponents.includes(k as any) ||
      (v !== 1 && !(v2 && v === 2 && Object.hasOwn(enhancedFields, k))) ||
      (!v2 && ["TextInput", "Table", "Metric", "Scene"].includes(k))
    )
      fail(`Unsupported component: ${k}`, "capability");
  for (const [k, v] of Object.entries(object(req.functions)))
    if (
      !interactiveFunctions.includes(k as any) ||
      v !== 1 ||
      (!v2 && Object.hasOwn(learningFunctionArity, k))
    )
      fail(`Unsupported function: ${k}`, "capability");
  for (const k of list(req.expressions, 16))
    if (!kinds.includes(k)) fail("Unsupported expression.", "capability");
  const b = object(p.budget);
  keys(b, ["maxSamplePointsPerSeries", "maxSeries", "maxStepsPerEvaluation"]);
  integer(b.maxSamplePointsPerSeries, 2, 512);
  integer(b.maxSeries, 1, 8);
  integer(b.maxStepsPerEvaluation, 1, 100_000);
  const states = object(p.state);
  if (Object.keys(states).length > 64) fail("Too many state fields.", "budget");
  for (const [k, def] of Object.entries(states)) {
    id(k);
    const d = object(def);
    keys(d, [
      "type",
      "default",
      "scope",
      "min",
      "max",
      "step",
      "values",
      "itemType",
      "length",
      ...(v2 ? ["maxLength"] : []),
    ]);
    if (
      d.scope !== "user" ||
      !["number", "enum", "vector", ...(v2 ? ["string"] : [])].includes(d.type)
    )
      fail("Unsupported state type or scope.");
    if (d.type === "string") integer(d.maxLength, 1, 4096);
    if (d.type === "number") {
      if (d.min !== undefined) number(d.min);
      if (d.max !== undefined) number(d.max);
      if (d.min !== undefined && d.max !== undefined && d.min > d.max)
        fail("Invalid state range.");
      if (d.step !== undefined && number(d.step) <= 0)
        fail("Invalid state step.");
    }
    if (d.type === "enum") {
      const values = list(d.values, 32);
      if (!values.length || new Set(values).size !== values.length)
        fail("Invalid enum values.");
      values.forEach((v) => text(v, 96));
    }
    if (d.type === "vector") {
      if (d.itemType !== "number") fail("Only numeric vectors are supported.");
      integer(d.length, 1, 64);
    }
    if (!validStateValue(d as any, d.default))
      fail(`Invalid default for ${k}.`, "state");
  }
  const derived = object(p.derived),
    graph = new Map<string, Set<string>>();
  if (Object.keys(derived).length > 64)
    fail("Too many computations.", "budget");
  Object.keys(derived).forEach((k) => {
    id(k);
    graph.set(k, new Set());
  });
  const expression = (
    v: unknown,
    bound: Set<string>,
    owner?: string,
    depth = 0,
  ): void => {
    if (depth > 32) fail("Expression too deeply nested.", "budget");
    const e = object(v);
    if (!kinds.includes(e.kind) || !req.expressions.includes(e.kind))
      fail("Undeclared expression capability.", "capability");
    const walk = (x: unknown, next = bound) =>
      expression(x, next, owner, depth + 1);
    switch (e.kind) {
      case "literal":
        keys(e, ["kind", "value"]);
        if (!Object.hasOwn(e, "value")) fail("Missing literal.");
        break;
      case "state":
        keys(e, ["kind", "id"]);
        if (!Object.hasOwn(states, e.id))
          fail("Unknown state reference.", "reference");
        break;
      case "variable":
        keys(e, ["kind", "id"]);
        if (!bound.has(e.id)) fail("Unbound variable.", "reference");
        break;
      case "derived":
        keys(e, ["kind", "id"]);
        if (!Object.hasOwn(derived, e.id))
          fail("Unknown derived reference.", "reference");
        if (owner) graph.get(owner)!.add(e.id);
        break;
      case "call":
        keys(e, ["kind", "function", "version", "args"]);
        if (req.functions[e.function] !== 1 || e.version !== 1)
          fail("Undeclared function.", "capability");
        {
          const args = list(e.args, 3);
          if (
            args.length !==
            (learningFunctionArity[e.function] ??
              (e.function === "array.replaceAt" ? 3 : 2))
          )
            fail("Invalid function arity.");
          args.forEach((x) => walk(x));
        }
        break;
      case "object":
        keys(e, ["kind", "fields"]);
        Object.entries(object(e.fields)).forEach(([k, x]) => {
          id(k);
          walk(x);
        });
        break;
      case "match":
        keys(e, ["kind", "value", "cases"]);
        walk(e.value);
        if (!Object.keys(object(e.cases)).length) fail("Empty match.");
        Object.values(e.cases).forEach((x) => walk(x));
        break;
      case "map":
        keys(e, ["kind", "variable", "items", "body"]);
        id(e.variable);
        walk(e.items);
        walk(e.body, new Set([...bound, e.variable]));
        break;
      case "sampleFamily":
        keys(e, [
          "kind",
          "seriesVariable",
          "seriesValues",
          "sampleVariable",
          "domain",
          "count",
          "value",
        ]);
        id(e.seriesVariable);
        id(e.sampleVariable);
        if (e.seriesVariable === e.sampleVariable)
          fail("Sampling variables must be distinct.");
        {
          const values = list(e.seriesValues, b.maxSeries);
          if (!values.length || new Set(values).size !== values.length)
            fail("Invalid series.");
          values.forEach((x) => integer(x, 0, 7));
          const domain = list(e.domain, 2);
          if (domain.length !== 2 || !(number(domain[0]) < number(domain[1])))
            fail("Invalid sampling domain.");
          integer(e.count, 2, b.maxSamplePointsPerSeries);
          walk(
            e.value,
            new Set([...bound, e.seriesVariable, e.sampleVariable]),
          );
        }
        break;
    }
  };
  for (const [key, e] of Object.entries(derived)) expression(e, new Set(), key);
  const active = new Set<string>(),
    done = new Set<string>();
  const dfs = (key: string) => {
    if (active.has(key)) fail("Cyclic derived data.", "cycle");
    if (done.has(key)) return;
    active.add(key);
    graph.get(key)!.forEach(dfs);
    active.delete(key);
    done.add(key);
  };
  graph.forEach((_, key) => dfs(key));
  const actions = object(p.actions);
  if (Object.keys(actions).length > 64) fail("Too many actions.", "budget");
  for (const [key, a] of Object.entries(actions)) {
    id(key);
    const d = object(a);
    if (v2 && d.kind === "set") {
      keys(d, ["kind", "scope", "target", "value"]);
      if (d.scope !== "user" || !Object.hasOwn(states, d.target))
        fail("Invalid action target.");
      expression(d.value, new Set());
      continue;
    }
    keys(d, ["kind", "scope", "targets"]);
    if (d.kind !== "reset" || d.scope !== "user")
      fail("Unsupported action.", "capability");
    list(d.targets, 64).forEach((t) => {
      if (!Object.hasOwn(states, t))
        fail("Unknown action target.", "reference");
    });
  }
  const nodes = list(p.nodes, 256),
    byId = new Map<string, InteractiveNode>();
  const data = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(data);
    else if (v && typeof v === "object") {
      if (Object.hasOwn(v, "kind")) expression(v, new Set());
      else Object.values(v).forEach(data);
    }
  };
  for (const n of nodes) {
    const node = object(n);
    keys(node, ["id", "component", "version", "props", "bind", "on"]);
    id(node.id);
    if (byId.has(node.id)) fail("Duplicate view identity.");
    if (
      !req.components[node.component] ||
      req.components[node.component] !== node.version
    )
      fail("Undeclared component.", "capability");
    keys(object(node.props), [
      ...(fields[node.component] ?? []),
      ...(node.version === 2 ? (enhancedFields[node.component] ?? []) : []),
    ]);
    if (node.props.resetTargets !== undefined) {
      for (const target of list(node.props.resetTargets, 32)) {
        if (
          typeof target !== "string" ||
          !Object.hasOwn(states, target) ||
          target === node.bind?.value
        )
          fail("Invalid reset target.");
      }
    }
    data(node.props);
    if (node.bind) {
      keys(object(node.bind), ["value"]);
      const def =
        Object.hasOwn(states, node.bind.value) && states[node.bind.value];
      if (
        !def ||
        !["Slider", "SegmentedControl", "TextInput"].includes(node.component)
      )
        fail("Invalid input binding.");
      if (node.component === "TextInput" && def.type !== "string")
        fail("Text input needs a string binding.");
      if (
        node.component === "Slider" &&
        (def.type !== "number" ||
          node.props.min !== def.min ||
          node.props.max !== def.max ||
          node.props.step !== def.step)
      )
        fail("Slider binding must match numeric constraints.");
      if (
        node.component === "SegmentedControl" &&
        (def.type !== "enum" ||
          !Array.isArray(node.props.options) ||
          node.props.options.some((x: any) => !def.values.includes(x.value)) ||
          def.values.some(
            (v: string) => !node.props.options.some((o: any) => o.value === v),
          ))
      )
        fail("Options must cover bound enum.");
    } else if (
      ["Slider", "SegmentedControl", "TextInput"].includes(node.component)
    )
      fail("Inputs need a state binding.");
    if (node.on) {
      keys(object(node.on), ["activate"]);
      if (
        node.component !== "Button" ||
        !Object.hasOwn(actions, node.on.activate)
      )
        fail("Unknown action binding.", "reference");
    } else if (node.component === "Button")
      fail("Buttons need an action binding.");
    byId.set(node.id, node as InteractiveNode);
  }
  if (!byId.has(p.root)) fail("Unknown root.", "reference");
  const path = new Set<string>(),
    visited = new Set<string>();
  const tree = (key: string, depth = 0) => {
    if (depth > 32) fail("View tree too deep.", "budget");
    if (path.has(key)) fail("Cyclic view tree.", "cycle");
    if (visited.has(key)) fail("Each view node needs one parent.");
    const n = byId.get(key);
    if (!n) fail("Unknown child.", "reference");
    path.add(key);
    visited.add(key);
    if (["Panel", "Row"].includes(n!.component))
      list(n!.props.children).forEach((c) => tree(id(c), depth + 1));
    path.delete(key);
  };
  tree(p.root);
  if (visited.size !== nodes.length)
    fail("Unreachable view node.", "reference");
  const program = structuredClone(p) as InteractiveProgram;
  const runtime = evaluateProgram(program, hydrateStudyState(program));
  for (const node of program.nodes)
    validateResolvedProps(node.component, runtime.props(node.id), node.version);
  return program;
}
