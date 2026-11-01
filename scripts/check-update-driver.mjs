import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
if (process.platform !== "darwin")
  throw Error("Sparkle callback test requires macOS.");
const framework = resolve(".artifacts/sparkle");
const output = resolve(".artifacts/update-driver");
mkdirSync(output, { recursive: true });
execFileSync(
  "xcrun",
  [
    "clang++",
    "-std=c++17",
    "-fobjc-arc",
    "-mmacosx-version-min=13.0",
    "-F" + framework,
    "-framework",
    "Cocoa",
    "-framework",
    "Sparkle",
    "-Wl,-rpath," + framework,
    "apps/desktop/native/update-driver.mm",
    "apps/desktop/native/update-driver-test.mm",
    "-o",
    output + "/check",
  ],
  { stdio: "inherit" },
);
execFileSync(output + "/check", [], { stdio: "inherit" });
