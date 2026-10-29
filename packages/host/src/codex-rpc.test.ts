import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexRPC } from "./codex-rpc";
it("frames split lines, routes server requests, rejects unknown RPC errors and settles child exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nomi-rpc-"));
  const script = join(dir, "server.cjs");
  writeFileSync(
    script,
    `const rl=require('readline').createInterface({input:process.stdin});rl.on('line',line=>{const m=JSON.parse(line);if(!m.method)return;if(m.method==='crash')process.exit(1);if(m.method==='bad')return process.stdout.write('not-json\\n');if(m.method==='error')return process.stdout.write(JSON.stringify({id:m.id,error:{message:'secret-provider-body'}})+'\\n');process.stdout.write(JSON.stringify({method:'sample/request',id:900,params:{safe:true}})+'\\n');const r=JSON.stringify({id:m.id,result:{ready:true}})+'\\n';process.stdout.write(r.slice(0,5));setTimeout(()=>process.stdout.write(r.slice(5)),5)});`,
  );
  const rpc = new CodexRPC(
    process.execPath,
    [script],
    { PATH: process.env.PATH },
    dir,
  );
  const requests: any[] = [];
  rpc.onMessage = (m, p, id) => {
    requests.push({ m, p, id });
    rpc.reject(id!);
  };
  try {
    expect(await rpc.request("initialize", {})).toEqual({ ready: true });
    expect(requests[0].id).toBe(900);
    await expect(rpc.request("error", {})).rejects.toThrow(
      "Codex request failed",
    );
    await expect(rpc.request("crash", {})).rejects.toThrow("disconnected");
    await expect(rpc.request("closed", {})).rejects.toThrow("disconnected");
  } finally {
    rpc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("settles malformed, oversized and silent child responses without leaving requests pending", async () => {
  for (const mode of ["malformed", "oversized", "timeout"]) {
    const dir = mkdtempSync(join(tmpdir(), "nomi-rpc-bounds-")),
      file = join(dir, "server.cjs");
    writeFileSync(
      file,
      `process.stdin.on('data',()=>{${mode === "malformed" ? "process.stdout.write('bad-json\\n')" : mode === "oversized" ? "process.stdout.write('x'.repeat(9*1024*1024))" : ""}});`,
    );
    const rpc = new CodexRPC(
      process.execPath,
      [file],
      { PATH: process.env.PATH },
      dir,
    );
    try {
      await expect(
        rpc.request("initialize", {}, mode === "timeout" ? 100 : 1000),
      ).rejects.toThrow(/disconnected|timed out/);
    } finally {
      rpc.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
