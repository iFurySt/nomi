import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChatGPTStatus, ChatGPTModel, ChatGPTMethod } from "@nomi/core";
import {
  chatGPTAvailable,
  readChatGPTStatus,
  requestChatGPT,
  listChatGPTModels,
} from "@nomi/platform";
import { Check, ArrowUpRight } from "lucide-react";
import "./pages/chatgpt-settings.css";
import { Button, Modal } from "./components/primitives";

interface Connection {
  available: boolean;
  status?: ChatGPTStatus;
  models: ChatGPTModel[];
  modelsLoading: boolean;
  model: string;
  setModel: (model: string) => void;
  busy: boolean;
  signingIn: boolean;
  signingInProfileId?: string;
  error: string;
  errorMethod?: ChatGPTMethod;
  dismissError: () => void;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  action: (method: ChatGPTMethod, params?: unknown) => Promise<void>;
}
const Context = createContext<Connection | null>(null);
export function useChatGPT() {
  const value = useContext(Context);
  if (!value) throw Error("ChatGPT provider is missing.");
  return value;
}
export function ChatGPTProvider({ children }: { children: ReactNode }) {
  const available = chatGPTAvailable();
  const [status, setStatus] = useState<ChatGPTStatus>();
  const [models, setModels] = useState<ChatGPTModel[]>([]);
  const [model, setModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signingInProfileId, setSigningInProfileId] = useState<string>();
  const [error, setError] = useState("");
  const [errorMethod, setErrorMethod] = useState<ChatGPTMethod>();
  const failed = useRef<{ method: ChatGPTMethod; params?: unknown }>({
    method: "status",
  });
  const cancelled = useRef(false);
  const dismissError = useCallback(() => {
    setError("");
    setErrorMethod(undefined);
  }, []);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!available) return;
    const request = ++sequence.current;
    try {
      const next = await readChatGPTStatus();
      if (request === sequence.current) setStatus(next);
    } catch (e) {
      if (request === sequence.current) {
        failed.current = { method: "status" };
        setErrorMethod("status");
        setError((e as Error).message);
      }
    }
  }, [available]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const active = status?.profiles.find((p) => p.id === status.activeProfileId);
  const loadModels = useCallback(async () => {
    if (!active?.sharing) {
      setModels([]);
      setModel("");
      return;
    }
    setModelsLoading(!models.length);
    try {
      const next = await listChatGPTModels(active.id);
      setModels(next);
      setModel((old) =>
        next.some((m) => m.slug === old) ? old : (next[0]?.slug ?? ""),
      );
    } finally {
      setModelsLoading(false);
    }
  }, [active?.id, active?.sharing, models.length]);
  useEffect(() => {
    let current = true;
    setModels([]);
    setModel("");
    setModelsLoading(!!active?.sharing);
    if (active?.sharing)
      void listChatGPTModels(active.id)
        .then((next) => {
          if (current) {
            setModels(next);
            setModel(next[0]?.slug ?? "");
          }
        })
        .catch((e) => {
          if (current) {
            failed.current = { method: "models" };
            setErrorMethod("models");
            setError(e.message);
          }
        })
        .finally(() => {
          if (current) setModelsLoading(false);
        });
    return () => {
      current = false;
    };
  }, [active?.id, active?.sharing]);
  const action = useCallback(
    async (method: ChatGPTMethod, params?: unknown) => {
      if (method !== "cancelSignIn") setBusy(true);
      if (method === "signIn") {
        setSigningInProfileId(
          (params as { profileId?: string } | undefined)?.profileId,
        );
        cancelled.current = false;
        setSigningIn(true);
      }
      if (method === "cancelSignIn") cancelled.current = true;
      dismissError();
      try {
        const value =
          method === "models"
            ? await loadModels()
            : await requestChatGPT<{ revoked?: boolean }>(method, params);
        if (method === "signOut" && value && !value.revoked)
          setError(
            "Signed out on this device. Remote revocation was not confirmed; disconnect Nomi in ChatGPT settings.",
          );
      } catch (e) {
        if (!(method === "signIn" && cancelled.current)) {
          failed.current = { method, params };
          setErrorMethod(method);
          setError((e as Error).message);
        }
      } finally {
        if (method === "signIn") setSigningIn(false);
        if (method !== "cancelSignIn") setBusy(false);
        await refresh();
      }
    },
    [refresh, loadModels, dismissError],
  );
  return (
    <Context.Provider
      value={{
        available,
        status,
        models,
        modelsLoading,
        model,
        setModel,
        busy,
        signingIn,
        signingInProfileId,
        error,
        errorMethod,
        dismissError,
        retry: () => action(failed.current.method, failed.current.params),
        refresh,
        action,
      }}
    >
      {children}
      <Modal
        open={!!active?.sharing && !status?.welcomeSeen}
        onOpenChange={(open) => {
          if (!open) void action("acknowledgeWelcome");
        }}
        className="chatgpt-welcome"
        title={
          <>
            <span className="chatgpt-welcome-check" aria-hidden="true">
              <Check size={20} />
            </span>
            <span>ChatGPT connected</span>
          </>
        }
        description="You’re using your ChatGPT plan. Eligible AI requests use your plan or authorized credits."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => void action("openUsage")}>
            Manage usage <ArrowUpRight size={13} />
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void action("acknowledgeWelcome")}
          >
            Got it
          </Button>
        </div>
      </Modal>
    </Context.Provider>
  );
}
