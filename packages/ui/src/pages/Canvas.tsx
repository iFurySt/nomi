import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  PointerEvent as ReactPointerEvent,
  DragEvent as ReactDragEvent,
} from "react";
import {
  Shapes,
  MousePointer2,
  Hand,
  Plus,
  Minus,
  Maximize2,
  FilePlus2,
  ImagePlus,
  Paperclip,
  FlaskConical,
  Undo2,
  Redo2,
  Code2,
  Copy,
  Trash2,
  Pencil,
  Check,
  Layers,
  Download,
  X,
  Magnet,
  MoveUpRight,
} from "lucide-react";
import {
  newCanvasId,
  parseCanvasDocument,
  screenToWorld,
  zoomCanvasAt,
  resizeCanvasPlacement,
  snapCanvasLayout,
  snapCanvasResize,
  canvasSelectionBounds,
  canvasArrange,
  canvasTransformSelection,
  canvasShapeNames,
  CANVAS_SHAPES,
  type CanvasAlign,
  type CanvasShapeStyle,
  type CanvasDocument,
  canvasEndpointPoint,
  canvasPort,
  canvasConnectorGeometry,
  reconnectCanvasEndpoint,
  dragCanvasEndpoint,
  nearestCanvasEndpoint,
  temperatureProgram,
  type CanvasCamera,
  type CanvasCommand,
  type Placement,
  type CanvasBlock,
  type CanvasAsset,
  type CanvasResizeDirection,
  type CanvasRect,
  type CanvasGuide,
  type CanvasEndpoint,
  type CanvasConnector,
  type CanvasSide,
  type CanvasPoint,
} from "@nomi/core";
import {
  canvasAssetDigest,
  canvasImageMime,
  readCanvasCamera,
  writeCanvasCamera,
  type CanvasAssetWrite,
} from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { Modal, Button } from "../components/primitives";
import { useCanvasDocument } from "../canvas/useCanvasDocument";
import { CanvasContent, NoteTitle } from "../canvas/CanvasContent";
import {
  CanvasConnections,
  type ConnectionDraft,
} from "../canvas/CanvasConnections";
import {
  buildCanvasExamples,
  canvasExampleStops,
  createCanvasExampleImage,
} from "../canvas/examples";
import {
  ConnectorToolbar,
  type ConnectorAction,
} from "../canvas/ConnectorToolbar";
import { detachedConnector, connectorPng } from "../canvas/connectorClipboard";
import {
  SelectionToolbar,
  type SelectionAction,
} from "../canvas/SelectionToolbar";
import {
  selectionSnapshot,
  selectionCopyText,
  parseSelectionCopy,
  pasteSelection,
  selectionPng,
} from "../canvas/selectionClipboard";
import "../canvas/canvas.css";
export function Canvas() {
  const { status } = useChatGPT();
  const profile = status?.activeProfileId ?? "local-device";
  return <CanvasWorkspace key={profile} profile={profile} />;
}
type Gesture = {
  pointer: number;
  kind: "pan" | "move" | "resize" | "connect" | "segment" | "marquee";
  members?: CanvasRect[];
  toggleOff?: string[];
  selection?: string[];
  connector?: CanvasConnector;
  points?: CanvasPoint[];
  segment?: number;
  start: { x: number; y: number };
  camera: CanvasCamera;
  place?: Placement;
  direction?: CanvasResizeDirection;
  height?: number;
  others?: CanvasRect[];
  capture?: Element;
};
const resizeDirections: { direction: CanvasResizeDirection; label: string }[] =
  [
    { direction: "n", label: "上边" },
    { direction: "ne", label: "右上角" },
    { direction: "e", label: "右边" },
    { direction: "se", label: "右下角" },
    { direction: "s", label: "下边" },
    { direction: "sw", label: "左下角" },
    { direction: "w", label: "左边" },
    { direction: "nw", label: "左上角" },
  ];
