import { lazy, Suspense } from "react";
import { LOCAL_WORKSPACE_PROFILE } from "../canvas/workspaceIdentity";
import { WorkspaceLoading } from "../writing/NotesLoading";
const Canvas = lazy(() =>
  import("./Canvas").then((m) => ({ default: m.Canvas })),
);
const Notes = lazy(() => import("./Notes").then((m) => ({ default: m.Notes })));

/** Keep one document owner mounted while switching between spatial and reading views. */
export function NotesWorkspace({ page }: { page: "canvas" | "notes" }) {
  const profile = LOCAL_WORKSPACE_PROFILE;
  return (
    <Suspense key={profile} fallback={<WorkspaceLoading page={page} />}>
      {page === "canvas" ? <Canvas /> : <Notes profile={profile} />}
    </Suspense>
  );
}
