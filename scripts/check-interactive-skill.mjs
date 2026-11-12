import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const skill = path.join(root, "skills/nomi-interactive");
const scratch = await mkdtemp(path.join(tmpdir(), "nomi-skill-check-"));
const validator = path.join(skill, "scripts/validate.mjs");
function run(file, eventsFile, valid = true) {
  const r = spawnSync(
    process.execPath,
    [validator, file, ...(eventsFile ? [eventsFile] : [])],
    { encoding: "utf8", cwd: scratch },
  );
  assert.equal(r.status, valid ? 0 : 1, r.stderr);
  const result = JSON.parse(valid ? r.stdout : r.stderr);
  assert.equal(result.valid, valid);
  return result;
}
try {
  for (const name of ["bpe-compact", "wave", "temperature"])
    run(path.join(skill, `assets/${name}.nomi-ui.json`));
  const file = path.join(skill, "assets/bpe-compact.nomi-ui.json");
  const eventsFile = path.join(scratch, "events.json");
  const base = [{ set: "corpus", value: "ab ab ac" }, { action: "restart" }];
  async function trace(events) {
    await writeFile(eventsFile, JSON.stringify(events));
    return run(file, eventsFile);
  }
  let r = await trace([...base, { action: "next" }]);
  assert.equal(r.derived.training.initialTokens, 9);
  assert.equal(r.derived.training.tokenCount, 7);
  assert.deepEqual(r.derived.training.merges, [[1, "a", "b", "ab", 2]]);
  r = await trace([
    ...base,
    ...Array.from({ length: 8 }, () => ({ action: "next" })),
  ]);
  assert.equal(r.derived.training.step, 4);
  assert.equal(r.derived.training.tokenCount, 3);
  assert.equal(r.derived.training.learnedVocabulary.length, 8);
  r = await trace([...base, { action: "next" }, { action: "previous" }]);
  assert.equal(r.derived.training.step, 0);
  r = await trace([...base, { action: "next" }, { action: "restart" }]);
  assert.equal(r.state.corpus, "ab ab ac");
  assert.equal(r.derived.training.step, 0);
  r = await trace([{ set: "corpus", value: "" }, { action: "restart" }]);
  assert.equal(r.derived.training.tokenCount, 0);
  r = await trace([
    { set: "corpus", value: "你好 你好" },
    { action: "restart" },
    { action: "next" },
  ]);
  assert.equal(r.derived.training.tokenCount, 4);
  const bad = JSON.parse(await readFile(file, "utf8"));
  bad.nodes[0].props.html = "<script>alert(1)</script>";
  const badFile = path.join(scratch, "unsupported.json");
  await writeFile(badFile, JSON.stringify(bad));
  run(badFile, undefined, false);
  await writeFile(eventsFile, JSON.stringify([{ set: "step", value: 1000 }]));
  run(file, eventsFile, false);
  console.log(
    "Skill examples, BPE traces, Unicode/empty input and rejected capabilities passed.",
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
