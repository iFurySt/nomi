import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Private newline-delimited JSON RPC. No stderr/provider bodies are logged. */
export class CodexRPC {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private buffer = "";
  private child: ChildProcessWithoutNullStreams;
  private closed = false;
  onMessage: (method: string, params: any, id?: string | number) => void =
    () => {};
  onClose: () => void = () => {};
  constructor(
    binary: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
  ) {
    this.child = spawn(binary, args, {
      env,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (Buffer.byteLength(this.buffer) > 8 * 1024 * 1024) return this.close();
      let end: number;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (typeof m.method === "string")
            this.onMessage(m.method, m.params ?? {}, m.id);
          else {
            const call = this.pending.get(m.id);
            if (!call) continue;
            this.pending.delete(m.id);
            clearTimeout(call.timer);
            if (m.error)
              call.reject(
                Error(
                  "Codex request failed. Restart the chat or try another model.",
                ),
              );
            else call.resolve(m.result);
          }
        } catch {
          this.close();
          return;
        }
      }
    });
    this.child.stderr.resume();
    this.child.on("error", () => this.close());
    this.child.on("exit", () => this.close());
    this.child.stdin.on("error", () => this.close());
  }
  send(message: unknown) {
    if (this.closed)
      throw Error("Codex runtime disconnected. Retry to reconnect.");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  request(method: string, params: unknown, timeout = 30000): Promise<any> {
    if (this.closed)
      return Promise.reject(
        Error("Codex runtime disconnected. Retry to reconnect."),
      );
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Codex request timed out. Retry to reconnect."));
        this.close();
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  reply(id: string | number, result: unknown) {
    this.send({ id, result });
  }
  reject(id: string | number) {
    this.send({
      id,
      error: { code: -32601, message: "Unsupported client request" },
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Codex runtime disconnected. Retry to reconnect."));
    }
    this.pending.clear();
    const terminate = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && this.child.pid)
          process.kill(-this.child.pid, signal);
        else this.child.kill(signal);
      } catch {
        /* The owned process group has already exited. */
      }
    };
    terminate("SIGTERM");
    const kill = setTimeout(() => terminate("SIGKILL"), 2000);
    kill.unref();
    this.onClose();
  }
}
