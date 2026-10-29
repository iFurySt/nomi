import type { ReactNode } from "react";
import { useChatGPT } from "../chatgpt-context";
import { CanvasDocumentProvider } from "./useCanvasDocument";
/** Keep pending edits and failed saves alive when visiting other workspace pages. */
export function CanvasDocumentSession({ children }: { children: ReactNode }) {
  const { status } = useChatGPT();
  const profile = status?.activeProfileId ?? "local-device";
  return (
    <CanvasDocumentProvider key={profile} profile={profile}>
      {children}
    </CanvasDocumentProvider>
  );
}
