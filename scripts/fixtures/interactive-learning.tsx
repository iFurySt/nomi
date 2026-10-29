// Actual App + synthetic repositories. No credentials, inference, or remote data.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../packages/ui/src/App";
import { emptyResearch } from "@nomi/core";
import "../../packages/ui/src/styles.css";
const fixture = { requests: 0, failWrites: false };
Object.assign(window, { learningFixture: fixture });
window.fetch = async () => {
  fixture.requests++;
  throw Error("Network disabled in learning fixture.");
};
window.nomiDesktop = {
  getRuntimeInfo: async () => ({
    kind: "desktop",
    version: "fixture",
    platform: "darwin",
  }),
  requestData: async () => {
    throw Error("No data bridge.");
  },
};
const original = Storage.prototype.setItem;
Storage.prototype.setItem = function (key: string, value: string) {
  if (fixture.failWrites && key.startsWith("nomi.learning."))
    throw Error("Synthetic storage quota");
  original.call(this, key, value);
};
if (!location.hash) location.hash = "/learn";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App
      directory={{
        search: async (query) => ({
          scope: "candidates",
          snapshotId: "fixture",
          offset: query.offset,
          total: 0,
          items: [],
        }),
        get: async () => ({ snapshotId: "fixture", item: null }),
      }}
      logos={{ get: async () => null }}
      fundLogos={{ get: async () => null }}
      stockResearch={{ get: async (symbol) => emptyResearch(symbol) }}
    />
  </React.StrictMode>,
);
