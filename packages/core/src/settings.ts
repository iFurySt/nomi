export const settingsSections = [
  "general",
  "appearance",
  "chatgpt",
  "mcp",
] as const;
export type SettingsSection = (typeof settingsSections)[number];
export function parseSettingsSection(hash: string): SettingsSection {
  const section = hash
    .replace(/^#\/?/, "")
    .split("?")[0]
    ?.split("/")[1] as SettingsSection;
  return settingsSections.includes(section) ? section : "general";
}
