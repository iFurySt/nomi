import { useEffect, useRef, useState } from "react";
import {
  parseCanvasGeneration,
  canvasConnectorGeometry,
  canvasGenerationCommands,
  type CanvasDocument,
  type CanvasCommand,
} from "@nomi/core";
import {
  respondWithChatGPT,
  requestChatGPT,
  type CanvasRepository,
} from "@nomi/platform";
import { useChatGPT } from "../chatgpt-context";
import { Button, Modal } from "../components/primitives";
import { CanvasContent } from "./CanvasContent";
import "./generation.css";

export function GenerateCanvas({
  onClose,
  onInsert,
  repository,
}: {
  onClose: () => void;
  onInsert: (commands: CanvasCommand[]) => boolean;
  repository: CanvasRepository;
}) {
  const connection = useChatGPT();
  const account = connection.status?.profiles.find(
    (p) => p.id === connection.status?.activeProfileId,
  );
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [received, setReceived] = useState(0),
    [scene, setScene] = useState<CanvasDocument>();
  const request = useRef<string | undefined>(undefined);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(700);
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setPreviewWidth(element.clientWidth),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene]);
  const cancel = () => {
    const id = request.current;
    request.current = undefined;
    if (id)
      void requestChatGPT("cancelResponse", { requestId: id }).catch(() => {});
    setBusy(false);
  };
  useEffect(
    () => () => {
      const id = request.current;
      request.current = undefined;
      if (id)
        void requestChatGPT("cancelResponse", { requestId: id }).catch(
          () => {},
        );
    },
    [],
  );
  useEffect(() => {
    cancel();
    setScene(undefined);
  }, [account?.id]);
  const generate = async () => {
    if (!account?.sharing || !connection.model || busy) return;
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(true);
    setError("");
    setScene(undefined);
    setReceived(0);
    try {
      const result = await respondWithChatGPT(
        {
          requestId: id,
          profileId: account.id,
          model: connection.model,
          generation: "canvas",
          messages: [{ role: "user", content: prompt.trim() }],
        },
        (text) => {
          if (request.current === id) setReceived((n) => n + text.length);
        },
      );
      if (request.current === id) setScene(parseCanvasGeneration(result.text));
    } catch (e) {
      if (request.current === id) setError((e as Error).message);
    } finally {
      if (request.current === id) {
        request.current = undefined;
        setBusy(false);
      }
    }
  };
  const rects =
    scene?.board.placements.map((p) => {
      const block = scene.blocks.find((b) => b.id === p.content);
      return {
        ...p,
        height: p.height ?? 240,
        ...(block?.type === "shape"
          ? { shape: block.shape, shapeStyle: block.shapeStyle }
          : {}),
      };
    }) ?? [];
  const left = Math.min(0, ...rects.map((p) => p.x)) - 30,
    top = Math.min(0, ...rects.map((p) => p.y)) - 30;
  const width = Math.max(700, ...rects.map((p) => p.x + p.width)) - left + 30,
    height = Math.max(200, ...rects.map((p) => p.y + p.height)) - top + 30;
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          cancel();
          onClose();
        }
      }}
      title="AI 生成"
      description="描述你想绘制的图示或交互实验。预览确认后加入画布。"
      className="generation-dialog"
    >
      {!account?.sharing ? (
        <p>
          请先在{" "}
          <a href="#/settings/chatgpt" onClick={onClose}>
            设置 → ChatGPT
          </a>{" "}
          中连接账号并授权使用套餐。
        </p>
      ) : (
        <>
          <label>
            模型
            <select
              aria-label="生成模型"
              value={connection.model}
              disabled={busy || connection.modelsLoading}
              onChange={(e) => connection.setModel(e.target.value)}
            >
              {connection.models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <textarea
            aria-label="生成需求"
            placeholder="例如：画出 Transformer 的主要模块和信息流；或者生成一个可调温度的概率分布实验。"
            value={prompt}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="generation-hint">
            仅发送你填写的描述，不自动读取文稿或附件。使用所选 ChatGPT
            账号的可用额度。
          </p>
          {connection.error && <p role="alert">{connection.error}</p>}
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            {busy ? (
              <Button onClick={cancel}>停止生成</Button>
            ) : (
              <Button
                variant="primary"
                disabled={!prompt.trim() || !connection.model}
                onClick={() => void generate()}
              >
                {scene ? "重新生成" : "生成预览"}
              </Button>
            )}
            <span role="status">
              {busy
                ? `正在生成${received ? ` · 已接收 ${received} 字符` : "…"}`
                : ""}
            </span>
          </div>
        </>
      )}
      {scene && (
        <>
          <div
            ref={previewRef}
            className="generation-preview"
            aria-label="生成内容预览"
          >
            <div
              style={{
                position: "relative",
                width,
                height,
                transformOrigin: "top left",
                zoom: Math.min(1, previewWidth / width),
              }}
            >
              <svg
                width={width}
                height={height}
                style={{ position: "absolute", overflow: "visible" }}
              >
                <defs>
                  <marker
                    id="generation-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M 1 1 L 9 5 L 1 9"
                      fill="none"
                      stroke="currentColor"
                    />
                  </marker>
                </defs>
                {scene.board.connectors?.map((c) => {
                  const g = canvasConnectorGeometry(c, rects);
                  return (
                    g && (
                      <path
                        key={c.id}
                        d={g.d}
                        transform={`translate(${-left},${-top})`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeDasharray={
                          c.style === "solid" ? undefined : "6 5"
                        }
                        markerEnd={
                          c.endArrow ? "url(#generation-arrow)" : undefined
                        }
                      />
                    )
                  );
                })}
              </svg>
              {scene.board.placements.map((p) => (
                <div
                  key={p.id}
                  className={`generation-object${scene.blocks.find((b) => b.id === p.content)?.type === "shape" ? " shape-card" : ""}`}
                  style={{
                    left: p.x - left,
                    top: p.y - top,
                    width: p.width,
                    height: p.height ?? 240,
                  }}
                >
                  <CanvasContent
                    document={scene}
                    contentId={p.content}
                    profile="ai-preview"
                    repository={repository}
                    editing={false}
                    onEdit={() => {}}
                    onAttach={() => {}}
                    onInteractive={() => {}}
                    endGroup={() => {}}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="dialog-actions">
            <Button
              variant="primary"
              onClick={() => {
                if (onInsert(canvasGenerationCommands(scene, { x: 0, y: 0 })))
                  onClose();
              }}
            >
              加入画布
            </Button>
            <span>
              {scene.board.placements.length} 个对象 · 可继续编辑 · ⌘Z 撤销
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}
