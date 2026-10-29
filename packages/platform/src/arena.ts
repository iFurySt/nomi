import type { ArenaView, ArenaRunRequest } from "@nomi/core";
export async function runArena(request: ArenaRunRequest): Promise<ArenaView> {
  if (!window.nomiDesktop?.requestArena)
    throw Error("Open the desktop app to run ChatGPT in Arena.");
  const result = await window.nomiDesktop.requestArena("run", request);
  if (!result.ok) throw Error(result.error);
  return result.value as ArenaView;
}
export async function cancelArena() {
  const result = await window.nomiDesktop?.requestArena?.("cancel");
  if (result && !result.ok) throw Error(result.error);
}

export async function startArenaAuto(
  request: import("@nomi/core").ArenaAutoRequest,
): Promise<ArenaView> {
  if (!window.nomiDesktop?.requestArena)
    throw Error("Open the desktop app to run Arena.");
  const r = await window.nomiDesktop.requestArena("auto.start", request);
  if (!r.ok) throw Error(r.error);
  return r.value as ArenaView;
}
export async function pauseArenaAuto(episodeId: string): Promise<ArenaView> {
  if (!window.nomiDesktop?.requestArena)
    throw Error("Open the desktop app to run Arena.");
  const r = await window.nomiDesktop.requestArena("auto.pause", { episodeId });
  if (!r.ok) throw Error(r.error);
  return r.value as ArenaView;
}
