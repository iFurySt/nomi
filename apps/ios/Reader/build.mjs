import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
await build({
  entryPoints: [path("./reader.jsx")],
  outfile: process.argv[2],
  bundle: true,
  minify: true,
  jsx: "automatic",
  nodePaths: [path("../../../packages/ui/node_modules")],
  define: { "process.env.NODE_ENV": '"production"' },
  target: "safari18",
});
