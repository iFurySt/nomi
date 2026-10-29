import { createContext, useContext } from "react";
import type {
  Conversation,
  Workspace,
  WorkspacePage,
  StockTab,
  StockCollection,
  StockRoute,
  SettingsSection,
} from "@nomi/core";
export interface WorkspaceContextValue {
  workspace: Workspace;
  resolvedTheme: "light" | "dark";
  update: (change: (current: Workspace) => Workspace) => void;
  page: WorkspacePage;
  navigate: (page: WorkspacePage) => void;
  stockRoute: StockRoute;
  stockCollection: StockCollection;
  selectStockCollection: (collection: StockCollection) => void;
  settingsSection: SettingsSection;
  openStock: (symbol: string, tab?: StockTab) => void;
  notify: (message: string) => void;
  research: (prompt?: string) => void;
  conversationId: string | null;
  openConversation: (conversation: Conversation | null) => void;
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
  learn: "Learn",
  stocks: "Stocks",
  agents: "Agents",
  research: "Chat",
  watchlist: "Watchlist",
  arena: "Arena",
  portfolio: "Portfolio",
  library: "Library",
  settings: "Settings",
  usage: "Usage",
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export const percent = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
