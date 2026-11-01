import { createContext, useContext } from "react";
import type { Workspace, WorkspacePage, SettingsSection } from "@nomi/core";
export interface WorkspaceContextValue {
  workspace: Workspace;
  resolvedTheme: "light" | "dark";
  update: (change: (current: Workspace) => Workspace) => void;
  page: WorkspacePage;
  navigate: (page: WorkspacePage) => void;
  settingsSection: SettingsSection;
  notify: (message: string) => void;
  storageError?: string;
}
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider is missing.");
  return context;
}
export const uid = () => crypto.randomUUID();
export const pageLabels: Record<WorkspacePage, string> = {
  canvas: "Canvas",
  notes: "文稿",
  settings: "Settings",
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export const percent = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
