import { writeDesktopLicenses } from "./desktop-licenses.mjs";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  renameSync,
  lstatSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const config = JSON.parse(
  readFileSync(join(root, "apps/desktop/packaging/config.json"), "utf8"),
);
const version = JSON.parse(
  readFileSync(join(root, "apps/desktop/package.json"), "utf8"),
).version;
if (process.platform !== "darwin") throw Error("DMG packaging requires macOS.");
const arch = process.arch;
if (!["arm64", "x64"].includes(arch))
  throw Error("Unsupported release architecture.");
const unsigned = process.argv.includes("--unsigned");
const identity = process.env.NOMI_SIGN_IDENTITY;
if (!unsigned && !identity)
  throw Error("Set NOMI_SIGN_IDENTITY to a Developer ID Application identity.");
const output = join(root, ".artifacts/desktop-release", arch);
const app = join(output, "Nomi.app"),
  contents = join(app, "Contents");
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...options });
const cache = join(root, ".artifacts/sparkle");
mkdirSync(cache, { recursive: true });
const archive = join(cache, "Sparkle.tar.xz");
if (
  !existsSync(archive) ||
  createHash("sha256").update(readFileSync(archive)).digest("hex") !==
    config.sparkleSHA256
) {
  run("curl", [
    "--fail",
    "--location",
    "--retry",
    "3",
    `https://github.com/sparkle-project/Sparkle/releases/download/${config.sparkleVersion}/Sparkle-${config.sparkleVersion}.tar.xz`,
    "-o",
    archive,
  ]);
}
if (
  createHash("sha256").update(readFileSync(archive)).digest("hex") !==
  config.sparkleSHA256
)
  throw Error("Sparkle checksum mismatch.");
run("tar", ["-xf", archive, "-C", cache]);
mkdirSync(output, { recursive: true });
rmSync(app, { recursive: true, force: true });
const vendor = resolve(dirname(require("electron")), "../..");
run("ditto", [vendor, app]);
rmSync(join(contents, "Resources/default_app.asar"), { force: true });
const resources = join(contents, "Resources");
const electronDist = dirname(vendor);
cpSync(join(electronDist, "LICENSE"), join(resources, "LICENSE.electron"));
cpSync(
  join(electronDist, "LICENSES.chromium.html"),
  join(resources, "LICENSES.chromium.html"),
);
writeDesktopLicenses(root, join(resources, "THIRD_PARTY_LICENSES.txt"));
const entry = join(resources, "app");
mkdirSync(entry, { recursive: true });
writeFileSync(
  join(entry, "package.json"),
  JSON.stringify({
    name: "nomi",
    productName: "Nomi",
    version,
    main: "apps/desktop/dist/main.cjs",
  }),
);
const desktop = join(entry, "apps/desktop/dist");
mkdirSync(desktop, { recursive: true });
for (const file of ["main.cjs", "preload.cjs"])
  cpSync(join(root, "apps/desktop/dist", file), join(desktop, file));
cpSync(join(root, "apps/desktop/dist/brand"), join(desktop, "brand"), {
  recursive: true,
});
cpSync(join(root, "apps/web/dist"), join(entry, "apps/web/dist"), {
  recursive: true,
});
for (const file of ["LICENSE", "LICENSE.aifi", "NOTICE"])
  cpSync(join(root, file), join(resources, file));
run("ditto", [
  join(cache, "Sparkle.framework"),
  join(contents, "Frameworks/Sparkle.framework"),
]);
// N-API's C ABI is stable across Node/Electron versions; no V8 or Node C++ ABI is used.
const headers =
  process.env.NOMI_NODE_HEADERS ||
  join(dirname(dirname(process.execPath)), "include/node");
if (!existsSync(join(headers, "node_api.h")))
  throw Error("Node C API headers missing; set NOMI_NODE_HEADERS.");