const isTyping = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input,textarea,select,[contenteditable="true"]');
export function CanvasWorkspace({ profile }: { profile: string }) {
  const data = useCanvasDocument(profile),
    doc = data.document;
  const viewport = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<CanvasCamera>(
    () =>
      readCanvasCamera(profile, "document.home") ?? {
        x: 70,
        y: 80,
        zoom: 0.75,
      },
  );
  const cameraRef = useRef(camera),
    [tool, setTool] = useState<"select" | "hand" | "connect">("select"),
    toolRef = useRef(tool);
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.at(-1) ?? null;
  const setSelected = (id: string | null) => setSelection(id ? [id] : []);
  const [editing, setEditing] = useState<string | null>(null),
    [focus, setFocus] = useState<string | null>(null);
  const [snap, setSnap] = useState(true),
    [guides, setGuides] = useState<CanvasGuide[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [selectedConnector, setSelectedConnector] = useState<string | null>(
    null,
  );
  const [connection, setConnection] = useState<ConnectionDraft | null>(null);
  const connectionRef = useRef<ConnectionDraft | null>(null);
  const [connectorPreview, setConnectorPreview] =
    useState<CanvasConnector | null>(null);
  const connectorPreviewRef = useRef<CanvasConnector | null>(null);
  const [editConnectorLabel, setEditConnectorLabel] = useState(false);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [multiPreview, setMultiPreview] = useState<
    Record<string, Partial<Placement>>
  >({});
  const multiPreviewRef = useRef<Record<string, Partial<Placement>>>({});
  const selectionClipboard = useRef<CanvasDocument | null>(null);
  const [shapeCopiedStyle, setShapeCopiedStyle] = useState<{
    tone: Extract<CanvasBlock, { type: "shape" }>["tone"];
    style: CanvasShapeStyle;
  } | null>(null);
  const selectionActionRef = useRef<
    (action: SelectionAction, text?: string) => void
  >(() => {});
  const arrangeRef = useRef<(action: CanvasAlign) => void>(() => {});
  const [viewSize, setViewSize] = useState({ width: 1200, height: 800 });
  const [copiedStyle, setCopiedStyle] =
    useState<Partial<CanvasConnector> | null>(null);
  const connectorClipboard = useRef<CanvasConnector | null>(null);
  const connectorActionRef = useRef<
    (action: ConnectorAction, text?: string) => void
  >(() => {});
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () =>
      setViewSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [!!doc]);
  const [outline, setOutline] = useState(false),
    [message, setMessage] = useState("");
  const [dsl, setDsl] = useState<string | null>(null),
    [dslError, setDslError] = useState("");
  const sourceRevision = useRef(0);
  const [gesturePreview, setGesturePreview] =
      useState<Partial<Placement> | null>(null),
    gesture = useRef<Gesture | null>(null),
    previewRef = useRef<Partial<Placement> | null>(null);
  const space = useRef(false),
    attachTarget = useRef<string | undefined>(undefined);
  const [addingExamples, setAddingExamples] = useState(false),
    [exampleIndex, setExampleIndex] = useState(0);
  const pendingExample = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState(false),
    [adding, setAdding] = useState(false);
  const rectangles: CanvasRect[] = (doc?.board.placements ?? []).map((p) => ({
    ...p,
    ...multiPreview[p.id],
    ...(gesturePreview?.id === p.id ? gesturePreview : {}),
    height:
      gesturePreview?.id === p.id
        ? (gesturePreview.height ?? p.height ?? heights[p.id] ?? 300)
        : (multiPreview[p.id]?.height ?? p.height ?? heights[p.id] ?? 300),
    ...(() => {
      const b = doc?.blocks.find((b) => b.id === p.content);
      return b?.type === "shape"
        ? { shape: b.shape, shapeStyle: b.shapeStyle }
        : {};
    })(),
  }));
  useLayoutEffect(() => {
    if (!doc || !viewport.current) return;
    const elements = [
      ...viewport.current.querySelectorAll<HTMLElement>("[data-placement]"),
    ];
    const measure = () => {
      const next = Object.fromEntries(
        elements.map((el) => [el.dataset.placement!, el.offsetHeight]),
      );
      setHeights((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc?.board.placements]);
  const updateConnection = (draft: ConnectionDraft | null) => {
    connectionRef.current = draft;
    setConnection(draft);
  };
  const pan = (next: CanvasCamera) => {
    cameraRef.current = next;
    setCamera(next);
  };
  const saveView = () => {
    if (doc) writeCanvasCamera(profile, doc.id, cameraRef.current);
  };
  toolRef.current = tool;
  const edit = (
    commands: CanvasCommand[],
    group?: string,
    assets: CanvasAssetWrite[] = [],
  ) => {
    try {
      setMessage("");
      return data.edit(commands, group, assets);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const finishEditing = () => {
    data.endGroup();
    setEditing(null);
  };
  const startEditing = (placementId: string) => {
    if (
      data.current.current?.board.placements.find((p) => p.id === placementId)
        ?.locked
    )
      return;
    data.endGroup();
    setSelected(placementId);
    setEditing(placementId);
    setTool("select");
    setSelectedConnector(null);
  };
  const expandNote = (noteId: string) => {
    finishEditing();
    setFocus(noteId);
  };
  useLayoutEffect(() => {
    if (!editing) return;
    viewport.current
      ?.querySelector<HTMLTextAreaElement>(
        `[data-placement="${editing}"] [data-markdown], [data-placement="${editing}"] [data-shape-text]`,
      )
      ?.focus({ preventScroll: true });
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const outside = (event: PointerEvent) => {
      const card = viewport.current?.querySelector(
        `[data-placement="${editing}"]`,
      );
      if (event.target instanceof Node && !card?.contains(event.target))
        finishEditing();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [editing]);
  const center = () => {
    const v = viewport.current;
    return screenToWorld(cameraRef.current, {
      x: (v?.clientWidth ?? 1000) / 2,
      y: (v?.clientHeight ?? 700) / 2,
    });
  };
  const createNote = (point = center(), source = "") => {
    const n = newCanvasId("note"),
      b = newCanvasId("text"),
      p = newCanvasId("place");
    const result = edit([
      {
        type: "create_note",
        note: { id: n, title: "", blocks: [b] },
        block: { id: b, type: "markdown", source },
        placement: {
          id: p,
          content: n,
          x: point.x - 210,
          y: point.y - 80,
          width: 430,
        },
      },
    ]);
    if (result) {
      setSelected(p);
      setEditing(p);
      setTool("select");
    }
  };
  const createShape = (
    shape: Extract<CanvasBlock, { type: "shape" }>["shape"],
  ) => {
    const b = newCanvasId("shape"),
      p = newCanvasId("place"),
      point = center();
    const result = edit([
      {
        type: "add_block",
        block: { id: b, type: "shape", shape, text: "", tone: "neutral" },
        placement: {
          id: p,
          content: b,
          x: point.x - 140,
          y: point.y - 90,
          width: 280,
          height: 180,
        },
      },
    ]);
    if (result) {
      startEditing(p);
    }
  };
  const selectConnector = (id: string) => {
    finishEditing();
    setSelected(null);
    setSelectedConnector(id);
    setEditConnectorLabel(false);
    setTool("select");
  };
  const connectFrom = (
    event: ReactPointerEvent,
    from: CanvasEndpoint,
    reconnect?: ConnectionDraft["reconnect"],
  ) => {
    if (event.button !== 0 || space.current || tool === "hand") return;
    event.preventDefault();
    event.stopPropagation();
    finishEditing();
    setSelected(null);
    setEditConnectorLabel(false);
    (document.activeElement as HTMLElement | null)?.blur();
    viewport.current?.focus({ preventScroll: true });
    viewport.current?.setPointerCapture(event.pointerId);
    const original = reconnect
      ? data.current.current?.board.connectors?.find(
          (c) => c.id === reconnect.id,
        )
      : undefined;
    const moving = original && reconnect ? original[reconnect.end] : from;
    updateConnection({
      from,
      point: canvasEndpointPoint(moving, rectangles)!,
      target: reconnect ? moving : null,
      reconnect,
      selfArmed: !!reconnect,
    });
    setSelectedConnector(reconnect?.id ?? null);
    gesture.current = {
      pointer: event.pointerId,
      kind: "connect",
      start: { x: event.clientX, y: event.clientY },
      camera: cameraRef.current,
    };
  };
  const addInteractive = (noteId?: string) => {
    const b = newCanvasId("interactive"),
      p = newCanvasId("place"),
      point = center();
    const result = edit([
      {
        type: "add_block",
        block: { id: b, type: "interactive", program: temperatureProgram },
        ...(noteId
          ? { noteId }
          : {
              placement: {
                id: p,
                content: b,
                x: point.x - 330,
                y: point.y - 120,
                width: 700,
              },
            }),
      },
    ]);
    if (result && !noteId) {
      setSelected(p);
      setTool("select");
    }
  };
  const attach = (noteId?: string) => {
    attachTarget.current = noteId;
    fileInput.current?.click();
  };
  const addFiles = async (files: File[], point = center(), noteId?: string) => {
    if (!files.length) return;
    if (files.length > 10) {
      setMessage("每次最多添加 10 个文件。");
      return;
    }
    setAdding(true);
    setMessage("");
    try {
      const commands: CanvasCommand[] = [],
        originals: CanvasAssetWrite[] = [];
      for (const [index, file] of files.entries()) {
        const mime = await canvasImageMime(file),
          sha256 = await canvasAssetDigest(file);
        const asset: CanvasAsset = {
          id: newCanvasId("asset"),
          name: file.name.slice(0, 255) || "附件",
          mime: mime ?? (file.type.slice(0, 128) || "application/octet-stream"),
          bytes: file.size,
          sha256,
        };
        if (mime) {
          try {
            const bitmap = await createImageBitmap(file);
            if (
              bitmap.width > 32768 ||
              bitmap.height > 32768 ||
              bitmap.width * bitmap.height > 64e6
            ) {
              bitmap.close();
              throw Error("图片尺寸过大。");
            }
            asset.width = bitmap.width;
            asset.height = bitmap.height;
            bitmap.close();
          } catch {
            throw Error(`无法解码图片 ${asset.name}，请检查文件。`);
          }
        }
        const block: CanvasBlock = {
          id: newCanvasId(mime ? "image" : "file"),
          type: mime ? "image" : "file",
          asset: asset.id,
        };
        commands.push({
          type: "add_block",
          block,
          asset,
          ...(noteId
            ? { noteId }
            : {
                placement: {
                  id: newCanvasId("place"),
                  content: block.id,
                  x: point.x + index * 32,
                  y: point.y + index * 32,
                  width: mime ? 420 : 340,
                },
              }),
        });
        originals.push({ asset, blob: file });
      }
      edit(commands, undefined, originals);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAdding(false);
    }
  };
  const fit = () => {
    const current = data.current.current,
      v = viewport.current;
    if (!current || !v) return;
    const bounds = current.board.placements.map((p) => {
      const el = v.querySelector(
        `[data-placement="${p.id}"]`,
      ) as HTMLElement | null;
      return {
        x: p.x,
        y: p.y,
        width: p.width,
        height: el ? el.offsetHeight : 500,
      };
    });
    if (!bounds.length) {
      pan({ x: v.clientWidth / 2, y: v.clientHeight / 2, zoom: 1 });
      saveView();
      return;
    }
    const left = Math.min(...bounds.map((p) => p.x)),
      right = Math.max(...bounds.map((p) => p.x + p.width));
    const top = Math.min(...bounds.map((p) => p.y)),
      bottom = Math.max(...bounds.map((p) => p.y + p.height));
    const zoom = Math.min(
      1,
      Math.max(
        0.2,
        Math.min(
          (v.clientWidth - 100) / (right - left),
          (v.clientHeight - 160) / (bottom - top),
        ),
      ),
    );
    pan({
      zoom,
      x: (v.clientWidth - (right - left) * zoom) / 2 - left * zoom,
      y: 90 + (v.clientHeight - 170 - (bottom - top) * zoom) / 2 - top * zoom,
    });
    saveView();
  };
  const focusExample = (index: number) => {
    const stop = canvasExampleStops[index],
      v = viewport.current,
      current = data.current.current;
    const p = current?.board.placements.find((p) => p.id === stop?.id);
    if (!p || !v) return;
    const card = v.querySelector<HTMLElement>(`[data-placement="${p.id}"]`);
    const height = card?.offsetHeight ?? 540;
    const zoom = Math.max(
      0.2,
      Math.min(
        1,
        (v.clientWidth - 100) / p.width,
        (v.clientHeight - 190) / height,
      ),
    );
    setSelected(p.id);
    setEditing(null);
    setExampleIndex(index);
    pan({
      zoom,
      x: (v.clientWidth - p.width * zoom) / 2 - p.x * zoom,
      y: 100 + (v.clientHeight - 190 - height * zoom) / 2 - p.y * zoom,
    });
    saveView();
  };
  const stepExample = (step: number) => {
    for (let offset = 1; offset <= canvasExampleStops.length; offset++) {
      const index =
        (exampleIndex + step * offset + canvasExampleStops.length * 2) %
        canvasExampleStops.length;
      if (
        data.current.current?.board.placements.some(
          (p) => p.id === canvasExampleStops[index].id,
        )
      ) {
        focusExample(index);
        return;
      }
    }
  };
  const addExamples = async () => {
    if (addingExamples || !data.current.current) return;
    setAddingExamples(true);
    setMessage("");
    try {
      const image = await createCanvasExampleImage();
      let before = data.current.current;
      let examples = await buildCanvasExamples(before, image);
      if (data.current.current !== before) {
        before = data.current.current!;
        examples = await buildCanvasExamples(before, image);
      }
      if (examples.commands.length) {
        pendingExample.current = 0;
        if (!edit(examples.commands, undefined, examples.assets))
          pendingExample.current = null;
      } else focusExample(0);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAddingExamples(false);
    }
  };
  useLayoutEffect(() => {
    if (pendingExample.current !== null) {
      const index = pendingExample.current;
      pendingExample.current = null;
      focusExample(index);
    }
  }, [doc]);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    if (!doc || initialized.current) return;
    initialized.current = true;
    if (!readCanvasCamera(profile, doc.id)) fit();
  }, [doc, profile]);
  useEffect(() => {
    const save = () =>
      writeCanvasCamera(profile, "document.home", cameraRef.current);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [profile]);
  useEffect(() => {
    const v = viewport.current;
    if (!v || !doc) return;
    const wheel = (event: WheelEvent) => {
      const rect = v.getBoundingClientRect(),
        target = event.target as Element;
      if (
        !(event.ctrlKey || event.metaKey) &&
        toolRef.current !== "hand" &&
        !space.current &&
        (isTyping(target) ||
          (() => {
            const scroll = target.closest<HTMLElement>("[data-canvas-scroll]");
            return scroll && scroll.scrollHeight > scroll.clientHeight + 1;
          })())
      ) {
        return;
      }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        pan(
          zoomCanvasAt(
            cameraRef.current,
            cameraRef.current.zoom * Math.exp(-event.deltaY * 0.008),
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
          ),
        );
      } else {
        const scale =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? v.clientHeight
              : 1;
        pan({
          ...cameraRef.current,
          x: Math.max(
            -1e7,
            Math.min(1e7, cameraRef.current.x - event.deltaX * scale),
          ),
          y: Math.max(
            -1e7,
            Math.min(1e7, cameraRef.current.y - event.deltaY * scale),
          ),
        });
      }
      writeCanvasCamera(profile, doc.id, cameraRef.current);
    };
    v.addEventListener("wheel", wheel, { passive: false });
    return () => v.removeEventListener("wheel", wheel);
  }, [!!doc, profile]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.querySelector('[role="dialog"]'))
        return;
      if (event.code === "Space") {
        event.preventDefault();
        space.current = true;
        viewport.current?.classList.add("space-panning");
      }
      if (event.key === "Escape") {
        const active = gesture.current;
        if (active?.capture?.hasPointerCapture(active.pointer))
          active.capture.releasePointerCapture(active.pointer);
        else if (active && viewport.current?.hasPointerCapture(active.pointer))
          viewport.current.releasePointerCapture(active.pointer);
        gesture.current = null;
        previewRef.current = null;
        setGesturePreview(null);
        setSelected(null);
        setEditing(null);
        setTool("select");
        setGuides([]);
        updateConnection(null);
        connectorPreviewRef.current = null;
        setConnectorPreview(null);
        setEditConnectorLabel(false);
        setSelectedConnector(null);
        setMarquee(null);
        multiPreviewRef.current = {};
        setMultiPreview({});
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? data.redo() : data.undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        data.redo();
      }
      const mod = event.metaKey || event.ctrlKey,
        k = event.key.toLowerCase();
      if (mod && k === "a") {
        event.preventDefault();
        setSelection(
          (data.current.current?.board.placements ?? [])
            .filter((p) => !p.locked)
            .map((p) => p.id),
        );
        setSelectedConnector(null);
        return;
      }
      if (!selectedConnector && mod && k === "v") {
        event.preventDefault();
        selectionActionRef.current(event.altKey ? "paste-style" : "paste");
        return;
      }
      if (selection.length && !selectedConnector) {
        if (mod && k === "c") {
          event.preventDefault();
          selectionActionRef.current(
            event.altKey
              ? "copy-style"
              : event.shiftKey
                ? "copy-image"
                : "copy",
          );
          return;
        }
        if (mod && k === "g") {
          event.preventDefault();
          selectionActionRef.current(event.shiftKey ? "ungroup" : "group");
          return;
        }
        if (mod && event.altKey && k === "l") {
          event.preventDefault();
          selectionActionRef.current(
            data.current.current?.board.placements.some(
              (p) => selection.includes(p.id) && p.locked,
            )
              ? "unlock"
              : "lock",
          );
          return;
        }
        if (event.shiftKey && !mod && ["h", "v"].includes(k)) {
          event.preventDefault();
          selectionActionRef.current(k === "h" ? "flip-x" : "flip-y");
          return;
        }
        if (
          event.ctrlKey &&
          event.altKey &&
          ["KeyH", "KeyV"].includes(event.code)
        ) {
          event.preventDefault();
          arrangeRef.current(event.code === "KeyH" ? "horizontal" : "vertical");
          return;
        }
        if (event.altKey && !mod) {
          const actions: Record<string, CanvasAlign> = {
            KeyA: "left",
            KeyH: "center",
            KeyD: "right",
            KeyW: "top",
            KeyV: "middle",
            KeyS: "bottom",
          };
          const a = actions[event.code];
          if (a) {
            event.preventDefault();
            arrangeRef.current(a);
            return;
          }
        }
      }
      if (
        selected &&
        !gesture.current &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const places =
          data.current.current?.board.placements.filter(
            (p) => selection.includes(p.id) && !p.locked,
          ) ?? [];
        const step = event.shiftKey ? 10 : 1;
        if (places.length)
          edit(
            places.map((p) => ({
              type: "move",
              id: p.id,
              x: Math.max(
                -1e6,
                Math.min(
                  1e6,
                  p.x +
                    (event.key === "ArrowLeft"
                      ? -step
                      : event.key === "ArrowRight"
                        ? step
                        : 0),
                ),
              ),
              y: Math.max(
                -1e6,
                Math.min(
                  1e6,
                  p.y +
                    (event.key === "ArrowUp"
                      ? -step
                      : event.key === "ArrowDown"
                        ? step
                        : 0),
                ),
              ),
            })),
            `nudge:${selection.join(",")}`,
          );
      }
      if (
        selected &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        selectionActionRef.current("duplicate");
        return;
      }
      if (selectedConnector) {
        const mod = event.metaKey || event.ctrlKey,
          k = event.key.toLowerCase();
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          connectorActionRef.current("delete");
          return;
        }
        if (mod && k === "c") {
          event.preventDefault();
          connectorActionRef.current(
            event.shiftKey
              ? "copy-image"
              : event.altKey
                ? "copy-style"
                : "copy",
          );
          return;
        }
        if (mod && k === "v" && event.altKey) {
          event.preventDefault();
          connectorActionRef.current("paste-style");
          return;
        }
        if (mod && k === "d") {
          event.preventDefault();
          connectorActionRef.current("duplicate");
          return;
        }
        if (mod && event.shiftKey && k === "l") {
          event.preventDefault();
          const c = data.current.current?.board.connectors?.find(
            (c) => c.id === selectedConnector,
          );
          if (c)
            edit([
              {
                type: "update_connector",
                connector: { ...c, locked: !c.locked },
              },
            ]);
          return;
        }
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selected) {
        event.preventDefault();
        selectionActionRef.current("delete");
      }
    };
    const release = (event: Event) => {
      space.current = false;
      viewport.current?.classList.remove("space-panning");
      if (event instanceof KeyboardEvent && event.key.startsWith("Arrow"))
        data.endGroup();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", release);
    };
  }, [selection.join(","), selectedConnector, data.document, dsl, focus]);
  const begin = (
    event: ReactPointerEvent,
    kind: Gesture["kind"],
    place?: Placement,
    direction?: CanvasResizeDirection,
  ) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    const groupIds = place?.group
      ? rectangles.filter((r) => r.group === place.group).map((r) => r.id)
      : place
        ? [place.id]
        : [];
    const ids = place
      ? selection.includes(place.id)
        ? selection
        : groupIds
      : [];
    const members = rectangles.filter((r) => ids.includes(r.id));
    if (place && kind !== "pan" && members.some((r) => r.locked)) {
      setSelection(ids);
      setSelectedConnector(null);
      return;
    }
    const groupBounds =
      members.length > 1 ? canvasSelectionBounds(members) : null;
    if (kind === "resize" && isTyping(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    const capture =
      kind === "move" &&
      place &&
      data.current.current?.blocks.some(
        (b) => b.id === place.content && b.type === "shape",
      )
        ? (event.target as Element)
        : viewport.current!;
    capture.setPointerCapture(event.pointerId);
    gesture.current = {
      pointer: event.pointerId,
      kind,
      start: { x: event.clientX, y: event.clientY },
      camera: cameraRef.current,
      place: groupBounds ?? place,
      members,
      toggleOff:
        place && event.shiftKey && selection.includes(place.id)
          ? groupIds
          : undefined,
      selection: [...selection],
      capture,
      direction,
      height:
        groupBounds?.height ??
        (event.currentTarget as HTMLElement).closest<HTMLElement>(
          "[data-placement]",
        )?.offsetHeight,
      others: rectangles.filter(
        (r) =>
          !ids.includes(r.id) &&
          (r.x + r.width) * cameraRef.current.zoom + cameraRef.current.x >= 0 &&
          (r.y + r.height) * cameraRef.current.zoom + cameraRef.current.y >=
            0 &&
          r.x * cameraRef.current.zoom + cameraRef.current.x <=
            viewport.current!.clientWidth &&
          r.y * cameraRef.current.zoom + cameraRef.current.y <=
            viewport.current!.clientHeight,
      ),
    };
    if (place) {
      setSelection(ids);
      setSelectedConnector(null);
    }
  };
  const move = (event: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    const dx = event.clientX - g.start.x,
      dy = event.clientY - g.start.y;
    if (g.kind === "marquee") {
      const box = viewport.current!.getBoundingClientRect(),
        a = screenToWorld(g.camera, {
          x: g.start.x - box.left,
          y: g.start.y - box.top,
        }),
        b = screenToWorld(g.camera, {
          x: event.clientX - box.left,
          y: event.clientY - box.top,
        });
      const area = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      };
      setMarquee(area);
      if (Math.hypot(dx, dy) > 4) {
        const hits = rectangles
          .filter(
            (r) =>
              !r.locked &&
              r.x < area.x + area.width &&
              r.x + r.width > area.x &&
              r.y < area.y + area.height &&
              r.y + r.height > area.y,
          )
          .map((r) => r.id);
        const groups = new Set(
          rectangles
            .filter((r) => hits.includes(r.id) && r.group)
            .map((r) => r.group),
        );
        setSelection([
          ...new Set([
            ...(event.shiftKey ? (g.selection ?? []) : []),
            ...rectangles
              .filter(
                (r) => hits.includes(r.id) || (r.group && groups.has(r.group)),
              )
              .map((r) => r.id),
          ]),
        ]);
      }
      return;
    }
    if (
      g.kind === "segment" &&
      g.connector &&
      g.points &&
      g.segment !== undefined
    ) {
      const points = g.points.map((p) => ({ ...p })),
        i = g.segment;
      const vertical =
        Math.abs(points[i + 1].y - points[i].y) >
        Math.abs(points[i + 1].x - points[i].x);
      const axis = vertical ? "x" : "y";
      let delta = (vertical ? dx : dy) / g.camera.zoom;
      const segmentGuides: CanvasGuide[] = [];
      if (snap && !event.altKey) {
        const candidates = (data.current.current?.board.connectors ?? [])
          .filter((c) => c.id !== g.connector!.id)
          .flatMap((c) => {
            const path = canvasConnectorGeometry(c, rectangles);
            return (
              path?.points.slice(1).flatMap((p, j) => {
                const a = path.points[j];
                return (vertical ? p.x === a.x : p.y === a.y)
                  ? [
                      {
                        value: p[axis],
                        from: Math.min(
                          a[vertical ? "y" : "x"],
                          p[vertical ? "y" : "x"],
                        ),
                        to: Math.max(
                          a[vertical ? "y" : "x"],
                          p[vertical ? "y" : "x"],
                        ),
                      },
                    ]
                  : [];
              }) ?? []
            );
          });
        const value = points[i][axis] + delta,
          hit = candidates.sort(
            (a, b) => Math.abs(a.value - value) - Math.abs(b.value - value),
          )[0];
        if (hit && Math.abs(hit.value - value) <= 5 / g.camera.zoom) {
          delta = hit.value - points[i][axis];
          segmentGuides.push({
            axis,
            position: hit.value,
            from:
              Math.min(hit.from, points[i][vertical ? "y" : "x"]) -
              12 / g.camera.zoom,
            to:
              Math.max(hit.to, points[i + 1][vertical ? "y" : "x"]) +
              12 / g.camera.zoom,
          });
        }
      }
      setGuides(segmentGuides);
      if (delta === 0) {
        connectorPreviewRef.current = null;
        setConnectorPreview(null);
        return;
      }
      // Add doglegs beside bound endpoints rather than moving the binding.
      if (points.length === 2) {
        const a = points[0],
          b = points[1];
        if (vertical) {
          const y1 = a.y + (b.y - a.y) * 0.25,
            y2 = a.y + (b.y - a.y) * 0.75;
          points.splice(
            1,
            0,
            { x: a.x, y: y1 },
            { x: a.x + delta, y: y1 },
            { x: b.x + delta, y: y2 },
            { x: b.x, y: y2 },
          );
        } else {
          const x1 = a.x + (b.x - a.x) * 0.25,
            x2 = a.x + (b.x - a.x) * 0.75;
          points.splice(
            1,
            0,
            { x: x1, y: a.y },
            { x: x1, y: a.y + delta },
            { x: x2, y: b.y + delta },
            { x: x2, y: b.y },
          );
        }
      } else if (i === 0) {
        const mid = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        points.splice(
          1,
          0,
          mid,
          { ...mid, [axis]: mid[axis] + delta },
          { ...points[1], [axis]: points[1][axis] + delta },
        );
      } else if (i === points.length - 2) {
        const mid = {
          x: (points[i].x + points[i + 1].x) / 2,
          y: (points[i].y + points[i + 1].y) / 2,
        };
        points.splice(
          i + 1,
          0,
          { ...points[i], [axis]: points[i][axis] + delta },
          { ...mid, [axis]: mid[axis] + delta },
          mid,
        );
      } else {
        points[i][axis] += delta;
        points[i + 1][axis] += delta;
      }
      connectorPreviewRef.current = {
        ...g.connector,
        waypoints: points.slice(1, -1),
      };
      setConnectorPreview(connectorPreviewRef.current);
      return;
    }
    if (g.kind === "connect") {
      const draft = connectionRef.current;
      if (!draft) return;
      if (draft.reconnect && Math.hypot(dx, dy) <= 4 && !draft.dragged) return;
      const r = viewport.current!.getBoundingClientRect();
      const point = screenToWorld(cameraRef.current, {
        x: event.clientX - r.left,
        y: event.clientY - r.top,
      });
      const fixedPoint = canvasEndpointPoint(draft.from, rectangles)!;
      const selfArmed =
        draft.selfArmed ||
        Math.hypot(point.x - fixedPoint.x, point.y - fixedPoint.y) *
          cameraRef.current.zoom >=
          32;
      const target = dragCanvasEndpoint(
        point,
        draft.from,
        rectangles,
        draft.target,
        cameraRef.current.zoom,
        selfArmed,
      );
      const original: CanvasConnector | undefined = draft.reconnect
        ? data.current.current?.board.connectors?.find(
            (c) => c.id === draft.reconnect?.id,
          )
        : {
            id: "preview.connection",
            from: draft.from,
            to: target,
            routing: "rounded",
            style: "solid",
            startArrow: false,
            endArrow: true,
            label: "",
          };
      updateConnection({
        ...draft,
        point,
        target,
        dragged: true,
        selfArmed,
        preview: original
          ? reconnectCanvasEndpoint(
              original,
              draft.reconnect?.end ?? "to",
              point,
              target,
              rectangles,
              {
                previous: draft.preview,
                zoom: cameraRef.current.zoom,
              },
            )
          : undefined,
      });
      return;
    }
    if (dx === 0 && dy === 0 && !previewRef.current) return;
    if (g.kind === "pan")
      pan({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
    else if (g.kind === "move") {
      const axis = event.shiftKey
        ? Math.abs(dx) >= Math.abs(dy)
          ? "x"
          : "y"
        : null;
      const moving = {
        ...g.place!,
        height: g.height!,
        x: Math.max(
          -1e6,
          Math.min(1e6, g.place!.x + (axis === "y" ? 0 : dx) / g.camera.zoom),
        ),
        y: Math.max(
          -1e6,
          Math.min(1e6, g.place!.y + (axis === "x" ? 0 : dy) / g.camera.zoom),
        ),
      };
      const snapped =
        snap && !event.altKey
          ? snapCanvasLayout(moving, g.others!, g.camera.zoom)
          : { x: moving.x, y: moving.y, guides: [] };
      setGuides(
        snapped.guides.filter((guide) => axis === null || guide.axis === axis),
      );
      previewRef.current = {
        id: g.place!.id,
        x: axis === "y" ? moving.x : Math.max(-1e6, Math.min(1e6, snapped.x)),
        y: axis === "x" ? moving.y : Math.max(-1e6, Math.min(1e6, snapped.y)),
      };
    } else {
      const members = g.members ?? [],
        bounds = g.place!,
        isShape = members.length === 1 && !!members[0].shape;
      const limits =
        members.length > 1
          ? {
              minWidth:
                bounds.width *
                Math.max(...members.map((r) => (r.shape ? 16 : 160) / r.width)),
              minHeight:
                g.height! *
                Math.max(
                  ...members.map((r) => (r.shape ? 16 : 120) / r.height),
                ),
              maxWidth:
                bounds.width * Math.min(...members.map((r) => 1600 / r.width)),
              maxHeight:
                g.height! * Math.min(...members.map((r) => 2400 / r.height)),
            }
          : {
              minWidth: isShape ? 16 : 160,
              minHeight: isShape ? 16 : 120,
              maxWidth: 1600,
              maxHeight: 2400,
            };
      let wx = dx / g.camera.zoom,
        wy = dy / g.camera.zoom;
      if (event.shiftKey && g.direction!.length === 2) {
        const ratio = bounds.width / g.height!;
        if (Math.abs(wx) > Math.abs(wy * ratio))
          wy =
            (wx / ratio) *
            (g.direction === "ne" || g.direction === "sw" ? -1 : 1);
        else
          wx =
            wy *
            ratio *
            (g.direction === "ne" || g.direction === "sw" ? -1 : 1);
      }
      let resized = resizeCanvasPlacement(
        bounds,
        g.height!,
        g.direction!,
        wx,
        wy,
        limits,
      );
      if (snap && !event.altKey && !event.shiftKey && members.length <= 1) {
        const snapped = snapCanvasResize(
          { ...bounds, height: g.height!, shape: members[0]?.shape },
          {
            ...bounds,
            ...resized,
            height: resized.height ?? g.height!,
            shape: members[0]?.shape,
          },
          g.direction!,
          g.others!,
          g.camera.zoom,
        );
        resized = snapped.rect;
        if (
          bounds.height === undefined &&
          !g.direction!.includes("n") &&
          !g.direction!.includes("s")
        )
          delete resized.height;
        setGuides(snapped.guides);
      } else setGuides([]);
      previewRef.current = { id: g.place!.id, ...resized };
    }
    if ((g.members?.length ?? 0) > 1 && previewRef.current) {
      const next = previewRef.current,
        bounds = g.place!,
        sx = (next.width ?? bounds.width) / bounds.width,
        sy = (next.height ?? g.height!) / g.height!;
      multiPreviewRef.current = Object.fromEntries(
        g.members!.map((r) => [
          r.id,
          {
            x: next.x! + (r.x - bounds.x) * sx,
            y: next.y! + (r.y - bounds.y) * sy,
            ...(g.kind === "resize"
              ? { width: r.width * sx, height: r.height * sy }
              : {}),
          },
        ]),
      );
      setMultiPreview(multiPreviewRef.current);
    }
    setGesturePreview(previewRef.current);
  };
  const previewGroupConnector = (c: CanvasConnector): CanvasConnector => {
    const g = gesture.current,
      next = previewRef.current;
    if (
      !g ||
      !next ||
      (g.members?.length ?? 0) < 2 ||
      !c.waypoints?.length ||
      !g.members!.some((r) => r.id === c.from.placement) ||
      !g.members!.some((r) => r.id === c.to.placement)
    )
      return c;
    const bounds = g.place!,
      sx = (next.width ?? bounds.width) / bounds.width,
      sy = (next.height ?? g.height!) / g.height!;
    return {
      ...c,
      waypoints: c.waypoints.map((p) => ({
        x: next.x! + (p.x - bounds.x) * sx,
        y: next.y! + (p.y - bounds.y) * sy,
      })),
    };
  };
  const end = (event: ReactPointerEvent, cancel = false) => {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    if (g.kind === "connect") {
      const draft = connectionRef.current;
      const dragged =
        Math.hypot(event.clientX - g.start.x, event.clientY - g.start.y) > 4;
      if (!cancel && draft && dragged) {
        const target: CanvasEndpoint = draft.target ?? {
          point: draft.point,
          side:
            draft.from.side === "e"
              ? "w"
              : draft.from.side === "w"
                ? "e"
                : draft.from.side === "n"
                  ? "s"
                  : "n",
        };
        const old = data.current.current?.board.connectors?.find(
          (c) => c.id === draft.reconnect?.id,
        );
        if (draft.reconnect && old)
          edit([
            {
              type: "update_connector",
              connector:
                draft.preview ??
                reconnectCanvasEndpoint(
                  old,
                  draft.reconnect.end,
                  draft.point,
                  draft.target,
                  rectangles,
                ),
            },
          ]);
        else if (!draft.reconnect) {
          const id = newCanvasId("connection");
          edit([
            {
              type: "connect",
              connector: draft.preview
                ? { ...draft.preview, id }
                : {
                    id,
                    from: draft.from,
                    to: target,
                    routing: "rounded",
                    style: "solid",
                    startArrow: false,
                    endArrow: true,
                    label: "",
                  },
            },
          ]);
          setSelected(null);
          setSelectedConnector(id);
          setTool("select");
        }
      }
      updateConnection(null);
    }
    if (g.kind === "segment") {
      if (!cancel && connectorPreviewRef.current)
        edit([
          { type: "update_connector", connector: connectorPreviewRef.current },
        ]);
      connectorPreviewRef.current = null;
      setConnectorPreview(null);
    }
    const gesturePreview = previewRef.current;
    const multi = Object.entries(multiPreviewRef.current);
    if (!cancel && multi.length)
      edit([
        ...multi.flatMap(([id, p]): CanvasCommand[] => [
          { type: "move", id, x: p.x!, y: p.y! },
          ...(p.width !== undefined
            ? [
                {
                  type: "resize" as const,
                  id,
                  width: p.width,
                  height: p.height,
                },
              ]
            : []),
        ]),
        ...(data.current.current?.board.connectors ?? []).flatMap(
          (c): CanvasCommand[] => {
            const connector = previewGroupConnector(c);
            return connector !== c
              ? [{ type: "update_connector", connector }]
              : [];
          },
        ),
      ]);
    else if (!cancel && gesturePreview && g.kind !== "marquee") {
      if (g.kind === "move")
        edit([
          {
            type: "move",
            id: g.place!.id,
            x: gesturePreview.x!,
            y: gesturePreview.y!,
          },
        ]);
      else if (g.kind === "resize")
        edit([
          {
            type: "move",
            id: g.place!.id,
            x: gesturePreview.x!,
            y: gesturePreview.y!,
          },
          {
            type: "resize",
            id: g.place!.id,
            width: gesturePreview.width!,
            ...(gesturePreview.height !== undefined
              ? { height: gesturePreview.height }
              : {}),
          },
        ]);
    }
    if (
      !cancel &&
      g.toggleOff &&
      Math.hypot(event.clientX - g.start.x, event.clientY - g.start.y) < 4
    )
      setSelection(
        (g.selection ?? []).filter((id) => !g.toggleOff!.includes(id)),
      );
    gesture.current = null;
    previewRef.current = null;
    setGesturePreview(null);
    multiPreviewRef.current = {};
    setMultiPreview({});
    setMarquee(null);
    setGuides([]);
    if (g.capture?.hasPointerCapture(event.pointerId))
      g.capture.releasePointerCapture(event.pointerId);
    else if (viewport.current?.hasPointerCapture(event.pointerId))
      viewport.current.releasePointerCapture(event.pointerId);
    saveView();
  };
  const drop = (event: ReactDragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const r = viewport.current!.getBoundingClientRect();
    const noteId = (event.target as Element).closest<HTMLElement>("[data-note]")
      ?.dataset.note;
    void addFiles(
      [...event.dataTransfer.files],
      screenToWorld(cameraRef.current, {
        x: event.clientX - r.left,
        y: event.clientY - r.top,
      }),
      noteId,
    );
  };
  const downloadDsl = () => {
    if (!doc) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.id}.nomi.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (data.loadError)
    return (
      <div className="canvas-load-error" role="alert">
        <h2>画布暂时无法打开</h2>
        <p>{data.loadError}</p>
        <p>本机原内容保持不变。</p>
        <Button onClick={() => location.reload()}>重新读取</Button>
      </div>
    );
  if (!doc)
    return (
      <div className="canvas-loading" role="status">
        正在打开画布…
      </div>
    );
  const content = (contentId: string, isEditing: boolean) => (
    <CanvasContent
      document={doc}
      contentId={contentId}
      profile={profile}
      repository={data.repository}
      editing={isEditing}
      onEdit={edit}
      onAttach={attach}
      onInteractive={addInteractive}
      endGroup={data.endGroup}
    />
  );
  const activeNote = doc.notes.find((n) => n.id === focus);
  const activeConnector = doc.board.connectors?.find(
    (c) => c.id === selectedConnector,
  );
  const changeConnector = (patch: Partial<CanvasConnector>, group?: string) => {
    const latest = data.current.current?.board.connectors?.find(
      (c) => c.id === selectedConnector,
    );
    if (latest?.locked && patch.locked === undefined) {
      setMessage("连接已锁定，请先在更多操作中解锁");
      return;
    }
    if (latest)
      edit(
        [
          {
            type: "update_connector",
            connector: {
              ...latest,
              ...patch,
              ...(patch.labelStyle
                ? { labelStyle: { ...latest.labelStyle, ...patch.labelStyle } }
                : {}),
            },
          },
        ],
        group,
      );
  };
  connectorActionRef.current = (action, clipboardText) => {
    const c = data.current.current?.board.connectors?.find(
      (c) => c.id === selectedConnector,
    );
    const paste = async () => {
      const raw =
        clipboardText ?? (await navigator.clipboard.readText().catch(() => ""));
      let source: CanvasConnector | undefined;
      if (raw) {
        try {
          const value = JSON.parse(raw);
          if (value.schema === "nomi-connector/v1") source = value.connector;
        } catch {}
      }
      source ??= connectorClipboard.current ?? undefined;
      if (!source) throw Error("剪贴板里没有可粘贴的连线");
      const id = newCanvasId("connection");
      const next = detachedConnector(source, rectangles, 24);
      if (edit([{ type: "connect", connector: { ...next, id } }])) {
        setSelected(null);
        setSelectedConnector(id);
      }
    };
    if (action === "paste") {
      void paste().catch((e) => setMessage(e.message));
      return;
    }
    if (!c) return;
    const cloneStyle = () => {
      const { id, from, to, label, waypoints, locked, ...style } = c;
      return style;
    };
    if (action === "copy-style") {
      setCopiedStyle(cloneStyle());
      return;
    }
    if (action === "copy") {
      const copy = detachedConnector(c, rectangles);
      connectorClipboard.current = copy;
      void navigator.clipboard
        .writeText(
          JSON.stringify({ schema: "nomi-connector/v1", connector: copy }),
        )
        .catch(() => setMessage("已复制到画布剪贴板，可从更多操作中粘贴"));
      return;
    }
    if (action === "copy-image") {
      void connectorPng(c, rectangles)
        .then((blob) =>
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]),
        )
        .catch((e) => setMessage(`复制图片失败：${e.message}`));
      return;
    }
    if (c.locked) {
      setMessage("连接已锁定，请先在更多操作中解锁");
      return;
    }
    if (action === "duplicate") {
      const id = newCanvasId("connection");
      if (
        edit([
          {
            type: "connect",
            connector: { ...detachedConnector(c, rectangles, 24), id },
          },
        ])
      )
        setSelectedConnector(id);
      return;
    }
    if (action === "paste-style") {
      if (copiedStyle) changeConnector(copiedStyle);
      return;
    }
    if (action === "delete") {
      edit([{ type: "remove_connector", id: c.id }]);
      setSelectedConnector(null);
      return;
    }
    if (["front", "back", "forward", "backward"].includes(action)) {
      edit([
        {
          type: "reorder_connector",
          id: c.id,
          position: action as "front" | "back" | "forward" | "backward",
        },
      ]);
      return;
    }
    if (action === "rotate") {
      const detached = detachedConnector(c, rectangles),
        geometry = canvasConnectorGeometry(c, rectangles)!;
      const xs = geometry.points.map((p) => p.x),
        ys = geometry.points.map((p) => p.y),
        cx = (Math.min(...xs) + Math.max(...xs)) / 2,
        cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const rotate = (p: CanvasPoint) => ({
          x: cx - (p.y - cy),
          y: cy + (p.x - cx),
        }),
        sides: Record<CanvasSide, CanvasSide> = {
          n: "e",
          e: "s",
          s: "w",
          w: "n",
        };
      edit([
        {
          type: "update_connector",
          connector: {
            ...detached,
            from: {
              point: rotate(detached.from.point!),
              side: sides[c.from.side],
            },
            to: { point: rotate(detached.to.point!), side: sides[c.to.side] },
            waypoints: detached.waypoints?.map(rotate) ?? [],
          },
        },
      ]);
    }
  };
  const selectedRects = rectangles.filter((r) => selection.includes(r.id));
  const selectionBlocks = doc.blocks.filter((b) =>
    selectedRects.some((r) => r.content === b.id),
  );
  const shapeChange = (patch: CanvasShapeStyle, group?: string) => {
    const current = data.current.current;
    if (!current || selectedRects.some((r) => r.locked)) return;
    const commands: CanvasCommand[] = current.blocks
      .filter(
        (b) =>
          b.type === "shape" && selectedRects.some((r) => r.content === b.id),
      )
      .map((b) => {
        const shape = b as Extract<CanvasBlock, { type: "shape" }>;
        return {
          type: "set_shape",
          block: {
            ...shape,
            shapeStyle: {
              ...shape.shapeStyle,
              ...patch,
              ...(patch.text
                ? { text: { ...shape.shapeStyle?.text, ...patch.text } }
                : {}),
            },
          },
        };
      });
    if (commands.length) edit(commands, group);
  };
  arrangeRef.current = (action) => {
    const commands = canvasArrange(selectedRects, action);
    if (commands.length) edit(commands);
  };
  const transformSelectionLines = (
    rects: CanvasRect[],
    action: "rotate" | "flip-x" | "flip-y",
  ): CanvasCommand[] => {
    const bounds = canvasSelectionBounds(rects),
      cx = bounds.x + bounds.width / 2,
      cy = bounds.y + bounds.height / 2;
    return (data.current.current?.board.connectors ?? []).flatMap(
      (c): CanvasCommand[] => {
        if (
          !c.waypoints?.length ||
          !rects.some((r) => r.id === c.from.placement) ||
          !rects.some((r) => r.id === c.to.placement)
        )
          return [];
        return [
          {
            type: "update_connector",
            connector: {
              ...c,
              waypoints: c.waypoints.map((p) => ({
                x:
                  action === "rotate"
                    ? cx - (p.y - cy)
                    : action === "flip-x"
                      ? 2 * cx - p.x
                      : p.x,
                y:
                  action === "rotate"
                    ? cy + (p.x - cx)
                    : action === "flip-y"
                      ? 2 * cy - p.y
                      : p.y,
              })),
            },
          },
        ];
      },
    );
  };
  selectionActionRef.current = (action, clipboardText) => {
    void (async () => {
      const current = data.current.current;
      if (!current) return;
      const rects = rectangles.filter((r) => selection.includes(r.id));
      if (action === "paste") {
        let snapshot = selectionClipboard.current;
        const value =
          clipboardText ??
          (await navigator.clipboard.readText().catch(() => ""));
        if (value.includes('"nomi-connector/v1"')) {
          connectorActionRef.current("paste", value);
          return;
        }
        if (value.includes('"nomi-selection/v1"'))
          snapshot = parseSelectionCopy(value);
        if (!snapshot) throw Error("剪贴板里没有可粘贴的画布选区。");
        const next = pasteSelection(current, snapshot);
        if (edit(next.commands)) {
          setSelection(next.ids);
          setSelectedConnector(null);
        }
        return;
      }
      if (!rects.length) return;
      if (action === "copy") {
        const snapshot = selectionSnapshot(current, selection);
        selectionClipboard.current = snapshot;
        await navigator.clipboard
          .writeText(selectionCopyText(snapshot))
          .catch(() => setMessage("已复制到画布剪贴板，可从更多操作中粘贴。"));
        return;
      }
      if (action === "copy-image") {
        const blob = await selectionPng(current, rects);
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        return;
      }
      if (action === "copy-style") {
        const shape = current.blocks.find(
          (b) => b.type === "shape" && rects.some((r) => r.content === b.id),
        );
        if (shape?.type === "shape")
          setShapeCopiedStyle({
            tone: shape.tone,
            style: structuredClone(shape.shapeStyle ?? {}),
          });
        return;
      }
      if (action === "unlock" || action === "lock") {
        edit(
          rects.map((r) => ({
            type: "set_placement",
            id: r.id,
            locked: action === "lock",
          })),
        );
        finishEditing();
        return;
      }
      if (rects.some((r) => r.locked)) {
        setMessage("选区包含锁定对象，请先解锁。");
        return;
      }
      if (action === "edit") {
        startEditing(rects[0].id);
        return;
      }
      if (action === "duplicate") {
        const next = pasteSelection(
          current,
          selectionSnapshot(current, selection),
        );
        if (edit(next.commands)) setSelection(next.ids);
        return;
      }
      if (action === "delete") {
        edit(rects.map((r) => ({ type: "remove_placement", id: r.id })));
        setSelected(null);
        return;
      }
      if (action === "paste-style" && shapeCopiedStyle) {
        const commands: CanvasCommand[] = current.blocks
          .filter(
            (b): b is Extract<CanvasBlock, { type: "shape" }> =>
              b.type === "shape" && rects.some((r) => r.content === b.id),
          )
          .map((b) => ({
            type: "set_shape",
            block: {
              ...b,
              tone: shapeCopiedStyle.tone,
              shapeStyle: structuredClone(shapeCopiedStyle.style),
            },
          }));
        if (commands.length) edit(commands);
        return;
      }
      if (["front", "back", "forward", "backward"].includes(action)) {
        const ordered =
          action === "back" || action === "forward"
            ? [...rects].reverse()
            : rects;
        edit(
          ordered.map((r) => ({
            type: "reorder",
            id: r.id,
            position: action as "front" | "back" | "forward" | "backward",
          })),
        );
        return;
      }
      if (action === "group" || action === "ungroup") {
        const group = action === "group" ? newCanvasId("group") : null;
        edit(rects.map((r) => ({ type: "set_placement", id: r.id, group })));
        return;
      }
      if (action === "section") {
        const bounds = canvasSelectionBounds(rects),
          group = newCanvasId("group"),
          id = newCanvasId("place"),
          block = newCanvasId("shape");
        const commands: CanvasCommand[] = [
          {
            type: "add_block",
            block: {
              id: block,
              type: "shape",
              shape: "rounded-rectangle",
              tone: "neutral",
              text: "分区",
              shapeStyle: {
                fill: "none",
                stroke: "#aeb4bd",
                strokeStyle: "dashed",
                text: {
                  verticalAlign: "top",
                  align: "left",
                  color: "#7a7f87",
                  size: 14,
                },
              },
            },
            placement: {
              id,
              content: block,
              x: bounds.x - 24,
              y: bounds.y - 48,
              width: bounds.width + 48,
              height: bounds.height + 72,
              group,
            },
          },
          ...rects.map((r) => ({
            type: "set_placement" as const,
            id: r.id,
            group,
          })),
          { type: "reorder", id, position: "back" },
        ];
        if (edit(commands)) setSelection([...selection, id]);
        return;
      }
      if (action === "flip-x" || action === "flip-y") {
        const k = action === "flip-x" ? "flipX" : "flipY",
          commands: CanvasCommand[] = [
            ...canvasTransformSelection(rects, action),
            ...transformSelectionLines(rects, action),
          ];
        for (const b of selectionBlocks)
          if (b.type === "shape")
            commands.push({
              type: "set_shape",
              block: {
                ...b,
                shapeStyle: { ...b.shapeStyle, [k]: !b.shapeStyle?.[k] },
              },
            });
        if (commands.length) edit(commands);
        return;
      }
      if (action === "rotate") {
        const commands: CanvasCommand[] = [],
          changed = new Set<string>();
        for (const r of rects) {
          const b = current.blocks.find((b) => b.id === r.content);
          if (b?.type !== "shape") continue;
          if (!changed.has(b.id)) {
            commands.push({
              type: "set_shape",
              block: {
                ...b,
                shapeStyle: {
                  ...b.shapeStyle,
                  rotation: (((b.shapeStyle?.rotation ?? 0) + 90) % 360) as
                    0 | 90 | 180 | 270,
                },
              },
            });
            changed.add(b.id);
          }
        }
        commands.push(
          ...canvasTransformSelection(
            rects.filter((r) =>
              current.blocks.some(
                (b) => b.id === r.content && b.type === "shape",
              ),
            ),
            "rotate",
          ),
        );
        commands.push(...transformSelectionLines(rects, "rotate"));
        if (commands.length) edit(commands);
      }
    })().catch((error) => setMessage((error as Error).message));
  };
  return (
    <div
      className={`canvas-workspace tool-${tool} ${connection ? "is-connecting" : ""} ${connection?.reconnect ? "is-reconnecting" : ""} ${dragOver ? "is-file-over" : ""}`}
      onPointerUp={(event) => {
        if (gesture.current) end(event);
      }}
      onPointerCancel={(event) => {
        if (gesture.current) end(event, true);
      }}
      onPaste={(event) => {
        if (dsl !== null) return;
        const clipboardText = event.clipboardData.getData("text/plain");
        if (
          !isTyping(event.target) &&
          clipboardText.includes('"nomi-selection/v1"')
        ) {
          event.preventDefault();
          selectionActionRef.current("paste", clipboardText);
          return;
        }
        if (
          !isTyping(event.target) &&
          clipboardText.includes('"nomi-connector/v1"')
        ) {
          event.preventDefault();
          connectorActionRef.current("paste", clipboardText);
          return;
        }
        const files = [...event.clipboardData.files];
        if (files.length) {
          event.preventDefault();
          const noteId =
            focus ??
            (event.target as Element).closest<HTMLElement>("[data-note]")
              ?.dataset.note;
          void addFiles(files, center(), noteId ?? undefined);
        } else if (!isTyping(event.target) && !focus) {
          const source = event.clipboardData.getData("text/plain");
          if (source.trim()) {
            event.preventDefault();
            createNote(center(), source);
          }
        }
      }}
    >
      <div className="canvas-titlebar">
        <button
          aria-label="画布内容"
          title="画布内容"
          onClick={() => setOutline(!outline)}
        >
          <Layers size={18} />
        </button>
        <div>
          <strong>{doc.title}</strong>
          <span role="status">
            {data.saveError
              ? "尚未保存"
              : data.saving
                ? "保存中…"
                : "已保存到本机"}
          </span>
        </div>
      </div>
      <div className="canvas-toolbar" aria-label="画布工具栏">
        <button
          aria-label="选择工具"
          title="选择"
          aria-pressed={tool === "select"}
          onClick={() => setTool("select")}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          aria-label="平移工具"
          title="平移（空格）"
          aria-pressed={tool === "hand"}
          onClick={() => setTool("hand")}
        >
          <Hand size={18} />
        </button>
        <span className="canvas-tool-divider" />
        <button
          aria-label="新建笔记"
          title="新建笔记"
          onClick={() => createNote()}
        >
          <FilePlus2 size={18} />
          <span>笔记</span>
        </button>
        <button
          aria-label="添加图片或文件"
          title="添加图片或文件"
          onClick={() => attach()}
        >
          <ImagePlus size={18} />
          <Paperclip size={15} />
        </button>
        <button
          aria-label="添加交互块"
          title="添加交互实验"
          onClick={() => addInteractive()}
        >
          <FlaskConical size={18} />
        </button>
        <span className="canvas-tool-divider" />
        <select
          aria-label="添加形状"
          title="添加形状"
          value=""
          onChange={(event) =>
            createShape(
              event.target.value as "rectangle" | "ellipse" | "diamond",
            )
          }
        >
          <option value="" disabled>
            ◇ 形状
          </option>
          {CANVAS_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {canvasShapeNames[shape]}
            </option>
          ))}
        </select>
        <button
          aria-label="连接工具"
          title="连接：从对象边缘拖向另一个对象"
          aria-pressed={tool === "connect"}
          onClick={() => {
            finishEditing();
            setTool(tool === "connect" ? "select" : "connect");
          }}
        >
          <MoveUpRight size={18} />
        </button>
        <button
          aria-label="对齐吸附"
          title="对齐吸附（Alt 临时关闭）"
          aria-pressed={snap}
          onClick={() => setSnap(!snap)}
        >
          <Magnet size={17} />
        </button>
        <span className="canvas-tool-divider" />
        <button
          aria-label="撤销画布修改"
          title="撤销（⌘/Ctrl Z）"
          disabled={!data.canUndo}
          onClick={data.undo}
        >
          <Undo2 size={18} />
        </button>
        <button
          aria-label="重做画布修改"
          title="重做（⌘/Ctrl ⇧ Z）"
          disabled={!data.canRedo}
          onClick={data.redo}
        >
          <Redo2 size={18} />
        </button>
      </div>
      {activeConnector && !connection ? (
        <ConnectorToolbar
          key={activeConnector.id}
          connector={activeConnector}
          rectangles={rectangles}
          camera={camera}
          viewportWidth={viewSize.width}
          viewportHeight={viewSize.height}
          onChange={changeConnector}
          onAction={(action) => connectorActionRef.current(action)}
          endGroup={data.endGroup}
          editLabel={editConnectorLabel}
          onEditLabel={setEditConnectorLabel}
          hasStyle={!!copiedStyle}
        />
      ) : selectedRects.length > 0 ? (
        <SelectionToolbar
          key={selectedRects.map((r) => r.id).join(",")}
          rects={selectedRects}
          blocks={selectionBlocks}
          camera={camera}
          width={viewSize.width}
          height={viewSize.height}
          onStyle={shapeChange}
          onShape={(shape) => {
            if (selectedRects.some((r) => r.locked)) return;
            edit(
              selectionBlocks
                .filter((b) => b.type === "shape")
                .map((b) => ({
                  type: "set_shape" as const,
                  block: { ...b, shape },
                })),
            );
          }}
          onArrange={(action) => arrangeRef.current(action)}
          onAction={(action) => selectionActionRef.current(action)}
          hasStyle={!!shapeCopiedStyle}
          onFilter={(type) =>
            setSelection(
              selectedRects
                .filter(
                  (r) =>
                    (selectionBlocks.find((b) => b.id === r.content)?.type ??
                      "note") === type,
                )
                .map((r) => r.id),
            )
          }
          editable={selectedRects.some((r) =>
            doc.notes.some((n) => n.id === r.content),
          )}
          onEndGroup={data.endGroup}
        />
      ) : null}
      <button
        className="canvas-examples-trigger"
        aria-label="添加体验样例"
        title="添加全部内容类型的体验样例"
        disabled={addingExamples}
        onClick={() => void addExamples()}
      >
        <Shapes size={17} />
        <span>{addingExamples ? "准备样例…" : "体验样例"}</span>
      </button>
      <button
        className="canvas-dsl-trigger"
        aria-label="编辑文档 DSL"
        title="文档 DSL"
        onClick={() => {
          sourceRevision.current = doc.revision;
          setDsl(JSON.stringify(doc, null, 2));
          setDslError("");
        }}
      >
        <Code2 size={18} />
      </button>
      <div
        ref={viewport}
        className="canvas-viewport"
        tabIndex={0}
        aria-label="无限画布"
        data-camera={JSON.stringify(camera)}
        style={{
          backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={(event) => {
          const target = event.target as Element;
          if (event.button === 1 || space.current || tool === "hand") {
            begin(event, "pan");
            return;
          }
          if (
            tool === "connect" &&
            event.button === 0 &&
            !target.closest("[data-placement]")
          ) {
            const r = viewport.current!.getBoundingClientRect();
            connectFrom(event, {
              point: screenToWorld(cameraRef.current, {
                x: event.clientX - r.left,
                y: event.clientY - r.top,
              }),
              side: "e",
            });
            return;
          }
          if (!target.closest("[data-placement]")) {
            setSelected(null);
            setEditing(null);
            setSelectedConnector(null);
            begin(event, "marquee");
          }
        }}
        onPointerMove={move}
        onPointerUp={(event) => end(event)}
        onPointerCancel={(event) => end(event, true)}
        onDoubleClick={(event) => {
          if (tool !== "select") return;
          if ((event.target as Element).closest("[data-placement]")) return;
          const r = viewport.current!.getBoundingClientRect();
          createNote(
            screenToWorld(cameraRef.current, {
              x: event.clientX - r.left,
              y: event.clientY - r.top,
            }),
          );
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragOver(false);
        }}
        onDrop={drop}
      >
        <div
          className="canvas-world"
          style={
            {
              transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`,
              "--canvas-zoom": camera.zoom,
            } as CSSProperties
          }
        >
          <CanvasConnections
            rectangles={rectangles}
            connectors={(doc.board.connectors ?? []).map((c) =>
              connectorPreview?.id === c.id
                ? connectorPreview
                : previewGroupConnector(c),
            )}
            selected={selectedConnector}
            draft={connection}
            zoom={camera.zoom}
            guides={guides}
            onSelect={selectConnector}
            onEditLabel={(id) => {
              selectConnector(id);
              setEditConnectorLabel(true);
            }}
            onSegment={(event, c, index) => {
              (document.activeElement as HTMLElement | null)?.blur();
              event.preventDefault();
              event.stopPropagation();
              viewport.current?.setPointerCapture(event.pointerId);
              gesture.current = {
                pointer: event.pointerId,
                kind: "segment",
                start: { x: event.clientX, y: event.clientY },
                camera: cameraRef.current,
                connector: c,
                points: canvasConnectorGeometry(c, rectangles)!.points,
                segment: index,
              };
            }}
            onReconnect={(event, c, end) =>
              connectFrom(event, end === "from" ? c.to : c.from, {
                id: c.id,
                end,
              })
            }
          />
          {marquee && (
            <div
              className="canvas-marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
          {selection.length > 1 &&
            selectedRects.length > 1 &&
            (() => {
              const bounds = canvasSelectionBounds(selectedRects);
              return (
                <div
                  className="canvas-selection"
                  style={{
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                  }}
                  aria-label="多选边界"
                >
                  {resizeDirections.map(({ direction, label }) => (
                    <button
                      key={direction}
                      className={`canvas-resize canvas-resize-${direction}`}
                      aria-label={`调整选区 ${label}`}
                      onPointerDown={(e) =>
                        begin(
                          e,
                          "resize",
                          doc.board.placements.find((p) => p.id === selected)!,
                          direction,
                        )
                      }
                    />
                  ))}
                </div>
              );
            })()}
          {doc.board.placements.map((original) => {
            const p =
              gesturePreview?.id === original.id
                ? { ...original, ...gesturePreview }
                : { ...original, ...multiPreview[original.id] };
            const note = doc.notes.find((n) => n.id === p.content),
              block = doc.blocks.find((b) => b.id === p.content);
            const title =
              note?.title ||
              (block?.type === "interactive"
                ? "交互实验"
                : doc.assets.find(
                    (a) =>
                      "asset" in (block ?? {}) &&
                      a.id === (block as { asset: string }).asset,
                  )?.name) ||
              (note
                ? "文本"
                : block?.type === "shape"
                  ? canvasShapeNames[block.shape]
                  : "内容");
            return (
              <article
                key={p.id}
                data-placement={p.id}
                data-content={p.content}
                data-note={note?.id}
                className={`canvas-card ${selection.includes(p.id) ? "selected" : ""} ${selection.length > 1 && selection.includes(p.id) ? "is-multiselected" : ""} ${p.locked ? "is-locked" : ""} ${editing === p.id ? "is-editing-card" : ""} ${connection?.target?.placement === p.id ? "connection-target" : ""} ${tool === "connect" || (connection && (connection.from.placement === p.id || connection.target?.placement === p.id)) ? "show-ports" : ""} ${connection?.from.placement === p.id ? "connection-source" : ""} ${p.width < 300 ? "is-compact" : ""} ${note && !note.title.trim() ? "is-untitled" : ""} ${p.height !== undefined ? "is-sized" : ""} ${block?.type === "shape" ? "shape-card" : ""} ${block?.type === "interactive" ? "interactive-card" : ""} ${block?.type === "image" ? "image-card" : ""}`}
                style={{
                  left: p.x,
                  top: p.y,
                  width: p.width,
                  height: p.height,
                }}
                onFocusCapture={() => {
                  if (!selection.includes(p.id)) setSelected(p.id);
                  setSelectedConnector(null);
                }}
                onPointerDown={(event) => {
                  if (
                    tool === "connect" &&
                    !space.current &&
                    event.button === 0 &&
                    !(event.target as Element).closest(
                      "button,input,textarea,select",
                    )
                  ) {
                    const rect = rectangles.find((r) => r.id === p.id)!;
                    const box = viewport.current!.getBoundingClientRect();
                    const point = screenToWorld(cameraRef.current, {
                      x: event.clientX - box.left,
                      y: event.clientY - box.top,
                    });
                    const endpoint = nearestCanvasEndpoint(point, [rect])!;
                    connectFrom(event, endpoint);
                    return;
                  }
                  if (
                    tool === "select" &&
                    !space.current &&
                    event.button === 0
                  ) {
                    if (
                      event.shiftKey &&
                      !selection.includes(p.id) &&
                      !(event.target as Element).closest(
                        "button,input,textarea,select",
                      )
                    ) {
                      event.stopPropagation();
                      const ids = p.group
                        ? rectangles
                            .filter((r) => r.group === p.group)
                            .map((r) => r.id)
                        : [p.id];
                      setSelection(
                        selection.includes(p.id)
                          ? selection.filter((id) => !ids.includes(id))
                          : [...new Set([...selection, ...ids])],
                      );
                      setSelectedConnector(null);
                      return;
                    }
                    if (p.locked) {
                      setSelected(p.id);
                      setSelectedConnector(null);
                      event.stopPropagation();
                      return;
                    }

                    if (
                      block?.type === "shape" &&
                      editing !== p.id &&
                      !(event.target as Element).closest(
                        "button,input,textarea,select",
                      )
                    ) {
                      begin(event, "move", p);
                      return;
                    }
                    if (!selection.includes(p.id))
                      setSelection(
                        p.group
                          ? rectangles
                              .filter((r) => r.group === p.group)
                              .map((r) => r.id)
                          : [p.id],
                      );
                    setSelectedConnector(null);
                  }
                }}
                onBlur={(event) => {
                  if (
                    editing === p.id &&
                    event.relatedTarget instanceof Node &&
                    !event.currentTarget.contains(event.relatedTarget)
                  )
                    finishEditing();
                }}
              >
                <header
                  className="canvas-card-header"
                  inert={p.locked ? true : undefined}
                  onPointerDown={(event) =>
                    tool === "connect" && !space.current
                      ? connectFrom(event, { placement: p.id, side: "e" })
                      : begin(
                          event,
                          space.current || tool === "hand" ? "pan" : "move",
                          p,
                        )
                  }
                >
                  <span className="canvas-card-kind">
                    {note ? (
                      <FilePlus2 size={15} />
                    ) : block?.type === "interactive" ? (
                      <FlaskConical size={15} />
                    ) : (
                      <Paperclip size={15} />
                    )}
                  </span>
                  {note ? (
                    <NoteTitle
                      note={note}
                      onEdit={edit}
                      endGroup={data.endGroup}
                    />
                  ) : (
                    <strong>{title}</strong>
                  )}
                  <div
                    className="canvas-card-actions"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {(note || block?.type === "shape") && (
                      <>
                        <button
                          aria-label={`${editing === p.id ? "完成编辑" : "编辑"} ${title}`}
                          className={
                            editing === p.id ? "canvas-edit-done" : undefined
                          }
                          title={editing === p.id ? "完成编辑" : "在画布中编辑"}
                          onClick={() => {
                            if (editing === p.id) finishEditing();
                            else startEditing(p.id);
                          }}
                        >
                          {editing === p.id ? (
                            <>
                              <Check size={15} />
                              <span>完成</span>
                            </>
                          ) : (
                            <Pencil size={15} />
                          )}
                        </button>
                        {note && (
                          <button
                            aria-label={`聚焦 ${title}`}
                            title="放大编辑与实时预览"
                            onClick={() => expandNote(note.id)}
                          >
                            <Maximize2 size={15} />
                          </button>
                        )}
                      </>
                    )}
                    <button
                      aria-label={`连接 ${title}`}
                      title="从此对象连线"
                      onClick={() => {
                        finishEditing();
                        setSelected(p.id);
                        setTool("connect");
                      }}
                    >
                      <MoveUpRight size={15} />
                    </button>
                    <button
                      aria-label={`复制摆放 ${title}`}
                      title="复制摆放（共享同一内容）"
                      onClick={() =>
                        edit([
                          {
                            type: "duplicate_placement",
                            id: p.id,
                            newId: newCanvasId("place"),
                          },
                        ])
                      }
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label={`移出画布 ${title}`}
                      title="移出画布，保留内容"
                      onClick={() =>
                        edit([{ type: "remove_placement", id: p.id }])
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </header>
                <div
                  className="canvas-card-body"
                  onDoubleClick={(event) => {
                    if (
                      (note || block?.type === "shape") &&
                      !p.locked &&
                      editing !== p.id &&
                      tool === "select" &&
                      !space.current &&
                      !(event.target as Element).closest(
                        'button,a,input,textarea,select,[contenteditable="true"],[role="slider"]',
                      )
                    ) {
                      event.stopPropagation();
                      startEditing(p.id);
                    }
                  }}
                >
                  {content(p.content, editing === p.id)}
                </div>
                {block?.type === "shape" && editing === p.id && (
                  <select
                    className="canvas-legacy-tone"
                    aria-label="形状颜色"
                    value={block.tone}
                    onChange={(e) =>
                      edit([
                        {
                          type: "set_shape",
                          block: {
                            ...block,
                            tone: e.target.value as typeof block.tone,
                          },
                        },
                      ])
                    }
                  >
                    <option value="neutral">默认</option>
                    <option value="sage">浅绿</option>
                    <option value="sand">浅沙</option>
                    <option value="blue">浅蓝</option>
                  </select>
                )}
                <div className="canvas-card-controls">
                  {resizeDirections.map(({ direction, label }) => (
                    <button
                      key={direction}
                      className={`canvas-resize canvas-resize-${direction}`}
                      data-resize={direction}
                      aria-label={`调整尺寸 ${label} ${title}`}
                      title={`拖动${label}调整尺寸`}
                      onPointerDown={(event) =>
                        begin(
                          event,
                          space.current || tool === "hand" ? "pan" : "resize",
                          p,
                          direction,
                        )
                      }
                    />
                  ))}
                  {(["n", "e", "s", "w"] as CanvasSide[]).map((side) => (
                    <button
                      key={side}
                      className={`canvas-port canvas-port-${side} ${connection?.target?.placement === p.id && !connection.target.anchor && connection.target.side === side ? "is-snapped" : ""}`}
                      data-port={side}
                      style={(() => {
                        const r = rectangles.find((r) => r.id === p.id)!,
                          anchor = canvasPort(r, side),
                          offset = connection ? 0 : 24 / camera.zoom;
                        return {
                          left:
                            anchor.x -
                            r.x -
                            12 / camera.zoom +
                            (side === "e"
                              ? offset
                              : side === "w"
                                ? -offset
                                : 0),
                          top:
                            anchor.y -
                            r.y -
                            12 / camera.zoom +
                            (side === "s"
                              ? offset
                              : side === "n"
                                ? -offset
                                : 0),
                          right: "auto",
                          bottom: "auto",
                          transform: "none",
                        };
                      })()}
                      aria-label={`从${{ n: "上", e: "右", s: "下", w: "左" }[side]}侧连接 ${title}`}
                      title="拖向另一个对象以连接"
                      onPointerDown={(event) =>
                        connectFrom(event, { placement: p.id, side })
                      }
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {outline && (
        <aside className="canvas-outline">
          <header>
            <strong>画布内容</strong>
            <button aria-label="关闭内容列表" onClick={() => setOutline(false)}>
              <X size={16} />
            </button>
          </header>
          {[
            ...doc.notes,
            ...doc.blocks.filter(
              (b) => !doc.notes.some((n) => n.blocks.includes(b.id)),
            ),
          ].map((item) => {
            const p = doc.board.placements.find((p) => p.content === item.id);
            const title =
              "title" in item
                ? item.title
                : item.type === "interactive"
                  ? "交互实验"
                  : item.type === "shape"
                    ? item.text || "形状"
                    : doc.assets.find(
                        (a) => "asset" in item && a.id === item.asset,
                      )?.name || "内容";
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (p) {
                    const v = viewport.current!;
                    pan({
                      ...cameraRef.current,
                      x:
                        v.clientWidth / 2 -
                        (p.x + p.width / 2) * cameraRef.current.zoom,
                      y: 120 - p.y * cameraRef.current.zoom,
                    });
                    setSelected(p.id);
                    saveView();
                  } else {
                    const c = center();
                    edit([
                      {
                        type: "place",
                        placement: {
                          id: newCanvasId("place"),
                          content: item.id,
                          x: c.x - 220,
                          y: c.y - 100,
                          width: 440,
                        },
                      },
                    ]);
                  }
                }}
              >
                <span>{title || "未命名笔记"}</span>
                <small>{p ? "定位" : "放回画布"}</small>
              </button>
            );
          })}
        </aside>
      )}
      {(message || data.saveError || data.externalNotice) && (
        <div className="canvas-message" role="alert">
          {message || data.saveError || data.externalNotice}
          {data.saveError && <button onClick={data.retry}>重试保存</button>}
          {data.saveError && data.canReloadFromDisk && (
            <button onClick={() => void data.reloadFromDisk()}>
              读取磁盘版本（保留当前草稿）
            </button>
          )}
          <button aria-label="关闭提示" onClick={() => setMessage("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {adding && (
        <div className="canvas-adding" role="status">
          正在保存附件原件…
        </div>
      )}
      {canvasExampleStops.some((stop) =>
        doc.board.placements.some((p) => p.id === stop.id),
      ) ? (
        <div className="canvas-example-tour" aria-label="逐个体验画布内容">
          <button aria-label="上一个样例" onClick={() => stepExample(-1)}>
            ←
          </button>
          <select
            aria-label="选择体验样例"
            value={exampleIndex}
            onChange={(event) => focusExample(Number(event.target.value))}
          >
            {canvasExampleStops.map((stop, index) => (
              <option
                key={stop.id}
                value={index}
                disabled={!doc.board.placements.some((p) => p.id === stop.id)}
              >
                {stop.label}
              </option>
            ))}
          </select>
          <span>
            {exampleIndex + 1} / {canvasExampleStops.length}
          </span>
          <button aria-label="下一个样例" onClick={() => stepExample(1)}>
            →
          </button>
        </div>
      ) : (
        <div className="canvas-help">
          双击新建笔记 · 空格拖动 · ⌘ / Ctrl + 滚轮缩放
        </div>
      )}
      <div className="canvas-zoom">
        <button
          aria-label="缩小画布"
          onClick={() => {
            const v = viewport.current!;
            pan(
              zoomCanvasAt(cameraRef.current, cameraRef.current.zoom / 1.2, {
                x: v.clientWidth / 2,
                y: v.clientHeight / 2,
              }),
            );
            saveView();
          }}
        >
          <Minus size={16} />
        </button>
        <button
          aria-label="重置为 100%"
          onClick={() => {
            const v = viewport.current!;
            pan(
              zoomCanvasAt(cameraRef.current, 1, {
                x: v.clientWidth / 2,
                y: v.clientHeight / 2,
              }),
            );
            saveView();
          }}
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        <button
          aria-label="放大画布"
          onClick={() => {
            const v = viewport.current!;
            pan(
              zoomCanvasAt(cameraRef.current, cameraRef.current.zoom * 1.2, {
                x: v.clientWidth / 2,
                y: v.clientHeight / 2,
              }),
            );
            saveView();
          }}
        >
          <Plus size={16} />
        </button>
        <span className="canvas-tool-divider" />
        <button aria-label="适应画布内容" title="适应内容" onClick={fit}>
          <Maximize2 size={16} />
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label="选择画布附件"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void addFiles(files, center(), attachTarget.current);
          attachTarget.current = undefined;
        }}
      />
      <Modal
        open={!!activeNote}
        onOpenChange={(open) => {
          if (!open) {
            data.endGroup();
            setFocus(null);
          }
        }}
        title={
          activeNote ? (
            <NoteTitle
              note={activeNote}
              onEdit={edit}
              endGroup={data.endGroup}
            />
          ) : (
            "笔记"
          )
        }
        className="canvas-focus-modal"
      >
        {activeNote && (
          <>
            <div className="canvas-focus-columns">
              <div>{content(activeNote.id, true)}</div>
              <div className="canvas-focus-preview">
                <span>预览</span>
                {content(activeNote.id, false)}
              </div>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={dsl !== null}
        onOpenChange={(open) => {
          if (!open) setDsl(null);
        }}
        title="文档 DSL"
        description="内容、引用与摆放独立表达。附件原件保存在本机；此结构快照不包含附件二进制或个人学习参数。"
        className="canvas-dsl-modal"
      >
        <textarea
          aria-label="文档 DSL 源码"
          spellCheck={false}
          value={dsl ?? ""}
          onChange={(event) => setDsl(event.target.value)}
        />
        {dslError && (
          <p className="canvas-dsl-error" role="alert">
            {dslError}
          </p>
        )}
        <div className="canvas-dsl-actions">
          <Button onClick={downloadDsl}>
            <Download size={15} /> 导出结构快照
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              try {
                const next = parseCanvasDocument(dsl);
                data.replace(next, sourceRevision.current);
                setDsl(null);
              } catch (error) {
                setDslError((error as Error).message);
              }
            }}
          >
            校验并应用
          </Button>
        </div>
      </Modal>
    </div>
  );
}
