/** Fixed copy only: never interpolate callback query values or credentials. */
export function chatGPTCallbackPage(
  received: boolean,
  nonce: string,
  local = false,
) {
  const returnURL = `${local ? "nomi-dev" : "nomi"}://auth/complete`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${received ? "Return to Nomi" : "Sign-in not completed"}</title>
<style nonce="${nonce}">
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#242424;background:#fafafa}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:360px;background:#fff;border:1px solid #e8e8e8;border-radius:20px;padding:32px;text-align:center}.brand{font-size:14px;font-weight:650;margin:0 0 24px}.symbol{width:40px;height:40px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;background:#f1f3f1;font-size:22px}h1{font-size:22px;letter-spacing:-.5px;margin:0 0 24px}a{display:block;background:#242424;color:white;border-radius:12px;padding:13px 20px;text-decoration:none;font-size:14px;font-weight:600}a:focus-visible{outline:3px solid #8aa9ee;outline-offset:3px}@media(prefers-color-scheme:dark){:root{background:#161616;color:#ececec}main{background:#202020;border-color:#383838}.symbol{background:#303530}a{background:#ececec;color:#202020}}
</style></head><body><main><div class="brand">Nomi</div><div class="symbol" aria-hidden="true">${received ? "✓" : "!"}</div><h1>${received ? "Continue in Nomi" : "Sign-in not completed"}</h1><a href="${returnURL}">Open Nomi</a></main>
<script nonce="${nonce}">history.replaceState(null,"","/auth/callback");${received ? `setTimeout(()=>{location.href="${returnURL}"},350);` : ""}</script></body></html>`;
}
