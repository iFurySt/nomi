import { isResearchSourceURL } from "./stock-research";

export const NOMI_REPOSITORY_URL = "https://github.com/iFurySt/nomi";

/** App links are exact destinations, independent of research-provider hosts. */
export function isAppExternalURL(value: string): boolean {
  return value === NOMI_REPOSITORY_URL || isResearchSourceURL(value);
}
