export const NOMI_REPOSITORY_URL = "https://github.com/iFurySt/nomi";
/** External app chrome only opens the project repository. Content links use their own validated renderer. */
export function isAppExternalURL(value: string): boolean {
  return value === NOMI_REPOSITORY_URL;
}
