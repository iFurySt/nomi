import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
const require = createRequire(
  new URL("../packages/ui/package.json", import.meta.url),
);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
async function files() {
  const assets = [
    ["pdf.worker.min.mjs", join(root, "build/pdf.worker.min.mjs")],
  ];
  for (const folder of ["cmaps", "standard_fonts"])
    for (const entry of await readdir(join(root, folder), {
      withFileTypes: true,
    }))
      if (entry.isFile())
        assets.push([
          `${folder}/${entry.name}`,
          join(root, folder, entry.name),
        ]);
  return assets;
}
export async function copyPdfAssets(output) {
  await mkdir(join(output, "pdfjs"), { recursive: true });
  await cp(
    join(root, "build/pdf.worker.min.mjs"),
    join(output, "pdfjs/pdf.worker.min.mjs"),
  );
  for (const folder of ["cmaps", "standard_fonts"])
    await cp(join(root, folder), join(output, "pdfjs", folder), {
      recursive: true,
    });
}
export function pdfAssetsVitePlugin() {
  return {
    name: "nomi-pdf-assets",
    async generateBundle() {
      for (const [file, path] of await files())
        this.emitFile({
          type: "asset",
          fileName: `pdfjs/${file}`,
          source: await readFile(path),
        });
    },
    async configureServer(server) {
      const paths = new Map(
        (await files()).map(([file, path]) => [`/pdfjs/${file}`, path]),
      );
      server.middlewares.use(async (req, res, next) => {
        const path = paths.get(req.url?.split("?")[0]);
        if (!path) return next();
        try {
          res.setHeader(
            "Content-Type",
            path.endsWith(".mjs")
              ? "text/javascript"
              : "application/octet-stream",
          );
          res.end(await readFile(path));
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}
