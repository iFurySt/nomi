import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { UpdateAction, UpdateStatus } from "@nomi/core";
import { getRuntimeInfo } from "@nomi/platform";
const UpdateContext = createContext<{
  status?: UpdateStatus;
  action: (method: UpdateAction, value?: boolean) => Promise<void>;
}>({ action: async () => {} });
export const useUpdates = () => useContext(UpdateContext);
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>();
  const bridge = window.nomiDesktop?.requestUpdates;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let interval = 2000;
    const refresh = async () => {
      try {
        const next = bridge
          ? await bridge("status")
          : {
              ...(await getRuntimeInfo()),
              available: false,
              reason: "请在正式 macOS App 中检查更新",
            };
        interval = ["downloading", "extracting", "installing"].includes(
          next.phase ?? "",
        )
          ? 400
          : 2000;
        if (live)
          setStatus((previous) =>
            JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
          );
      } catch {
        if (live)
          setStatus((previous) =>
            previous
              ? { ...previous, error: "无法读取更新状态，请重试。" }
              : undefined,
          );
      } finally {
        if (live && bridge) timer = setTimeout(refresh, interval);
      }
    };
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [bridge]);
  const action = useCallback(
    async (method: UpdateAction, value?: boolean) => {
      try {
        if (bridge) setStatus(await bridge(method, value));
      } catch (error) {
        setStatus((previous) =>
          previous
            ? {
                ...previous,
                error:
                  error instanceof Error
                    ? error.message
                    : "更新操作失败，请重试。",
              }
            : undefined,
        );
      }
    },
    [bridge],
  );
  return (
    <UpdateContext.Provider value={{ status, action }}>
      {children}
    </UpdateContext.Provider>
  );
}
