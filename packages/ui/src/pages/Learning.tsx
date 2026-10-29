import { useEffect, useRef, useState } from "react";
import { Code2, Download, Upload, FlaskConical } from "lucide-react";
import {
  temperatureProgram,
  parseInteractiveProgram,
  hydrateStudyState,
  setStudyValue,
  runStudyAction,
  MAX_INTERACTIVE_BYTES,
  type StudyState,
  type Value,
} from "@nomi/core";
import {
  readLearningDefinition,
  readLearningState,
  saveLearningDefinition,
  saveLearningState,
  type StoragePort,
} from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { Modal, Button } from "../components/primitives";
import { InteractiveRenderer } from "../interactive/InteractiveRenderer";
import "../interactive/learning.css";

const localStoragePort: StoragePort = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
export function Learning() {
  const { status } = useChatGPT();
  const profile = status?.activeProfileId ?? "local-device";
  return <LearningWorkspace key={profile} profile={profile} />;
}
/** Same surface is mounted by the isolated Electron fixture without account or network services. */
export function LearningWorkspace({
  profile,
  storage = localStoragePort,
}: {
  profile: string;
  storage?: StoragePort;
}) {
  const [initial] = useState(() => {
    const definition = readLearningDefinition(
      storage,
      profile,
      temperatureProgram,
    );
    return {
      ...definition,
      ...readLearningState(storage, profile, definition.program),
      definitionError: definition.error,
    };
  });
  const [program, setProgram] = useState(initial.program);
  const [state, setState] = useState(initial.state);
  const [draft, setDraft] = useState(initial.raw);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState(initial.error);
  const [definitionError, setDefinitionError] = useState(
    initial.definitionError,
  );
  const current = useRef({
    program,
    state,
    blocked: !!initial.error,
    dirty: false,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const commit = () => {
    const c = current.current;
    if (!c.dirty || c.blocked) return "";
    const error = saveLearningState(storage, profile, c.program, c.state);
    setSaveError(error);
    if (!error) c.dirty = false;
    return error;
  };
  useEffect(() => {
    const flush = () => {
      const c = current.current;
      if (c.dirty && !c.blocked)
        saveLearningState(storage, profile, c.program, c.state);
    };
    window.addEventListener("pagehide", flush);
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [profile, storage]);
  const change = (next: StudyState) => {
    current.current.state = next;
    current.current.dirty = true;
    setState(next);
    setNotice("");
  };
  const onSet = (id: string, value: Value) => {
    try {
      change(
        setStudyValue(
          current.current.program,
          current.current.state,
          id,
          value,
        ),
      );
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };
  const onAction = (id: string) => {
    change(runStudyAction(current.current.program, current.current.state, id));
    current.current.blocked = false;
    commit();
  };
  const apply = () => {
    try {
      const next = parseInteractiveProgram(draft);
      const progressError = commit();
      if (progressError) throw Error(progressError);
      const error = saveLearningDefinition(storage, profile, next);
      if (error) throw Error(error);
      const loaded =
        next.id === current.current.program.id
          ? {
              state: hydrateStudyState(next, current.current.state),
              error: current.current.blocked ? saveError : "",
            }
          : readLearningState(storage, profile, next);
      current.current = {
        program: next,
        state: loaded.state,
        blocked: !!loaded.error,
        dirty: false,
      };
      setProgram(next);
      setState(loaded.state);
      setSaveError(loaded.error);
      setDraft(JSON.stringify(next, null, 2));
      setDefinitionError("");
      setEditorError("");
      setEditorOpen(false);
      setNotice("交互已更新，兼容的个人进度已保留。");
    } catch (error) {
      setEditorError((error as Error).message);
    }
  };
  const exportDefinition = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(program, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${program.id}.nomi-ui.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="learning-workspace">
      <header className="learning-page-heading">
        <div>
          <div className="learning-eyebrow">
            <FlaskConical size={15} /> 学习实验室
          </div>
          <h1>把知识变成可以探索的东西</h1>
          <p>拖动参数，观察变化。你的探索进度会保存在本机。</p>
        </div>
        <div className="learning-tools">
          <Button
            onClick={() => {
              setEditorError("");
              setEditorOpen(true);
            }}
          >
            <Code2 size={15} /> 编辑交互
          </Button>
          <Button onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> 导入
          </Button>
          <Button onClick={exportDefinition}>
            <Download size={15} /> 导出
          </Button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".json,application/json"
            aria-label="导入交互定义"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setEditorOpen(true);
              setEditorError("");
              if (file.size > MAX_INTERACTIVE_BYTES) {
                setEditorError("文件超过 256 KB，请缩小交互定义。");
                return;
              }
              try {
                setDraft(await file.text());
              } catch {
                setEditorError("文件无法读取。");
              }
            }}
          />
        </div>
      </header>
      {(definitionError || saveError) && (
        <div className="learning-alert" role="alert">
          {definitionError || saveError}
          {saveError &&
            (current.current.blocked ? (
              <button
                onClick={() => {
                  change(hydrateStudyState(program));
                  current.current.blocked = false;
                  commit();
                }}
              >
                恢复默认进度
              </button>
            ) : (
              <button onClick={commit}>重试保存</button>
            ))}
        </div>
      )}
      <div className="learning-notice" role="status">
        {notice}
      </div>
      <InteractiveRenderer
        program={program}
        state={state}
        onSet={onSet}
        onAction={onAction}
        onCommit={commit}
      />
      <p className="learning-footnote">
        交互在本机运行 · 导出包含内容与默认值，个人探索进度单独保存
      </p>
      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title="编辑交互定义"
        description="修改内容、公式或布局后应用。校验失败时，当前交互会继续保留。"
        className="learning-editor-modal"
      >
        <label htmlFor="learning-source">交互定义（JSON）</label>
        <textarea
          id="learning-source"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {editorError && (
          <div className="learning-alert" role="alert">
            {editorError}
          </div>
        )}
        <div className="learning-editor-actions">
          <Button
            onClick={() => {
              setDraft(JSON.stringify(program, null, 2));
              setEditorError("");
            }}
          >
            恢复当前定义
          </Button>
          <Button variant="primary" onClick={apply}>
            校验并应用
          </Button>
        </div>
      </Modal>
    </div>
  );
}
