/** Allow writing from Nomi's own top document; clipboard reading stays denied. */
export function allowsClipboardWrite(
  permission: string,
  details: {
    isMainFrame: boolean;
    requestingUrl?: string;
    mainFrameUrl: string;
    expectedUrl: string;
  },
) {
  const { isMainFrame, requestingUrl, mainFrameUrl, expectedUrl } = details;
  if (permission !== "clipboard-sanitized-write" || !isMainFrame) return false;
  const clean = (value: string) => value.split("#")[0];
  const trusted = (value: string) =>
    clean(value) === expectedUrl ||
    (expectedUrl === "http://127.0.0.1:5173" &&
      clean(value) === expectedUrl + "/");
  return trusted(mainFrameUrl) && trusted(requestingUrl ?? mainFrameUrl);
}
