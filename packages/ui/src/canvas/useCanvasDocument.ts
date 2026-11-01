import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyCanvasCommands,
  createCanvasDocument,
  type CanvasDocument,
  type CanvasCommand,
} from "@nomi/core";
import { createCanvasRepository, type CanvasAssetWrite } from "@nomi/platform";
import { createDebouncedFlush } from "./debouncedFlush";
function useCanvasDocumentState(profile: string) {
  const repository = useMemo(() => createCanvasRepository(profile), [profile]);
  const [document, setDocument] = useState<CanvasDocument>();
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [externalNotice, setExternalNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [, renderHistory] = useState(0);
  const current = useRef<CanvasDocument | undefined>(undefined);
  const alive = useRef(false),
    base = useRef<number | null>(null),
    running = useRef(false);
  const pending = useRef<CanvasDocument | undefined>(undefined),
    originals = useRef(new Map<string, CanvasAssetWrite>());
  const history = useRef<{
    undo: CanvasDocument[];
    redo: CanvasDocument[];
    group?: string;
  }>({ undo: [], redo: [] });
  const persistRef = useRef<() => Promise<boolean>>(async () => true);
  const inFlight = useRef<Promise<boolean> | undefined>(undefined);
  const delayed = useMemo(
    () =>
      createDebouncedFlush(() => {
        void persistRef.current();
      }),
    [repository],
  );
  const persist = (): Promise<boolean> => {
    delayed.cancel();
    if (inFlight.current) return inFlight.current;
    if (!pending.current) return Promise.resolve(true);
    const operation = async () => {
      running.current = true;
      if (alive.current) {
        setSaving(true);
        setSaveError("");
      }
      try {
        while (pending.current) {
          const snapshot = pending.current;
          pending.current = undefined;
          const assets = [...originals.current.values()].filter((item) =>
            snapshot.assets.some((meta) => meta.id === item.asset.id),
          );
          try {
            await repository.save(snapshot, assets, base.current);
            base.current = snapshot.revision;
            for (const a of assets) originals.current.delete(a.asset.id);
          } catch (error) {
            pending.current = current.current;
            if (alive.current) setSaveError((error as Error).message);
            break;
          }
        }
      } finally {
        running.current = false;
        if (alive.current) {
          setSaving(false);
          setDirty(!!pending.current);
        }
      }
      return !pending.current;
    };
    inFlight.current = operation().finally(() => {
      inFlight.current = undefined;
    });
    return inFlight.current;
  };
  persistRef.current = persist;
  const queue = (doc: CanvasDocument, debounce = false) => {
    pending.current = doc;
    setDirty(true);
    if (debounce) delayed.schedule();
    else void persist();
  };
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void repository
      .load()
      .then((saved) => {
        if (cancelled) return;
        const doc = saved ?? createCanvasDocument();
        base.current = saved?.revision ?? null;
        current.current = doc;
        setDocument(doc);
        if (!saved) queue(doc);
      })
      .catch((error) => {
        if (!cancelled) setLoadError((error as Error).message);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      void persistRef.current();
    };
  }, [repository]);
  useEffect(() => {
    const flush = () => {
      void persistRef.current();
    };
    const visibility = () => {
      if (window.document.visibilityState === "hidden") flush();
    };
    const hostFlush = (event: Event) => {
      (
        event as CustomEvent<{ waitUntil: (p: Promise<boolean>) => void }>
      ).detail.waitUntil(persistRef.current());
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current || running.current) {
        flush();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("hashchange", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("nomi-flush-documents", hostFlush);
    window.document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("hashchange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("nomi-flush-documents", hostFlush);
      window.document.removeEventListener("visibilitychange", visibility);
      delayed.cancel();
    };
  }, [delayed]);
  const acceptExternal = (saved: CanvasDocument) => {
    base.current = saved.revision;
    current.current = saved;
    setDocument(saved);
    history.current = { undo: [], redo: [] };
    renderHistory((n) => n + 1);
  };
  useEffect(() => {
    if (!repository.externalChanges) return;
    let cancelled = false,
      checking = false;
    const refresh = async () => {
      if (checking || !current.current || pending.current || running.current)
        return;
      checking = true;
      const before = current.current;
      try {
        const saved = await repository.load();
        if (
          !cancelled &&
          current.current === before &&
          !pending.current &&
          !running.current &&
          saved
        ) {
          if (saved.revision !== base.current) {
            acceptExternal(saved);
            setExternalNotice("");
          }
          setSaveError("");
        }
      } catch (e) {
        if (!cancelled) setSaveError((e as Error).message);
      } finally {
        checking = false;
      }
    };
    const onFocus = () => {
      void refresh();
    };
    const timer = setInterval(() => {
      if (window.document.visibilityState === "visible") void refresh();
    }, 1500);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [repository]);
  const reloadFromDisk = async () => {
    if (!repository.backup) return;
    delayed.cancel();
    if (inFlight.current) await inFlight.current;
    const before = current.current;
    if (!before) return;
    try {
      await repository.backup(before, [...originals.current.values()]);
      const saved = await repository.load();
      if (!saved) throw Error("磁盘文稿不存在，当前编辑已保留。");
      if (current.current !== before)
        throw Error("正在继续编辑，请暂停输入后重新读取。");
      pending.current = undefined;
      originals.current.clear();
      acceptExternal(saved);
      setDirty(false);
      setSaveError("");
      setExternalNotice(
        "已读取磁盘版本，原编辑已备份到文稿目录的 .nomi-history 中。",
      );
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };
  const install = (doc: CanvasDocument, debounce = false) => {
    current.current = doc;
    setDocument(doc);
    queue(doc, debounce);
  };
  const edit = (
    commands: CanvasCommand[],
    group?: string,
    assets: CanvasAssetWrite[] = [],
    options: { debounce?: boolean } = {},
  ) => {
    const before = current.current;
    if (!before) throw Error("画布尚未载入。");
    const after = applyCanvasCommands(before, before.revision, commands);
    if (!group || history.current.group !== group) {
      history.current.undo.push(before);
      if (history.current.undo.length > 40) history.current.undo.shift();
    }
    history.current.group = group;
    history.current.redo = [];
    for (const asset of assets) originals.current.set(asset.asset.id, asset);
    install(after, options.debounce);
    renderHistory((n) => n + 1);
    return after;
  };
  const replace = (doc: CanvasDocument, expectedRevision: number) => {
    const before = current.current;
    if (!before || before.revision !== expectedRevision)
      throw Error("文档已改变，请重新打开 DSL 后再编辑。");
    if (doc.id !== before.id)
      throw Error("此处只能编辑当前文档，不能改变文档 ID。");
    for (const asset of doc.assets) {
      const previous = before.assets.find((a) => a.id === asset.id);
      if (
        !previous ||
        previous.sha256 !== asset.sha256 ||
        previous.bytes !== asset.bytes ||
        previous.mime !== asset.mime
      )
        throw Error("请先在画布中添加附件原件，再引用它。");
    }
    history.current.undo.push(before);
    history.current.redo = [];
    history.current.group = undefined;
    install({ ...doc, revision: before.revision + 1 });
    renderHistory((n) => n + 1);
  };
  const travel = (direction: "undo" | "redo") => {
    const doc = current.current,
      stack = history.current[direction];
    if (!doc || !stack.length) return;
    const next = stack.pop()!;
    history.current[direction === "undo" ? "redo" : "undo"].push(doc);
    history.current.group = undefined;
    install({ ...next, revision: doc.revision + 1 });
    renderHistory((n) => n + 1);
  };
  const viewRepository = useMemo(
    () => ({
      ...repository,
      asset: async (id: string) =>
        originals.current.get(id)?.blob ?? repository.asset(id),
    }),
    [repository],
  );
  return {
    document,
    current,
    repository: viewRepository,
    loadError,
    saveError,
    externalNotice,
    canReloadFromDisk: !!repository.backup,
    reloadFromDisk,
    saving,
    dirty,
    flush: () => persistRef.current(),
    edit,
    replace,
    undo: () => travel("undo"),
    redo: () => travel("redo"),
    canUndo: !!history.current.undo.length,
    canRedo: !!history.current.redo.length,
    endGroup: () => {
      history.current.group = undefined;
    },
    retry: () => {
      if (current.current) queue(current.current);
    },
  };
}

const CanvasDocumentContext = createContext<ReturnType<
  typeof useCanvasDocumentState
> | null>(null);
export function CanvasDocumentProvider({
  profile,
  children,
}: {
  profile: string;
  children: ReactNode;
}) {
  const data = useCanvasDocumentState(profile);
  return createElement(
    CanvasDocumentContext.Provider,
    { value: data },
    children,
  );
}
export function useCanvasDocument(_profile: string) {
  const data = useContext(CanvasDocumentContext);
  if (!data) throw Error("CanvasDocumentProvider is required.");
  return data;
}
