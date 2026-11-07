import { WorkspaceTitle } from "../components/WorkspaceTitle";
import { LOCAL_WORKSPACE_PROFILE } from "../canvas/workspaceIdentity";
import { Skeleton, SkeletonGroup } from "../components/Skeleton";
import { ResizableNotesLayout } from "./ResizableNotesLayout";
import "./writing.css";
import "./notes-loading.css";

/** Use the reading view's geometry during both chunk and document loading. */
export function NotesLoading({
  profile = LOCAL_WORKSPACE_PROFILE,
}: {
  profile?: string;
}) {
  return (
    <ResizableNotesLayout profile={profile}>
      <aside className="notes-library notes-loading-library" aria-hidden="true">
        <header>
          <h1>文稿</h1>
          <Skeleton width={18} height={18} />
        </header>
        <div className="notes-search">
          <Skeleton width="48%" height={10} />
        </div>
        <div className="notes-loading-tree">
          {[72, 56, 80, 64, 48].map((width, index) => (
            <div className="notes-loading-row" key={index}>
              <Skeleton width={15} height={18} />
              <Skeleton width={`${width}%`} height={11} />
            </div>
          ))}
        </div>
      </aside>
      <SkeletonGroup label="加载文稿" className="notes-main notes-loading-main">
        <WorkspaceTitle>
          <div className="notes-document-title" aria-hidden="true">
            <Skeleton width={104} height={11} />
          </div>
        </WorkspaceTitle>
        <div className="notes-writing-area">
          <div className="notes-scroll">
            <div className="writing-article">
              <div className="writing-heading">
                <div
                  className="writing-title notes-loading-title"
                  aria-hidden="true"
                >
                  <Skeleton width="36%" height="1em" />
                </div>
              </div>
              {[0, 1, 2].map((paragraph) => (
                <div
                  className="notes-loading-paragraph"
                  key={paragraph}
                  aria-hidden="true"
                >
                  <Skeleton width="96%" />
                  <Skeleton width="100%" />
                  <Skeleton width={paragraph === 1 ? "64%" : "82%"} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonGroup>
    </ResizableNotesLayout>
  );
}

export function WorkspaceLoading({ page }: { page: "canvas" | "notes" }) {
  return page === "notes" ? (
    <NotesLoading />
  ) : (
    <SkeletonGroup label="加载画布" className="canvas-workspace-loading">
      {null}
    </SkeletonGroup>
  );
}
