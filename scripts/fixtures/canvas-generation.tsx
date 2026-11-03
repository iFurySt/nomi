// Isolated AI fixture: no credentials, network requests or real documents.
import React from "react";
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
let mode = "diagram";
Object.assign(window, { aiFixture: { mode: (v: string) => (mode = v) } });
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
    await new Promise((r) => setTimeout(r, output === "slow" ? 1000 : 50));
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
    const commands = [
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
    ];
    return {
      ok: true,
      value: {
        text: output === "invalid" ? "bad json" : JSON.stringify({ commands }),
      },
    };
  }
  return { ok: false, error: "Unsupported fixture request" };
};
window.nomiDesktop.onChatGPTDelta = () => () => {};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
