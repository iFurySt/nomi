import { describe, expect, it } from "vitest";
import { workspaceShortcut } from "./workspace-shortcuts";
const key = (value: string, extras: Partial<KeyboardEvent> = {}) => ({
  key: value,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...extras,
});
describe("workspace shortcuts", () => {
  it("matches navigation and utility commands for Mac and Control keyboards", () => {
    for (const [value, action] of [
      ["[", "back"],
      ["]", "forward"],
      ["b", "sidebar"],
      [",", "settings"],
      ["k", "search"],
      ["/", "help"],
    ]) {
      expect(workspaceShortcut(key(value), false)).toBe(action);
      expect(
        workspaceShortcut(key(value, { metaKey: false, ctrlKey: true }), true),
      ).toBe(action);
    }
  });
  it("does not intercept removed Chat shortcuts", () => {
    expect(workspaceShortcut(key("n"), false)).toBeUndefined();
    expect(workspaceShortcut(key("n"), true)).toBeUndefined();
  });
  it("ignores typing, composition and additional modifiers", () => {
    for (const extras of [
      { metaKey: false },
      { shiftKey: true },
      { altKey: true },
      { ctrlKey: true },
      { isComposing: true },
    ])
      expect(workspaceShortcut(key("b", extras), true)).toBeUndefined();
    expect(workspaceShortcut(key("w"), true)).toBeUndefined();
  });
});
