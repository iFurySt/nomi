import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, ".artifacts/interactive-native");
await mkdir(out, { recursive: true });
await build({
  entryPoints: [join(root, "packages/core/src/interactive/index.ts")],
  outfile: join(out, "core.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const {
  temperatureProgram: program,
  hydrateStudyState,
  evaluateProgram,
  setStudyValue,
  runStudyAction,
  softmax,
} = await import(pathToFileURL(join(out, "core.mjs")));
const fixtures = join(root, "docs/design-docs/interactive-learning-example");
const reference = JSON.parse(
  await readFile(join(fixtures, "reference-values.json"), "utf8"),
);
const snapshot = (state) => {
  const runtime = evaluateProgram(program, state);
  return {
    state,
    derived: Object.fromEntries(
      Object.keys(program.derived)
        .sort()
        .map((key) => [key, runtime.derived(key)]),
    ),
    nodes: program.nodes.map((node) => ({
      id: node.id,
      props: runtime.props(node.id),
    })),
  };
};
let state = hydrateStudyState(program);
const snapshots = [snapshot(state)];
for (const { event } of reference.eventTrace) {
  state =
    event.type === "set"
      ? setStudyValue(program, state, event.state, event.value)
      : runStudyAction(
          program,
          state,
          program.nodes.find((n) => n.id === event.node).on.activate,
        );
  snapshots.push(snapshot(state));
}
const expected = {
  snapshots,
  probabilities: reference.probabilityCases.map((c) =>
    softmax(c.logits, c.temperature),
  ),
  invalid: reference.invalidCases.map((c) => {
    try {
      softmax(c.logits, c.temperature);
      return false;
    } catch {
      return true;
    }
  }),
};
execFileSync(
  "swiftc",
  [
    join(root, "packages/interactive-native/Sources/ReferenceRuntime.swift"),
    join(root, "packages/interactive-native/Sources/main.swift"),
    "-o",
    join(out, "conformance"),
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);
const native = JSON.parse(
  execFileSync(
    join(out, "conformance"),
    [
      join(fixtures, "temperature-explorer.nomi-ui.json"),
      join(fixtures, "reference-values.json"),
    ],
    { maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
  ),
);
let numbers = 0;
function compare(a, b, path = "root") {
  if (typeof a === "number") {
    assert.equal(typeof b, "number", path);
    assert.ok(
      Math.abs(a - b) <= reference.absoluteTolerance,
      `${path}: ${a} != ${b}`,
    );
    numbers++;
    return;
  }
  if (a && typeof a === "object") {
    assert.equal(Array.isArray(a), Array.isArray(b), path);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path);
    for (const key of Object.keys(a)) compare(a[key], b[key], `${path}.${key}`);
    return;
  }
  assert.equal(b, a, path);
}
compare(expected, native);
assert.ok(native.invalid.every(Boolean));
console.log(
  `Swift / TypeScript conformance passed: ${snapshots.length} snapshots, ${numbers} numerical comparisons (tolerance ${reference.absoluteTolerance}).`,
);
