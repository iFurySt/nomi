import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicFile, directory } from "./document-files";
export async function startAutomationServer(
  connectionFile: string,
  call: (name: string, args: unknown) => Promise<unknown>,
  readOnly = false,
) {
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const auth = req.headers.authorization ?? "",
      expected = `Bearer ${token}`;
    if (
      req.headers.origin ||
      req.method !== "POST" ||
      req.url !== "/call" ||
      req.headers["content-type"] !== "application/json" ||
      Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
    ) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: "Access denied" }));
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 3 * 1024 * 1024) throw Error("REQUEST_TOO_LARGE");
        chunks.push(Buffer.from(chunk));
      }
      const input = JSON.parse(Buffer.concat(chunks).toString());
      if (!input || typeof input.name !== "string")
        throw Error("INVALID_REQUEST");
      const value = await call(input.name, input.arguments ?? {});
      res.end(JSON.stringify({ ok: true, value }));
    } catch (e) {
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : "Request failed",
        }),
      );
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("MCP listener unavailable");
  try {
    await mkdir(dirname(connectionFile), { recursive: true, mode: 0o700 });
    await directory(dirname(connectionFile));
    await atomicFile(
      connectionFile,
      JSON.stringify({ version: 1, port: address.port, token, readOnly }),
    );
  } catch (e) {
    server.close();
    throw e;
  }
  return {
    port: address.port,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await rm(connectionFile, { force: true });
    },
  };
}
