// Synthetic accounts only; no OAuth requests, tokens, or real document access.
import React from "react";
import { createRoot } from "react-dom/client";
import { ChatGPTProvider } from "../../packages/ui/src/chatgpt-context";
import { ChatGPTSettings } from "../../packages/ui/src/pages/ChatGPTSettings";
import "../../packages/ui/src/styles.css";
let welcomeSeen = false;
let mode = "failure",
  connected = false;
let rejectSignIn: ((reason: Error) => void) | undefined;
Object.assign(window, {
  loginFixture: {
    mode: (v: string) => {
      mode = v;
    },
    connected: () => connected,
  },
});
window.nomiDesktop = {
  requestChatGPT: async (method) => {
    if (method === "status")
      return {
        ok: true,
        value: {
          welcomeSeen,
          activeProfileId: "fixture-account",
          profiles: [
            {
              id: "fixture-account",
              label: "Connection · 1",
              connected,
              sharing: connected,
              ...(connected
                ? { name: "Demo", email: "demo@example.invalid" }
                : {}),
            },
          ],
        },
      };
    if (method === "acknowledgeWelcome") {
      welcomeSeen = true;
      return { ok: true, value: null };
    }
    if (method === "models")
      return { ok: true, value: [{ slug: "test", displayName: "Test model" }] };
    if (method === "cancelSignIn") {
      rejectSignIn?.(Error("ChatGPT sign-in was cancelled or timed out."));
      return { ok: true, value: null };
    }
    if (method === "signIn") {
      if (mode === "slow")
        await new Promise<void>((_, no) => {
          rejectSignIn = no;
        });
      await new Promise((r) => setTimeout(r, 150));
      if (mode === "failure")
        return {
          ok: false,
          error:
            "ChatGPT connection failed. Try again or reconnect your account.",
        };
      connected = true;
      return { ok: true, value: null };
    }
    return { ok: true, value: null };
  },
};
createRoot(document.getElementById("root")!).render(
  <ChatGPTProvider>
    <main style={{ maxWidth: 760, margin: "60px auto", padding: "0 24px" }}>
      <h1 style={{ marginBottom: 40 }}>ChatGPT</h1>
      <ChatGPTSettings />
    </main>
  </ChatGPTProvider>,
);
