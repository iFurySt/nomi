// Keep fixture bundles aligned with the renderer's local image and KaTeX fonts.
export const uiFixtureAssetLoaders = {
  ".png": "file",
  ".svg": "file",
  ".woff2": "file",
  ".woff": "file",
  ".ttf": "file",
};

// The full App includes the offline article exporter, even in unrelated routes.
import { build as esbuild } from "esbuild";
import { noteRuntimeEsbuildPlugin } from "./note-export-runtime.mjs";
import { copyPdfAssets } from "./pdf-assets.mjs";
import { dirname } from "node:path";
export function build(options) {
  return esbuild({
    ...options,
    plugins: [
      ...(options.plugins ?? []),
      noteRuntimeEsbuildPlugin(),
      {
        name: "nomi-pdf-fixture-assets",
        setup(build) {
          let used = false;
          build.onResolve({ filter: /^pdfjs-dist$/ }, () => {
            used = true;
          });
          build.onEnd(async (result) => {
            if (used && !result.errors.length && options.outfile)
              await copyPdfAssets(dirname(options.outfile));
          });
        },
      },
    ],
  });
}
