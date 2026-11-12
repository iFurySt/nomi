import { readFile, stat } from "node:fs/promises";
import {
  parseInteractiveProgram,
  validateResolvedProps,
  evaluateProgram,
  hydrateStudyState,
  setStudyValue,
  runStudyAction,
} from "./runtime.mjs";

// Validation executes only bounded DSL operations; generated source is never evaluated.
async function readBounded(file) {
  if ((await stat(file)).size > 262144)
    throw new Error("File exceeds 256 KiB.");
  return readFile(file, "utf8");
}
try {
  const [file, eventsFile] = process.argv.slice(2);
  if (!file)
    throw new Error(
      "Usage: node validate.mjs program.nomi-ui.json [events.json]",
    );
  const program = parseInteractiveProgram(await readBounded(file));
  let state = hydrateStudyState(program);
  const events = eventsFile ? JSON.parse(await readBounded(eventsFile)) : [];
  if (!Array.isArray(events) || events.length > 128)
    throw new Error("Expected at most 128 events.");
  function inspect() {
    const evaluated = evaluateProgram(program, state);
    const derived = Object.fromEntries(
      Object.keys(program.derived).map((id) => [id, evaluated.derived(id)]),
    );
    const nodes = program.nodes.map((node) => {
      const props = evaluated.props(node.id);
      validateResolvedProps(node.component, props, node.version);
      return { id: node.id, component: node.component, props };
    });
    return { state, derived, nodes };
  }
  let result = inspect();
  for (const event of events) {
    if (!event || typeof event !== "object") throw new Error("Invalid event.");
    if (
      typeof event.set === "string" &&
      Object.keys(event).every((k) => ["set", "value"].includes(k))
    )
      state = setStudyValue(program, state, event.set, event.value);
    else if (
      typeof event.action === "string" &&
      Object.keys(event).length === 1
    )
      state = runStudyAction(program, state, event.action);
    else throw new Error("Expected {set,value} or {action}.");
    result = inspect();
  }
  console.log(
    JSON.stringify(
      {
        valid: true,
        profile: program.profile,
        id: program.id,
        events: events.length,
        ...(eventsFile ? result : { nodes: program.nodes.length }),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ valid: false, error: error.message }));
  process.exitCode = 1;
}
