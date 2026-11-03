import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
/** A named local macOS runtime; keep the package-manager Electron bundle pristine. */
export function desktopRuntime() {
  const executable = require("electron");
  if (process.platform !== "darwin") return executable;
  const icon = join(
    root,
    "packages/ui/src/assets/brand/nomi-companion-v1/app-icon-macos-1024.png",
  );
  const version = require("electron/package.json").version;
  const identity = JSON.stringify({
    version,
    iconHash: createHash("sha256").update(readFileSync(icon)).digest("hex"),
    schema: 6,
    entryPath: join(root, "apps/desktop/dist/main.cjs"),
    applicationVersion: JSON.parse(
      readFileSync(join(root, "apps/desktop/package.json"), "utf8"),
    ).version,
  });
  const output = join(root, "apps/desktop/dist/Nomi.app");
  const stamp = join(dirname(output), "nomi-runtime.json");
  const target = join(output, "Contents/MacOS/Electron");
  if (
    existsSync(stamp) &&
    readFileSync(stamp, "utf8") === identity &&
    existsSync(target)
  )
    return target;
  const vendor = join(dirname(executable), "../..");
  mkdirSync(dirname(output), { recursive: true });
  // This fixed generated directory is owned exclusively by this launcher.
  rmSync(output, { recursive: true, force: true });
  cpSync(vendor, output, {
    recursive: true,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
  const entry = join(output, "Contents/Resources/app");
  mkdirSync(entry);
  const appPackage = JSON.parse(
    readFileSync(join(root, "apps/desktop/package.json"), "utf8"),
  );
  writeFileSync(
    join(entry, "package.json"),
    JSON.stringify({
      name: "nomi",
      productName: "Nomi",
      version: appPackage.version,
      main: "index.cjs",
    }),
  );
  writeFileSync(
    join(entry, "index.cjs"),
    `require(${JSON.stringify(join(root, "apps/desktop/dist/main.cjs"))});\n`,
  );
  const plist = join(output, "Contents/Info.plist");
  for (const [key, value] of Object.entries({
    CFBundleName: "Nomi",
    CFBundleDisplayName: "Nomi",
    CFBundleIdentifier: "com.ifuryst.nomi.local",
    CFBundleIconFile: "nomi.icns",
    LSApplicationCategoryType: "public.app-category.productivity",
  }))
    execFileSync("/usr/libexec/PlistBuddy", [
      "-c",
      `Set :${key} ${value}`,
      plist,
    ]);
  // Register a directory document package, not an executable application bundle.
  for (const key of [
    "UTExportedTypeDeclarations",
    "CFBundleDocumentTypes",
    "CFBundleURLTypes",
  ]) {
    try {
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, plist], {
        stdio: "pipe",
      });
    } catch {}
  }
  const declarations = [
    "Add :CFBundleURLTypes array",
    "Add :CFBundleURLTypes:0 dict",
    "Add :CFBundleURLTypes:0:CFBundleURLName string Nomi Local",
    "Add :CFBundleURLTypes:0:CFBundleURLSchemes array",
    "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string nomi-local",
    "Add :UTExportedTypeDeclarations array",
    "Add :UTExportedTypeDeclarations:0 dict",
    "Add :UTExportedTypeDeclarations:0:UTTypeIdentifier string com.ifuryst.nomi.document",
    "Add :UTExportedTypeDeclarations:0:UTTypeDescription string Nomi Document",
    "Add :UTExportedTypeDeclarations:0:UTTypeConformsTo array",
    "Add :UTExportedTypeDeclarations:0:UTTypeConformsTo:0 string com.apple.package",
    "Add :UTExportedTypeDeclarations:0:UTTypeConformsTo:1 string public.composite-content",
    "Add :UTExportedTypeDeclarations:0:UTTypeTagSpecification dict",
    "Add :UTExportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension array",
    "Add :UTExportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension:0 string nomi",
    "Add :CFBundleDocumentTypes array",
    "Add :CFBundleDocumentTypes:0 dict",
    "Add :CFBundleDocumentTypes:0:CFBundleTypeName string Nomi Document",
    "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Editor",
    "Add :CFBundleDocumentTypes:0:LSHandlerRank string Owner",
    "Add :CFBundleDocumentTypes:0:LSTypeIsPackage bool true",
    "Add :CFBundleDocumentTypes:0:CFBundleTypeIconFile string nomi.icns",
    "Add :CFBundleDocumentTypes:0:LSItemContentTypes array",
    "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string com.ifuryst.nomi.document",
  ];
  for (const command of declarations)
    execFileSync("/usr/libexec/PlistBuddy", ["-c", command, plist]);
  const iconset = join(root, "apps/desktop/dist/nomi.iconset");
  mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = size * scale;
      execFileSync(
        "/usr/bin/sips",
        [
          "-z",
          String(px),
          String(px),
          icon,
          "--out",
          join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
        ],
        { stdio: "ignore" },
      );
    }
  }
  execFileSync("/usr/bin/iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    join(output, "Contents/Resources/nomi.icns"),
  ]);
  rmSync(iconset, { recursive: true, force: true });
  // Ad-hoc signature for a local development runtime, not a distributable release.
  execFileSync(
    "/usr/bin/codesign",
    [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--preserve-metadata=entitlements,flags,runtime",
      output,
    ],
    { stdio: "pipe" },
  );
  writeFileSync(stamp, identity);
  return target;
}
