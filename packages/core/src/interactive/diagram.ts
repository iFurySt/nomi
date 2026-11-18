import { InteractiveError } from "./types";

export type DiagramEdge = { from: string; to: string };
/** Portable DAG semantics. Renderers choose their own sizing and edge routing. */
export function diagramLayers(
  children: string[],
  edges: DiagramEdge[],
): string[][] {
  const fail = (message: string): never => {
    throw new InteractiveError("schema", message);
  };
  if (
    !Array.isArray(children) ||
    !children.length ||
    children.length > 16 ||
    children.some((id) => typeof id !== "string") ||
    new Set(children).size !== children.length
  )
    fail("Diagram needs 1–16 unique nodes.");
  if (!Array.isArray(edges) || edges.length > 24)
    fail("Diagram has too many edges.");
  const incoming = new Map(children.map((id) => [id, 0]));
  const outgoing = new Map(children.map((id) => [id, [] as string[]]));
  const seen = new Set<string>();
  for (const edge of edges) {
    if (
      !edge ||
      Object.keys(edge).some((k) => !["from", "to"].includes(k)) ||
      !incoming.has(edge.from) ||
      !incoming.has(edge.to) ||
      edge.from === edge.to
    )
      fail("Invalid diagram endpoint.");
    const key = JSON.stringify([edge.from, edge.to]);
    if (seen.has(key)) fail("Duplicate diagram edge.");
    seen.add(key);
    outgoing.get(edge.from)!.push(edge.to);
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
  }
  const layers: string[][] = [];
  let next = children.filter((id) => incoming.get(id) === 0),
    visited = 0;
  while (next.length) {
    layers.push(next);
    visited += next.length;
    const ready = new Set<string>();
    for (const id of next)
      for (const to of outgoing.get(id)!) {
        incoming.set(to, incoming.get(to)! - 1);
        if (!incoming.get(to)) ready.add(to);
      }
    next = children.filter((id) => ready.has(id));
  }
  if (visited !== children.length) fail("Diagram must be acyclic.");
  return layers;
}
