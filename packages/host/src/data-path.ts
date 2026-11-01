import { join } from "node:path";
import { homedir } from "node:os";
export function defaultDataDir() {
  return (
    process.env.NOMI_DATA_DIR ||
    join(
      process.platform === "darwin"
        ? join(homedir(), "Library/Application Support")
        : process.platform === "win32"
          ? process.env.APPDATA || homedir()
          : process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
      "nomi/data",
    )
  );
}
