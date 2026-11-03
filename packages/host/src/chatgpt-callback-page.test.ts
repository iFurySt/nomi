import { describe, expect, it } from "vitest";
import { chatGPTCallbackPage } from "./chatgpt-callback-page";
import { isAuthReturnURL } from "../../core/src/app-links";

describe("OAuth browser return", () => {
  it("scrubs the URL and returns to the correct installed or development app", () => {
    const page = chatGPTCallbackPage(true, "test-nonce");
    expect(page).toContain('href="nomi://auth/complete"');
    expect(page).toContain('history.replaceState(null,"","/auth/callback")');
    expect(page).toContain('location.href="nomi://auth/complete"');
    expect(page).toContain('nonce="test-nonce"');
    expect(page).not.toContain("Sign-in complete");
    expect(chatGPTCallbackPage(true, "test-nonce", true)).toContain(
      "nomi-local://auth/complete",
    );
  });
  it("does not auto-launch the app on rejected callbacks", () => {
    const page = chatGPTCallbackPage(false, "test-nonce");
    expect(page).toContain("Sign-in not completed");
    expect(page).not.toContain("location.href");
  });
  it("accepts only a credential-free window wake link", () => {
    expect(isAuthReturnURL("nomi://auth/complete")).toBe(true);
    expect(isAuthReturnURL("nomi-local://auth/complete")).toBe(true);
    for (const url of [
      "nomi://auth/complete?code=secret",
      "nomi://auth/complete#secret",
      "nomi://auth/else",
      "nomi://user@auth/complete",
      "file:///tmp/auth/complete",
      "https://auth/complete",
    ])
      expect(isAuthReturnURL(url)).toBe(false);
  });
});
