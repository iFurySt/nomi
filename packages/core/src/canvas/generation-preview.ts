import { parseCanvasGeneration, canvasGenerationPrefix } from "./generation";
import type { InteractiveProgram } from "../interactive";

/** Read only closed JSON values. Partial containers carry completeness separately. */
function readPrefix(source: string) {
  let at = 0,
    visits = 0;
  const complete = new Set<string>();
  const space = () => {
    while (/\s/.test(source[at] ?? "") && at < source.length) at++;
  };
  const read = (path: string[], depth = 0): any => {
    if (depth > 40 || ++visits > 20000) throw Error("Preview budget exceeded.");
    space();
    const start = at,
      c = source[at];
    if (c === "{" || c === "[") {
      const array = c === "[",
        end = array ? "]" : "}";
      const value: any = array ? [] : Object.create(null);
      at++;
      space();
      if (source[at] === end) {
        at++;
        complete.add(JSON.stringify(path));
        return value;
      }
      while (at < source.length) {
        const key = array
          ? String(value.length)
          : read([...path, "$key"], depth + 1);
        if (!array) {
          if (
            typeof key !== "string" ||
            ["__proto__", "constructor", "prototype"].includes(key)
          )
            throw Error("Invalid key.");
          space();
          if (source[at++] !== ":") throw Error("Missing colon.");
        }
        const item = read([...path, key], depth + 1);
        if (item !== undefined) value[key] = item;
        space();
        if (source[at] === end) {
          at++;
          complete.add(JSON.stringify(path));
          return value;
        }
        if (source[at] !== ",") return value;
        at++;
      }
      return value;
    }
    if (c === '"') {
      at++;
      let escaped = false;
      while (at < source.length) {
        const q = source[at++];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (q === "\\") {
          escaped = true;
          continue;
        }
        if (q === '"') {
          complete.add(JSON.stringify(path));
          return JSON.parse(source.slice(start, at));
        }
      }
      return undefined;
    }
    while (at < source.length && !/[\s,\]}]/.test(source[at])) at++;
    if (at === source.length) return undefined;
    const value = JSON.parse(source.slice(start, at));
    complete.add(JSON.stringify(path));
    return value;
  };
  return { value: read([]), complete };
}

/** Validated temporary subtrees only; never commits or runs partially authored code. */
export function interactiveGenerationPrefix(text: string): string | undefined {
  let fallback = canvasGenerationPrefix(text);
  if (fallback) {
    try {
      parseCanvasGeneration(fallback);
    } catch {
      fallback = undefined;
    }
  }
  const source = text.replace(/^\s*```(?:json)?\s*/, "");
  try {
    const { value, complete } = readPrefix(source);
    if (!Array.isArray(value?.commands) || value.commands.length > 60)
      return fallback;
    const commands: any[] = [];
    for (let i = 0; i < value.commands.length; i++) {
      const path = ["commands", String(i)],
        c = value.commands[i];
      const closed = (tail: string[]) =>
        complete.has(JSON.stringify([...path, ...tail]));
      if (closed([])) {
        commands.push(c);
        continue;
      }
      const p = c?.block?.program as InteractiveProgram;
      if (
        c?.type !== "add_block" ||
        c.block?.type !== "interactive" ||
        !p ||
        !closed(["placement"]) ||
        !Array.isArray(p.nodes)
      )
        break;
      const base = ["block", "program"];
      if (
        ![
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
        ].every((k) => closed([...base, k]))
      )
        break;
      const nodes = p.nodes.filter((_, j) =>
        closed([...base, "nodes", String(j)]),
      );
      const byId = new Map(nodes.map((n) => [n.id, n]));
      if (byId.size !== nodes.length) break;
      const kept: typeof nodes = [],
        seen = new Set<string>();
      const visit = (id: string, depth = 0): boolean => {
        if (!byId.has(id)) return false;
        if (seen.has(id) || depth > 32) throw Error("Invalid preview tree.");
        seen.add(id);
        const n = structuredClone(byId.get(id)!);
        if (["Panel", "Row"].includes(n.component)) {
          if (!Array.isArray(n.props.children))
            throw Error("Invalid children.");
          n.props.children = n.props.children.filter(
            (child) => typeof child === "string" && visit(child, depth + 1),
          );
        }
        kept.push(n);
        return true;
      };
      if (!visit(p.root) || kept.length < 2) break;
      commands.push({
        ...c,
        block: { ...c.block, program: { ...p, nodes: kept } },
      });
      break;
    }
    if (!commands.length) return fallback;
    const result = JSON.stringify({ commands });
    parseCanvasGeneration(result); // Same strict runtime validation as final output.
    return result;
  } catch {
    return fallback;
  }
}
