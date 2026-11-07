import { workspacePages } from "@nomi/core";

export const lastRouteKey = "nomi.last-route";
export function validWorkspaceRoute(hash: string | null): string | undefined {
  if (!hash?.startsWith("#/")) return;
  const page = hash.slice(2).split(/[/?]/)[0];
  if (workspacePages.some((value) => value === page)) return hash;
}
export function initialWorkspaceRoute(hash: string, saved: string | null) {
  return (
    (hash ? validWorkspaceRoute(hash) : validWorkspaceRoute(saved)) ?? "#/notes"
  );
}
