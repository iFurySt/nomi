import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const id = "virtual:nomi-note-runtime";
let cached;
export async function noteRuntimeSource() {
  cached ??= build({
    absWorkingDir: root,
    entryPoints: ["packages/ui/src/writing/article-runtime.tsx"],
    outfile: "article-runtime.js",
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@nomi/core": join(root, "packages/core/src/index.ts") },
    loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  }).then((result) => {
    const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
    const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
    return `export default ${JSON.stringify({ js, css })}`;
  });
  return cached;
}
export function noteRuntimeVitePlugin() {
  return {
    name: "nomi-note-runtime",
    resolveId(source) {
      if (source === id) return "\0" + id;
    },
    load(source) {
      if (source === "\0" + id) return noteRuntimeSource();
    },
    handleHotUpdate(ctx) {
      if (
        ctx.file.includes("/writing/article-runtime") ||
        ctx.file.includes("/interactive/")
      )
        cached = undefined;
    },
  };
}
export function noteRuntimeEsbuildPlugin() {
  return {
    name: "nomi-note-runtime",
    setup(build) {
      build.onResolve({ filter: /^virtual:nomi-note-runtime$/ }, () => ({
        path: id,
        namespace: "note-runtime",
      }));
      build.onLoad({ filter: /.*/, namespace: "note-runtime" }, async () => ({
        contents: await noteRuntimeSource(),
        loader: "js",
      }));
    },
  };
}
