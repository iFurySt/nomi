import { describe, expect, it } from "vitest";
import { initialWorkspaceRoute } from "./workspace-route";

describe("workspace startup route", () => {
  it("opens Notes on first launch", () => {
    expect(initialWorkspaceRoute("", null)).toBe("#/notes");
  });
  it("restores the last note and its canvas", () => {
    const route = "#/notes?note=note.one&canvas=block.two";
    expect(initialWorkspaceRoute("", route)).toBe(route);
    expect(initialWorkspaceRoute("", "#/canvas")).toBe("#/canvas");
    expect(initialWorkspaceRoute("", "#/settings/appearance")).toBe(
      "#/settings/appearance",
    );
  });
  it("honors explicit links and rejects stale pages / external URLs", () => {
    expect(initialWorkspaceRoute("#/notes?note=other", "#/canvas")).toBe(
      "#/notes?note=other",
    );
    expect(initialWorkspaceRoute("", "#/health")).toBe("#/notes");
    expect(initialWorkspaceRoute("", "https://example.com")).toBe("#/notes");
  });
});
