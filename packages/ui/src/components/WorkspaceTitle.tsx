import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Pages own their title; Shell owns its single, stable toolbar location. */
export const WorkspaceTitleTarget = createContext<
  HTMLElement | null | undefined
>(undefined);

export function WorkspaceTitle({ children }: { children: ReactNode }) {
  const target = useContext(WorkspaceTitleTarget);
  // Standalone page hosts keep a local title; Shell waits for its toolbar ref.
  if (target === undefined) return children;
  return target ? createPortal(children, target) : null;
}