run("xcrun", [
  "clang++",
  "-std=c++17",
  "-fobjc-arc",
  "-shared",
  "-undefined",
  "dynamic_lookup",
  "-DNAPI_VERSION=8",
  `-mmacosx-version-min=${config.minimumSystemVersion}`,
  "-arch",
  arch === "x64" ? "x86_64" : "arm64",
  "-I",
  headers,
  "-F",
  cache,
  "-framework",
  "Cocoa",
  "-framework",
  "Sparkle",
  "-Wl,-rpath,@loader_path/../Frameworks",
  join(root, "apps/desktop/native/sparkle.mm"),
  "-o",
  join(resources, "sparkle.node"),
]);
const iconset = join(output, "nomi.iconset");
mkdirSync(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512])
  for (const scale of [1, 2])
    run(
      "sips",
      [
        "-z",
        String(size * scale),
        String(size * scale),
        join(desktop, "brand/app-icon.png"),
        "--out",
        join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
      ],
      { stdio: "ignore" },
    );
run("iconutil", ["-c", "icns", iconset, "-o", join(resources, "nomi.icns")]);
cpSync(join(cache, "LICENSE"), join(resources, "LICENSE.sparkle"));
renameSync(join(contents, "MacOS/Electron"), join(contents, "MacOS/Nomi"));
const plist = join(contents, "Info.plist");
run("python3", [
  "-c",
  `
import plistlib,json,sys,pathlib
p=pathlib.Path(sys.argv[1]);c=json.loads(sys.argv[2]);v=sys.argv[3];arch=sys.argv[4]
d=plistlib.loads(p.read_bytes());d.update(CFBundleName='Nomi',CFBundleExecutable='Nomi',CFBundleDisplayName='Nomi',CFBundleIdentifier=c['bundleId'],CFBundleShortVersionString=v,CFBundleVersion=v,CFBundleIconFile='nomi.icns',LSApplicationCategoryType='public.app-category.productivity',LSMinimumSystemVersion=c['minimumSystemVersion'],SUFeedURL=c['feedBase']+'/appcast-'+arch+'.xml',SUPublicEDKey=c['sparklePublicKey'],SUEnableAutomaticChecks=True,SUAutomaticallyUpdate=False,SUAllowsAutomaticUpdates=False,SUShowReleaseNotes=False)
d['UTExportedTypeDeclarations']=[dict(UTTypeIdentifier='com.ifuryst.nomi.document',UTTypeDescription='Nomi Document',UTTypeConformsTo=['com.apple.package','public.composite-content'],UTTypeTagSpecification={'public.filename-extension':['nomi']})]
d['CFBundleDocumentTypes']=[dict(CFBundleTypeName='Nomi Document',CFBundleTypeRole='Editor',LSHandlerRank='Owner',LSTypeIsPackage=True,CFBundleTypeIconFile='nomi.icns',LSItemContentTypes=['com.ifuryst.nomi.document'])]
p.write_bytes(plistlib.dumps(d))
`,
  plist,
  JSON.stringify(config),
  version,
  arch,
]);
// Sign Mach-O code first, then nested bundles from the inside out. Never use --deep to sign.
const files = [],
  bundles = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name),
      stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      walk(path);
      if (/\.(app|framework|xpc)$/.test(name)) bundles.push(path);
    } else {
      const fd = readFileSync(path).subarray(0, 4).toString("hex");
      if (["cffaedfe", "cefaedfe", "cafebabe", "bebafeca"].includes(fd))
        files.push(path);
    }
  }
}
walk(contents);
const sign = (path) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      run(
        "codesign",
        [
          "--force",
          "--sign",
          unsigned ? "-" : identity,
          ...(unsigned ? [] : ["--timestamp", "--options", "runtime"]),
          ...(path.endsWith(".app") || path.includes("/MacOS/")
            ? [
                "--entitlements",
                join(root, "apps/desktop/packaging/entitlements.plist"),
              ]
            : []),
          path,
        ],
        { stdio: "pipe" },
      );
      return;
    } catch (error) {
      if (
        attempt === 2 ||
        !String(error.stderr).includes("timestamp service is not available")
      )
        throw error;
      console.log(
        "Apple timestamp service temporarily unavailable; retrying signature.",
      );
      execFileSync("sleep", ["2"]);
    }
  }
};
for (const file of files) sign(file);
for (const bundle of bundles) sign(bundle);
sign(app);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
async function notarize(file) {
  if (unsigned) return;
  const args = process.env.NOMI_NOTARY_PROFILE
    ? ["--keychain-profile", process.env.NOMI_NOTARY_PROFILE]
    : process.env.ASC_KEY_PATH &&
        process.env.ASC_KEY_ID &&
        process.env.ASC_ISSUER_ID
      ? [
          "--key",
          resolve(process.env.ASC_KEY_PATH),
          "--key-id",
          process.env.ASC_KEY_ID,
          "--issuer",
          process.env.ASC_ISSUER_ID,
        ]
      : null;
  if (!args)
    throw Error(
      "Notarization credentials missing. Use NOMI_NOTARY_PROFILE or ASC_KEY_PATH/ASC_KEY_ID/ASC_ISSUER_ID.",
    );
  const result = spawnSync(
    "xcrun",
    [
      "notarytool",
      "submit",
      file,
      ...args,
      "--wait",
      "--output-format",
      "json",
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw Error(
      "Notarization command failed; check the configured credential.",
    );
  }
  writeFileSync(
    join(output, `notary-${file.endsWith(".dmg") ? "dmg" : "app"}.json`),
    JSON.stringify(response, null, 2),
  );
  if (result.status !== 0 || response.status !== "Accepted")
    throw Error(
      `Notarization failed: ${response.status || "unknown"} (submission ${response.id || "unavailable"}).`,
    );
  console.log(`Notarization accepted: ${response.id}`);
}
if (!unsigned) {
  const zip = join(output, "Nomi-notarization.zip");
  rmSync(zip, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", app, zip]);
  await notarize(zip);
  run("xcrun", ["stapler", "staple", app]);
  rmSync(zip);
}
const stage = join(output, "dmg-stage");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage);
run("ditto", [app, join(stage, "Nomi.app")]);
run("ln", ["-s", "/Applications", join(stage, "Applications")]);
const name = `Nomi-${version}-mac-${arch}${unsigned ? "-unsigned" : ""}.dmg`,
  dmg = join(output, name);
rmSync(dmg, { force: true });
run("hdiutil", [
  "create",
  "-volname",
  "Nomi",
  "-srcfolder",
  stage,
  "-format",
  "UDZO",
  "-ov",
  dmg,
]);
if (!unsigned) {
  sign(dmg);
  await notarize(dmg);
  run("xcrun", ["stapler", "staple", dmg]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
}
rmSync(stage, { recursive: true });
rmSync(iconset, { recursive: true });
const sha = createHash("sha256").update(readFileSync(dmg)).digest("hex");
writeFileSync(join(output, name + ".sha256"), `${sha}  ${name}\n`);
if (!unsigned) {
  const signArgs = process.env.SPARKLE_PRIVATE_KEY
    ? ["--ed-key-file", "-"]
    : ["--account", config.sparkleKeyAccount];
  const signature = execFileSync(
    join(cache, "bin/sign_update"),
    [...signArgs, "-p", dmg],
    { encoding: "utf8", input: process.env.SPARKLE_PRIVATE_KEY },
  ).trim();
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Nomi macOS ${arch}</title><link>https://github.com/iFurySt/nomi</link><description>Nomi desktop updates</description><language>zh-CN</language><item><title>Nomi ${version}</title><pubDate>${new Date().toUTCString()}</pubDate><sparkle:version>${version}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><sparkle:minimumSystemVersion>${config.minimumSystemVersion}</sparkle:minimumSystemVersion><enclosure url="${config.downloadBase}/desktop-v${version}/${name}" length="${lstatSync(dmg).size}" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>\n`;
  const feed = join(output, `appcast-${arch}.xml`);
  writeFileSync(feed, xml);
  execFileSync(join(cache, "bin/sign_update"), [...signArgs, feed], {
    input: process.env.SPARKLE_PRIVATE_KEY,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
console.log(`Built ${dmg}`);
