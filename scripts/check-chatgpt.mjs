import { uiFixtureAssetLoaders } from "./ui-fixture-assets.mjs";
import { build } from "./ui-fixture-assets.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const reports = join(root, ".artifacts/chatgpt");
await mkdir(reports, { recursive: true });
const output = await mkdtemp(join(reports, "run-"));
await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/chatgpt.tsx"],
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
  '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>',
);
async function checks() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (check) => {
    for (let i = 0; i < 150; i++) {
      if (check()) return;
      await wait(20);
    }
    throw Error("Chat check timed out: " + check.toString());
  };
  const saved = () =>
    JSON.parse(localStorage.getItem("nomi.workspace.v1"))?.conversations[0]
      ?.messages ?? [];
  const composer = () =>
    document.querySelector('[aria-label="Research question"]');
  const send = () => document.querySelector('[aria-label="Send message"]');
  const enter = async (text) => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set.call(composer(), text);
    composer().dispatchEvent(new Event("input", { bubbles: true }));
    await until(() => !send().disabled);
    send().click();
  };
  await until(
    () => !!document.querySelector('[aria-label="Chat model"]') && composer(),
  );
  if (
    document.querySelector(".stock-sidebar") ||
    !document.querySelector(".chat-sidebar")
  )
    throw Error("Chat must have a conversation sidebar");
  const effort = document.querySelector('[aria-label="Reasoning effort"]');
  effort.click();
  await until(() => !!document.querySelector('[role="listbox"]'));
  [...document.querySelectorAll('[role="option"]')]
    .find((option) => option.textContent === "High")
    .click();
  await until(() => !document.querySelector('[role="listbox"]'));
  await wait(30);
  if (
    document.querySelector('[aria-label="Search the web"]') ||
    document
      .querySelector(".research-composer")
      .textContent.includes("ChatGPT plan")
  )
    throw Error("Composer still exposes manual Search or plan labels");
  const initialComposer = composer();
  await enter("Test a completed reply.");
  await until(
    () =>
      saved().length === 2 &&
      !document.querySelector('[aria-label="Stop response"]'),
  );
  if (
    saved()[1].source !== "chatgpt" ||
    !document
      .querySelector(".message-assistant")
      .textContent.includes("Synthetic streamed reply.")
  )
    throw Error("Completed reply provenance missing");
  if (
    !saved()[1].details?.citations.length ||
    !document.querySelector(".chat-citation") ||
    !document.querySelector(".chat-activity") ||
    !document.querySelector('[aria-label="Copy code"]') ||
    !document.querySelector(".message-content table")
  )
    throw Error(
      "Search activity/citations/Markdown were not rendered and persisted",
    );
  if (!window.chatFixture.requests[0].webSearch)
    throw Error("Automatic web search was not made available");
  const viewport = document
    .querySelector(".conversation")
    .getBoundingClientRect();
  const panel = document.querySelector(".main-shell").getBoundingClientRect();
  if (Math.abs(viewport.right - panel.right) > 2)
    throw Error("Scrollbar is still inside the text column");
  if (
    document.querySelector(".research-composer").getBoundingClientRect()
      .height > 150
  )
    throw Error("Composer is not compact");
  document.querySelector(".chat-activity summary").click();
  if (!document.querySelector(".chat-activity[open]"))
    throw Error("Tool activity cannot expand");
  if (composer() !== initialComposer)
    throw Error("Sending remounted the composer");
  await enter("What did I just ask?");
  await until(() => saved().length === 4);
  if (
    window.chatFixture.requests[1].messages.length !== 3 ||
    window.chatFixture.requests[1].effort !== "high" ||
    !window.chatFixture.requests[1].conversationId
  )
    throw Error("Multi-turn context or effort missing");
  window.chatFixture.failure = true;
  await enter("Test an interrupted reply.");
  await until(() => !!document.querySelector(".chat-error .button"));
  if (saved().length !== 5 || saved().at(-1).role !== "user")
    throw Error("Failed reply was saved as complete");
  window.chatFixture.failure = false;
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent === "Retry reply")
    .click();
  await until(() => saved().length === 6);
  window.chatFixture.delay = 250;
  await enter("Test cancellation.");
  await until(() => !!document.querySelector('[aria-label="Stop response"]'));
  document.querySelector('[aria-label="Stop response"]').click();
  await wait(650);
  if (saved().length !== 7 || !window.chatFixture.cancelled)
    throw Error("Cancelled reply was saved as complete");
  window.chatFixture.agentMode = true;
  window.chatFixture.delay = 20;
  await enter("Test agent events.");
  await until(() => !!document.querySelector(".agent-prompt"));
  const clickText = (text) =>
    [...document.querySelectorAll(".agent-prompt button")]
      .find((b) => b.textContent === text)
      .click();
  clickText("Allow once");
  await until(
    () => !!document.querySelector('.agent-prompt input[type="radio"]'),
  );
  document.querySelector('.agent-prompt input[type="radio"]').click();
  await wait(30);
  clickText("Continue");
  await until(() =>
    document
      .querySelector(".agent-prompt")
      ?.textContent.includes("network access"),
  );
  clickText("Decline");
  await until(() => saved().at(-1)?.details?.items?.length === 11);
  if (
    document.querySelectorAll(".agent-step").length !== 9 ||
    !document.querySelector(".agent-step-failed") ||
    !document.querySelector(".agent-step-declined") ||
    document.querySelector(".agent-prompt")
  )
    throw Error("Agent event timeline or prompt lifecycle is incomplete");
  if (
    document.querySelectorAll(".agent-message").length !== 2 ||
    !document.querySelector(".agent-message table") ||
    !document.querySelector('.agent-message [aria-label="Copy code"]')
  )
    throw Error("Agent Markdown or message ordering failed");
  const work = document.querySelector(".agent-work");
  if (
    work.open ||
    !work.querySelector("summary").textContent.includes("Worked for 1s") ||
    !document
      .querySelector(".agent-timeline > .agent-message")
      .checkVisibility() ||
    work.querySelector(".agent-step").checkVisibility()
  )
    throw Error(
      "Work disclosure must start collapsed with the final answer visible",
    );
  work.querySelector("summary").click();
  if (!work.open || !work.querySelector(".agent-step").checkVisibility())
    throw Error("Work disclosure cannot reveal real tool activity");
  document.querySelector(".agent-step summary").click();
  if (!document.querySelector(".agent-step[open]"))
    throw Error("Agent event cannot expand");
  if (
    document.querySelector(".conversation-header button") ||
    getComputedStyle(document.querySelector(".chat-sidebar .new-chat-button"))
      .borderTopWidth !== "0px" ||
    !document.querySelector('[aria-label="New chat"]')
  )
    throw Error(
      "New chat navigation does not match the compact sidebar/toolbar layout",
    );
  const groupedTools = work.querySelector(".agent-activity");
  const groupedLabel = groupedTools.querySelector("summary");
  if (
    !groupedLabel.querySelector("svg") ||
    groupedLabel.textContent.includes("completed") ||
    !groupedLabel.textContent.includes("ran commands") ||
    !groupedLabel.textContent.includes("searched local stocks")
  )
    throw Error(
      "Consecutive tools are not summarized as a quiet icon/text row",
    );
  groupedLabel.click();
  if (
    !groupedTools
      .querySelector('[data-item-id="command"] pre')
      .checkVisibility() ||
    !groupedTools
      .querySelector(".agent-step-declined")
      .textContent.includes("Declined")
  )
    throw Error("Grouped activity lost tool details or exceptional states");
  const progressStyle = getComputedStyle(work.querySelector(".agent-message"));
  const finalStyle = getComputedStyle(
    document.querySelector(".agent-timeline > .agent-message"),
  );
  if (
    progressStyle.color !== finalStyle.color ||
    progressStyle.fontSize !== finalStyle.fontSize ||
    getComputedStyle(work.querySelector(".agent-step")).borderLeftWidth !==
      "0px"
  )
    throw Error(
      "Progress typography or tool styling does not match the reference",
    );
  groupedLabel.click();
  const originalMessage = document.querySelector(".message-assistant");
  const originalCode = originalMessage.querySelector("pre");
  const originalText = originalMessage.querySelector("p").firstChild;
  const scroller = document.querySelector(".conversation");
  window.chatFixture.burst = true;
  const beforeCommits = window.chatFixture.commits;
  await enter("Test high frequency stream continuity.");
  await until(() => !!document.querySelector('[data-item-id="burst"] pre'));
  const liveCode = document.querySelector('[data-item-id="burst"] pre');
  document
    .querySelector('[data-item-id="burst"] [aria-label="Wrap code"]')
    .click();
  composer().focus();
  scroller.scrollTop = 0;
  scroller.dispatchEvent(new Event("scroll"));
  const range = document.createRange();
  range.selectNodeContents(originalText);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  const selected = getSelection().toString();
  await wait(240);
  if (
    document.querySelector('[data-item-id="burst"] pre') !== liveCode ||
    !liveCode.classList.contains("wrap-code") ||
    document.querySelector(".message-assistant") !== originalMessage ||
    originalMessage.querySelector("pre") !== originalCode ||
    getSelection().toString() !== selected ||
    document.activeElement !== composer() ||
    scroller.scrollTop > 1
  )
    throw Error(
      "Streaming remounted content, lost selection/focus/code state or forced reader scrolling",
    );
  await until(() => saved().at(-1)?.details?.items?.[0]?.id === "burst");
  const streamCommits = window.chatFixture.commits - beforeCommits;
  if (streamCommits > 35)
    throw Error("Unbounded stream renders: " + streamCommits);
  getSelection().removeAllRanges();
  // Drop only the last synthetic stress-test pair for readable screenshots.
  const workspace = JSON.parse(localStorage.getItem("nomi.workspace.v1"));
  workspace.conversations[0].messages.splice(-2);
  localStorage.setItem("nomi.workspace.v1", JSON.stringify(workspace));
  location.hash = "/usage";
  await until(() => !!document.querySelector(".usage-metrics"));
  if (
    !document
      .querySelector(".usage-identity")
      .textContent.includes("test@example.invalid") ||
    !document.querySelector(".usage-table").textContent.includes("81") ||
    !document.querySelector(".usage-scope").textContent.includes("1 of 2")
  )
    throw Error("Usage profile or measured coverage missing");
  if (document.querySelector(".usage-shell .sidebar")?.textContent.trim())
    throw Error("Usage displays stocks");
  document.querySelector(".rail-profile").dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
  await until(() => !!document.querySelector(".workspace-menu-identity"));
  if (
    !document
      .querySelector(".workspace-menu-identity")
      .textContent.includes("test@example.invalid")
  )
    throw Error("Account email missing");
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  return {
    streamCommits,
    eventBurst: 1000,
    stableCodeSelectionFocusAndReaderScroll: true,
    workDisclosureAndFinalSeparation: true,
    groupedToolSummaryAndReferenceTypography: true,
    compactNewChatNavigation: true,
    agentEventsAndDecisions: true,
    searchActivityAndCitations: true,
    edgeScrollbarAndCompactComposer: true,
    multiTurnAndEffort: true,
    usageProfileAndCoverage: true,
    completedReplyPersists: true,
    failedReplyIsRetryable: true,
    cancelledReplyStaysProvisional: true,
    composerStable: true,
  };
}
function columnGeometry() {
  const transcript = document
    .querySelector(".chat-transcript")
    .getBoundingClientRect();
  const composer = document
    .querySelector(".research-composer")
    .getBoundingClientRect();
  const error = Math.max(
    Math.abs(transcript.left - composer.left),
    Math.abs(transcript.right - composer.right),
  );
  if (error > 1)
    throw Error(
      "Chat column mismatch: " +
        JSON.stringify({
          transcript: transcript.toJSON(),
          composer: composer.toJSON(),
        }),
    );
  return { left: transcript.left, right: transcript.right, error };
}
const main = `const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1360,height:1000,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});win.webContents.on('console-message',(event)=>{if(event.level==='error')console.error(event.message)});try{await win.loadFile(path.join(__dirname,'index.html'));const report=await win.webContents.executeJavaScript('('+${JSON.stringify(checks.toString())}+')()');fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify(report,null,2));await win.loadFile(path.join(__dirname,'index.html'));await new Promise(r=>setTimeout(r,250));await win.webContents.executeJavaScript("document.querySelector('.chat-sidebar nav button').click()");await new Promise(r=>setTimeout(r,150));report.desktopColumns=await win.webContents.executeJavaScript('('+${JSON.stringify(columnGeometry.toString())}+')()');fs.writeFileSync(path.join(__dirname,'chat-desktop.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.querySelector('.agent-work summary').click();document.querySelector('.agent-work').scrollIntoView({block:'start'})");fs.writeFileSync(path.join(__dirname,'chat-work-expanded.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.querySelector('.agent-work summary').click();document.querySelector('.conversation').scrollTop=document.querySelector('.conversation').scrollHeight");win.setSize(480,900);await new Promise(r=>setTimeout(r,250));report.narrowColumns=await win.webContents.executeJavaScript('('+${JSON.stringify(columnGeometry.toString())}+')()');fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(__dirname,'chat-mobile.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("location.hash='/usage'");await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(__dirname,'usage-mobile.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1360,1000);await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(__dirname,'usage-desktop.png'),(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify(report));app.exit(0)}catch(error){console.error(error);app.exit(1)}});setTimeout(()=>{console.error('ChatGPT UI check timed out');app.exit(1)},25000);`;
await writeFile(join(output, "main.cjs"), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require("electron"),
  [join(output, "main.cjs"), "--no-sandbox"],
  { cwd: root, stdio: "inherit", env },
);
const timeout = setTimeout(() => child.kill("SIGKILL"), 30000);
const exit = await new Promise((resolve) =>
  child.once("exit", (code) => resolve(code ?? 1)),
);
clearTimeout(timeout);
await rm(join(output, "profile"), { recursive: true, force: true });
if (exit === 0) {
  await copyFile(join(output, "report.json"), join(reports, "report.json"));
  for (const name of [
    "chat-desktop.png",
    "chat-work-expanded.png",
    "chat-mobile.png",
    "usage-mobile.png",
    "usage-desktop.png",
  ])
    await copyFile(join(output, name), join(reports, name));
  await rm(output, { recursive: true, force: true });
}
process.exitCode = exit;
