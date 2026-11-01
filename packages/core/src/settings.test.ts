import { it, expect } from "vitest";
import { parseSettingsSection } from "./settings";
it("keeps valid settings deep links and defaults unknown categories", () => {
  expect(parseSettingsSection("#/settings/sync")).toBe("general");
  expect(parseSettingsSection("#/settings/sources?x=1")).toBe("general");
  expect(parseSettingsSection("#/settings")).toBe("general");
  expect(parseSettingsSection("#/settings/general")).toBe("general");
  expect(parseSettingsSection("#/settings/missing")).toBe("general");
});
