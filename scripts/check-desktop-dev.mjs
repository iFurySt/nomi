import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { desktopRuntime } from "./desktop-runtime.mjs";

// Generated bundle contract: never become the production file/URL handler.
if (process.platform !== "darwin") {
  console.log("macOS development bundle check skipped on this platform.");
} else {
  const runtime = desktopRuntime();
  const contents = dirname(dirname(runtime));
  const plist = JSON.parse(
    execFileSync(
      "plutil",
      ["-convert", "json", "-o", "-", join(contents, "Info.plist")],
      { encoding: "utf8" },
    ),
  );
  assert.equal(plist.CFBundleIdentifier, "com.ifuryst.nomi.dev");
  assert.equal(plist.CFBundleName, "Nomi(Dev)");
  assert.equal(plist.CFBundleDisplayName, "Nomi(Dev)");
  assert.deepEqual(
    plist.CFBundleURLTypes.flatMap((t) => t.CFBundleURLSchemes),
    ["nomi-dev"],
  );
  assert.equal(plist.CFBundleDocumentTypes, undefined);
  assert.equal(plist.UTExportedTypeDeclarations, undefined);
  // Exercise the app's own bootstrap, as Finder does, without launch-script flags.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NOMI_DEV_APP;
  delete env.NOMI_DEV_URL;
  const result = spawnSync(runtime, ["--smoke"], {
    env,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /desktop smoke passed/);
  console.log(
    "Dev app identity, isolated associations and direct launch passed.",
  );
}
