import type { ReactNode } from "react";
import { LOCAL_WORKSPACE_PROFILE } from "./workspaceIdentity";
import { CanvasDocumentProvider } from "./useCanvasDocument";
/** Keep pending edits and failed saves alive when visiting other workspace pages. */
export function CanvasDocumentSession({ children }: { children: ReactNode }) {
  const profile = LOCAL_WORKSPACE_PROFILE;
  return (
    <CanvasDocumentProvider key={profile} profile={profile}>
      {children}
    </CanvasDocumentProvider>
  );
}
