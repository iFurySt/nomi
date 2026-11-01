import { spawn } from "node:child_process";
const [command, ...args] = process.argv.slice(2);
if (!command) throw Error("Missing CI command");
// Preserve stdout/stderr chronology so the actual failing command's output is
// not buried behind earlier signing diagnostics in the GitHub annotation.
const child = spawn(command, args, { env: process.env });
let tail = "";
const capture = (chunk, stream) => {
  stream.write(chunk);
  tail = (tail + chunk.toString()).slice(-16000);
};
child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
child.on("error", (error) =>
  capture(Buffer.from(error.message), process.stderr),
);
const status = await new Promise((resolve) => child.on("close", resolve));
if (status !== 0) {
  const message = tail
    .trim()
    .split("\n")
    .slice(-24)
    .join("\n")
    .slice(-5000)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.error(`::error title=Desktop step failed::${message}`);
  process.exit(status ?? 1);
}
