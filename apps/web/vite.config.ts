import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { noteRuntimeVitePlugin } from "../../scripts/note-export-runtime.mjs";
import { pdfAssetsVitePlugin } from "../../scripts/pdf-assets.mjs";

export default defineConfig(({ command }) => ({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,p8,p12,mobileprovision}",
        "**/.apple/**",
        "**/.harness/**",
        "**/.nomi/**",
        "**/.git/**",
        "**/nomi-vault.*",
        "**/chatgpt/**",
        "**/*.sqlite*",
        "**/.artifacts/**",
      ],
    },
  },
  preview: { host: "127.0.0.1" },
  plugins: [
    noteRuntimeVitePlugin(),
    pdfAssetsVitePlugin(),
    react(),
    tailwind(),
    {
      name: "nomi-content-security-policy",
      transformIndexHtml(html) {
        const policy = [
          "default-src 'self'",
          command === "serve"
            ? "script-src 'self' 'unsafe-inline'"
            : "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "worker-src 'self' blob:",
          "font-src 'self' data: blob:",
          command === "serve"
            ? "connect-src 'self' ws://127.0.0.1:5173"
            : "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-src 'none'",
        ].join("; ");
        return html.replace("__NOMI_CSP__", policy);
      },
    },
  ],
}));
