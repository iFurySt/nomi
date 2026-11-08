// Isolated AI fixture: no credentials, network requests or real documents.
import React from "react";
import { createCanvasRepository } from "@nomi/platform";
import { temperatureProgram } from "@nomi/core";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import "../../packages/ui/src/styles.css";
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "desktop",
    version: "0.1.2",
    platform: "darwin",
  }),
};
let mode = "note";
let lastRequest: unknown;
let requests = 0;
const listeners = new Set<(e: any) => void>();
Object.assign(window, {
  aiFixture: {
    repository: createCanvasRepository,
    lastRequest: () => lastRequest,
    mode: (v: string) => (mode = v),
    requests: () => requests,
  },
});
window.nomiDesktop.requestChatGPT = async (method, params: any) => {
  if (method === "status")
    return {
      ok: true,
      value: {
        activeProfileId: "test-ai",
        profiles: [
          {
            id: "test-ai",
            label: "Test account",
            connected: true,
            sharing: true,
          },
        ],
        welcomeSeen: true,
      },
    };
  if (method === "models")
    return {
      ok: true,
      value: [{ slug: "test-model", displayName: "Test model" }],
    };
  if (method === "cancelResponse") return { ok: true, value: null };
  if (method === "respond") {
    const output = mode;
    requests++;
    lastRequest = params;
    if (output === "unsupported")
      return {
        ok: true,
        value: { text: '{"error":"unsupported_interaction"}' },
      };
    const block = (id: string, x: number) => ({
      type: "add_block",
      block: { id, type: "shape", shape: "rectangle", text: id, tone: "blue" },
      placement: {
        id: "p" + id,
        content: id,
        x,
        y: 0,
        width: 200,
        height: 100,
      },
    });
    const commands =
      output === "diagram"
        ? [
            block("Input", 0),
            block("Output", 350),
            {
              type: "connect",
              connector: {
                id: "line",
                from: { placement: "pInput", side: "e" },
                to: { placement: "pOutput", side: "w" },
                routing: "rounded",
                style: "solid",
                startArrow: false,
                endArrow: true,
                label: "",
              },
            },
          ]
        : [
            {
              type: "add_block",
              block: {
                id: "explanation",
                type: "markdown",
                source:
                  params.messages.length > 1
                    ? "## Revised explanation\n\nAn adjusted example."
                    : "## Generated explanation\n\nA useful example.",
              },
              placement: {
                id: "p-explanation",
                content: "explanation",
                x: 0,
                y: 0,
                width: 500,
                height: 160,
              },
            },
            {
              type: "add_block",
              block: {
                id: "experiment",
                type: "interactive",
                program: temperatureProgram,
              },
              placement: {
                id: "p-experiment",
                content: "experiment",
                x: 0,
                y: 220,
                width: 500,
                height: 600,
              },
            },
          ];
    const emit = (text: string) =>
      listeners.forEach((fn) => fn({ requestId: params.requestId, text }));
    emit('{"commands":[');
    for (let i = 0; i < commands.length; i++) {
      await new Promise((r) => setTimeout(r, output === "slow" ? 650 : 300));
      const encoded = (i ? "," : "") + JSON.stringify(commands[i]);
      // Split inside strings/objects, as a real transport does.
      for (let j = 0; j < encoded.length; j += 37)
        emit(encoded.slice(j, j + 37));
    }
    emit("]}");
    await new Promise((r) => setTimeout(r, 450));
    return {
      ok: true,
      value: {
        text: output === "invalid" ? "bad json" : JSON.stringify({ commands }),
      },
    };
  }
  return { ok: false, error: "Unsupported fixture request" };
};
window.nomiDesktop.onChatGPTDelta = (fn) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
