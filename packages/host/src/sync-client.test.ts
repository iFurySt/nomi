import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { SyncClient, syncServerURL } from "./sync-client";

describe("sync service base path", () => {
  it("normalizes root and API prefixes without weakening HTTPS or credential boundaries", () => {
    expect(syncServerURL("https://nomi.ifuryst.com/api/")).toBe(
      "https://nomi.ifuryst.com/api",
    );
    expect(syncServerURL("https://nomi.ifuryst.com")).toBe(
      "https://nomi.ifuryst.com",
    );
    expect(syncServerURL("http://127.0.0.1:8089/api")).toBe(
      "http://127.0.0.1:8089/api",
    );
    for (const url of [
      "http://nomi.ifuryst.com/api",
      "https://user:secret@example.com/api",
      "https://example.com/api?key=x",
      "https://example.com/api#x",
      "https://example.com/api%2fv1",
      "https://example.com/api//v1",
    ])
      expect(() => syncServerURL(url)).toThrow();
  });
  it("keeps the prefix for authenticated JSON, uploads and downloads", async () => {
    const original = Buffer.from("synthetic original"),
      hash = createHash("sha256").update(original).digest("hex");
    const seen: string[] = [];
    const server = createServer(async (req, res) => {
      seen.push(`${req.method} ${req.url}`);
      if (req.headers.authorization !== "Bearer fixture-token") {
        res.writeHead(401);
        res.end();
        return;
      }
      if (req.url === "/api/v1/me") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            user: { id: "user.fixture", email: "fixture@example.test" },
          }),
        );
        return;
      }
      if (req.url === `/api/v1/spaces/space.fixture/objects/${hash}`) {
        if (req.method === "PUT") {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          if (!Buffer.concat(chunks).equals(original)) {
            res.writeHead(400);
            res.end();
            return;
          }
          res.end("{}");
        } else res.end(original);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string")
        throw Error("fixture listen failed");
      const client = new SyncClient(
        `http://127.0.0.1:${addr.port}/api/`,
        "fixture-token",
      );
      expect((await client.me()).user.id).toBe("user.fixture");
      await client.upload("space.fixture", hash, original);
      expect(
        await client.download("space.fixture", hash, original.length),
      ).toEqual(original);
      expect(seen).toHaveLength(3);
      expect(seen.every((path) => path.includes(" /api/"))).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });
});
