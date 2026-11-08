// Isolated renderer fixture: never reads real documents or installs an update.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import type { UpdateStatus } from "@nomi/core";
import "../../packages/ui/src/styles.css";
let state: UpdateStatus = {
  version: "0.1.0",
  available: true,
  phase: "available",
  nextVersion: "0.2.0",
  automatic: true,
  canCheck: false,
};
const actions: string[] = [];
Object.assign(window, {
  updateFixture: {
    actions,
    set: (patch: Partial<UpdateStatus>) => {
      state = {
        ...state,
        progress: undefined,
        error: undefined,
        cancellable: false,
        ...patch,
      };
    },
    get: () => state,
  },
});
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "desktop",
    version: "0.1.0",
    platform: "darwin",
  }),
  requestUpdates: async (method, value) => {
    if (method !== "status") actions.push(method);
    if (method === "download")
      state = {
        ...state,
        phase: "downloading",
        progress: 0.42,
        cancellable: true,
      };
    if (method === "install")
      state = { ...state, phase: "installing", error: undefined };
    if (method === "cancel")
      state = { ...state, phase: "idle", cancellable: false, canCheck: true };
    if (method === "check")
      state = {
        ...state,
        phase: "up-to-date",
        error: undefined,
        canCheck: true,
      };
    if (method === "automatic") state = { ...state, automatic: value };
    return { ...state };
  },
};
location.hash = "/settings/general";
createRoot(document.getElementById("root")!).render(<App />);
