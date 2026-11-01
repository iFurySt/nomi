import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
/** Include notices for the locked workspace dependency set (including build tools).
 * This deliberately over-includes instead of guessing which tree-shaken fragments survive.
 * Never serialize pnpm's local installation paths into the distributed notices.
 */
export function writeDesktopLicenses(root, output) {
  const groups = JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  const sections = [];
  for (const packages of Object.values(groups))
    for (const item of packages) {
      const notices = [];
      for (const path of item.paths ?? [])
        for (const name of readdirSync(path)) {
          if (!/^(licen[cs]e|copying|notice)([.-]|$)/i.test(name)) continue;
          const file = join(path, name);
          if (statSync(file).isFile()) notices.push(readFileSync(file, "utf8"));
        }
      sections.push(
        [
          `${item.name} ${item.versions.join(", ")}`,
          `License: ${item.license}`,
          item.author
            ? `Author: ${typeof item.author === "string" ? item.author : JSON.stringify(item.author)}`
            : "",
          item.homepage ?? "",
          ...[...new Set(notices)],
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
  writeFileSync(
    output,
    "Nomi third-party dependency notices\n\n" +
      sections.join("\n\n" + "=".repeat(72) + "\n\n"),
  );
}
