import { expect, it } from "vitest";
import { NOMI_REPOSITORY_URL, isAppExternalURL } from "./app-links";

it("opens only the exact project repository or existing research sources", () => {
  expect(isAppExternalURL(NOMI_REPOSITORY_URL)).toBe(true);
  expect(isAppExternalURL("https://www.sec.gov/Archives/filing.htm")).toBe(
    true,
  );
  for (const url of [
    "http://github.com/iFurySt/nomi",
    "https://github.com/other/repo",
    NOMI_REPOSITORY_URL + "?redirect=https://example.com",
    NOMI_REPOSITORY_URL + "/issues",
    "https://github.com.evil.example/iFurySt/nomi",
    "https://user:pass@github.com/iFurySt/nomi",
    "javascript:alert(1)",
    "file:///private/file",
    "https://example.com/",
  ])
    expect(isAppExternalURL(url)).toBe(false);
});
