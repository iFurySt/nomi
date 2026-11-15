// Explicit synthetic-only website / app handoff check. Does not touch document libraries.
import { readFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";

const account = JSON.parse(await readFile(process.argv[2], "utf8"));
assert(account.email.endsWith("@example.invalid"));
const site = account.server.replace(/\/api\/?$/, "").replace(/\/$/, "");
assert.equal(new URL(site).protocol, "https:");
const verifier = randomBytes(32).toString("base64url");
const post = (path, value) =>
  fetch(site + "/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    redirect: "error",
  });
let session;
try {
  const response = await post("/auth/desktop/start", {
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    deviceId: "device.browser-check",
    deviceName: "Synthetic browser verification",
    scheme: "nomi-dev",
  });
  assert.equal(response.status, 200);
  const { id } = await response.json();
  const pending = await post("/auth/desktop/exchange", { id, verifier });
  assert.equal(pending.status, 202);
  const page = await fetch(site + "/login?request=" + id, {
    redirect: "error",
  });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const html = await page.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const cookie = page.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Host-nomi_login_csrf="));
  assert(cookie && /Secure/.test(cookie) && /HttpOnly/.test(cookie));
  const approved = await fetch(site + "/login", {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie.split(";")[0],
    },
    body: new URLSearchParams({
      request: id,
      csrf,
      email: account.email,
      password: account.password,
    }),
  });
  assert.equal(approved.status, 200);
  assert.match(await approved.text(), /href="nomi-dev:\/\/account\/complete"/);
  assert.equal(
    (await post("/auth/desktop/exchange", { id, verifier: "b".repeat(43) }))
      .status,
    401,
  );
  const claimed = await post("/auth/desktop/exchange", { id, verifier });
  assert.equal(claimed.status, 200);
  session = await claimed.json();
  assert.equal(session.user.email, account.email);
  assert.equal(
    (await post("/auth/desktop/exchange", { id, verifier })).status,
    410,
  );
  const me = await fetch(site + "/api/v1/me", {
    headers: { Authorization: "Bearer " + session.token },
  });
  assert.equal(me.status, 200);
  console.log(
    "PASS: HTTPS website, secure form, proof-bound one-time session, app return, replay rejection.",
  );
} finally {
  if (session) {
    const response = await fetch(
      site + "/api/v1/sessions/" + session.sessionId,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer " + session.token },
      },
    );
    assert.equal(response.status, 200);
    console.log("Synthetic session revoked; no documents uploaded.");
  }
}
