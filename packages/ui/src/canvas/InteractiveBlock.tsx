import { memo, useEffect, useRef, useState } from "react";
import {
  hydrateStudyState,
  runStudyAction,
  setStudyValue,
  type InteractiveProgram,
  type StudyState,
  type Value,
} from "@nomi/core";
import {
  readLearningState,
  saveLearningState,
  type StoragePort,
} from "@nomi/platform";
import { InteractiveRenderer } from "../interactive/InteractiveRenderer";
import "../interactive/learning.css";
const storage: StoragePort = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};
export const InteractiveBlock = memo(
  function InteractiveBlock({
    program,
    profile,
    documentId,
    blockId,
  }: {
    program: InteractiveProgram;
    profile: string;
    documentId: string;
    blockId: string;
  }) {
    // Stable document + block scope means two placements share one learner state.
    const scope = JSON.stringify([profile, documentId, blockId]);
    const [loaded] = useState(() => readLearningState(storage, scope, program));
    const [state, setState] = useState(loaded.state),
      [error, setError] = useState(loaded.error);
    const current = useRef({
      state,
      program,
      blocked: !!loaded.error,
      dirty: false,
    });
    const revision = useRef(program);
    const apply = (value: StudyState) => {
      current.current.state = value;
      current.current.dirty = true;
      setState(value);
    };
    const commit = () => {
      const c = current.current;
      if (!c.dirty || c.blocked) return;
      const error = saveLearningState(storage, scope, c.program, c.state);
      setError(error);
      if (!error) {
        c.dirty = false;
        window.dispatchEvent(
          new CustomEvent("nomi-study-change", { detail: scope }),
        );
      }
    };
    useEffect(() => {
      if (revision.current !== program) {
        revision.current = program;
        const changedId = current.current.program.id !== program.id;
        const loaded = changedId
          ? readLearningState(storage, scope, program)
          : {
              state: hydrateStudyState(program, current.current.state),
              error: current.current.blocked ? error : "",
            };
        current.current.program = program;
        current.current.state = loaded.state;
        current.current.blocked = !!loaded.error;
        setState(loaded.state);
        setError(loaded.error);
      }
    }, [program]);
    useEffect(() => {
      const flush = () => {
        const c = current.current;
        if (c.dirty && !c.blocked)
          saveLearningState(storage, scope, c.program, c.state);
      };
      const update = (event: Event) => {
        if ((event as CustomEvent).detail !== scope) return;
        const next = readLearningState(storage, scope, current.current.program);
        current.current.state = next.state;
        current.current.blocked = !!next.error;
        setState(next.state);
        setError(next.error);
      };
      window.addEventListener("pagehide", flush);
      window.addEventListener("nomi-study-change", update);
      return () => {
        flush();
        window.removeEventListener("pagehide", flush);
        window.removeEventListener("nomi-study-change", update);
      };
    }, [scope]);
    return (
      <div className="canvas-interactive">
        {error && (
          <div className="learning-alert" role="alert">
            {error}
            <button
              onClick={() => {
                apply(hydrateStudyState(program));
                current.current.blocked = false;
                commit();
              }}
            >
              恢复默认进度
            </button>
          </div>
        )}
        <InteractiveRenderer
          program={program}
          state={state}
          onSet={(id: string, value: Value) =>
            apply(setStudyValue(program, current.current.state, id, value))
          }
          onAction={(id) => {
            apply(runStudyAction(program, current.current.state, id));
            current.current.blocked = false;
            commit();
          }}
          onCommit={commit}
        />
      </div>
    );
  },
  (a, b) =>
    a.profile === b.profile &&
    a.documentId === b.documentId &&
    a.blockId === b.blockId &&
    (a.program === b.program ||
      JSON.stringify(a.program) === JSON.stringify(b.program)),
);
