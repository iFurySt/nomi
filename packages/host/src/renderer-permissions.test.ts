import { describe, expect, it } from "vitest";
import { allowsClipboardWrite } from "./renderer-permissions";
describe("renderer clipboard permission", () => {
  const expectedUrl = "file:///nomi/web/dist/index.html";
  const trusted = {
    expectedUrl,
    mainFrameUrl: expectedUrl + "#/notes",
    requestingUrl: expectedUrl + "#/notes",
    isMainFrame: true,
  };
  it("allows only sanitized writing by the trusted top document", () => {
    expect(allowsClipboardWrite("clipboard-sanitized-write", trusted)).toBe(
      true,
    );
    for (const permission of [
      "clipboard-read",
      "deprecated-sync-clipboard-read",
      "media",
      "notifications",
    ])
      expect(allowsClipboardWrite(permission, trusted)).toBe(false);
    expect(
      allowsClipboardWrite("clipboard-sanitized-write", {
        ...trusted,
        isMainFrame: false,
      }),
    ).toBe(false);
    expect(
      allowsClipboardWrite("clipboard-sanitized-write", {
        ...trusted,
        mainFrameUrl: "https://other.test/",
      }),
    ).toBe(false);
    expect(
      allowsClipboardWrite("clipboard-sanitized-write", {
        ...trusted,
        requestingUrl: "file:///other/index.html",
      }),
    ).toBe(false);
  });
  it("accepts only the configured development entry", () => {
    expect(
      allowsClipboardWrite("clipboard-sanitized-write", {
        expectedUrl: "http://127.0.0.1:5173",
        mainFrameUrl: "http://127.0.0.1:5173/#/notes",
        isMainFrame: true,
      }),
    ).toBe(true);
    expect(
      allowsClipboardWrite("clipboard-sanitized-write", {
        expectedUrl,
        mainFrameUrl: "http://127.0.0.1:5173/#/notes",
        isMainFrame: true,
      }),
    ).toBe(false);
  });
});
