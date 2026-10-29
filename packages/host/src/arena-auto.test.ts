import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArenaHost } from "./arena";
const params = {
  episodeId: "b".repeat(32),
  profileId: "profile",
  model: "model",
  effort: "low",
  intervalSeconds: 30,
  maxRounds: 2,
} as const;
const hosts: ArenaHost[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T09:00:00Z"));
});
afterEach(async () => {
  for (const h of hosts.splice(0)) await h.dispose();
  vi.useRealTimers();
});
function setup(state?: any) {
  const e = state ?? { id: params.episodeId, day: 0, decisions: [] };
  const data = {
    request: vi.fn(async () => ({ episode: structuredClone(e) })),
    arenaControl: vi.fn(async (method: string, p?: any) => {
      if (method === "arena.auto.start")
        e.automation = {
          id: "auto-generation",
          enabled: true,
          ...p,
          completed: 0,
          startedAt: new Date().toISOString(),
          nextRunAt: new Date().toISOString(),
        };
      if (method === "arena.auto.pause") {
        e.automation.enabled = false;
        e.automation.reason = p.summary;
        delete e.automation.nextRunAt;
      }
      if (method === "arena.auto.defer") {
        e.automation.reason = p.summary;
        e.automation.nextRunAt = new Date(Date.now() + 15000).toISOString();
      }
      if (method === "arena.run.begin")
        e.run = {
          id: p.runId,
          status: "running",
          automationId: p.automationId,
        };
      if (method === "arena.run.finish") {
        e.run.status = p.status;
        if (p.status === "succeeded") {
          e.day++;
          e.automation.completed++;
          e.run.status = "completed";
          e.automation.nextRunAt = new Date(
            Date.now() + e.automation.intervalSeconds * 1000,
          ).toISOString();
          if (e.automation.completed >= e.automation.maxRounds) {
            e.automation.enabled = false;
            e.automation.reason = "Round limit reached";
          }
        } else e.automation.enabled = false;
      }
      return { episode: structuredClone(e) };
    }),
  };
  const chat = {
    inferenceBusy: false,
    request: vi.fn(async (method: string) =>
      method === "status"
        ? {
            activeProfileId: "profile",
            profiles: [{ id: "profile", sharing: true }],
          }
        : undefined,
    ),
    respondWithAgent: vi.fn(async (..._args: any[]) => ({
      text: "Held virtual stocks",
      details: { tools: [], citations: [], durationMs: 1 },
    })),
  };
  const make = () => {
    const h = new ArenaHost(data as any, chat as any, () => ({
      run: vi.fn(),
      answer: vi.fn(),
      close: vi.fn(),
    }));
    hosts.push(h);
    return h;
  };
  return { e, data, chat, host: make(), make };
}
it("runs serial decisions after each completion and stops exactly at its durable budget", async () => {
  const s = setup();
  await s.host.request("auto.start", params);
  await vi.advanceTimersByTimeAsync(100);
  expect(s.chat.respondWithAgent).toHaveBeenCalledTimes(1);
  expect(s.e.day).toBe(1);
  await vi.advanceTimersByTimeAsync(29900);
  expect(s.chat.respondWithAgent).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(s.chat.respondWithAgent).toHaveBeenCalledTimes(2);
  expect(s.e.day).toBe(2);
  expect(s.e.automation.enabled).toBe(false);
  await vi.advanceTimersByTimeAsync(120000);
  expect(s.chat.respondWithAgent).toHaveBeenCalledTimes(2);
});
it("waits for Chat without admitting a failed Arena turn", async () => {
  const s = setup();
  s.chat.inferenceBusy = true;
  await s.host.request("auto.start", params);
  await vi.advanceTimersByTimeAsync(100);
  expect(s.chat.respondWithAgent).not.toHaveBeenCalled();
  expect(
    s.data.arenaControl.mock.calls.some((c) => c[0] === "arena.run.begin"),
  ).toBe(false);
  expect(s.e.automation.reason).toMatch(/Waiting/);
  s.chat.inferenceBusy = false;
  await vi.advanceTimersByTimeAsync(15000);
  expect(s.chat.respondWithAgent).toHaveBeenCalledOnce();
});
it("never overlaps a slow model and pause aborts only owned scheduled work", async () => {
  const s = setup();
  s.chat.respondWithAgent.mockImplementationOnce(async (...args: any[]) => {
    await new Promise((_, reject) =>
      args[3].addEventListener("abort", () => reject(Error("Cancelled"))),
    );
    throw Error("unreachable");
  });
  await s.host.request("auto.start", params);
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(120000);
  expect(s.chat.respondWithAgent).toHaveBeenCalledOnce();
  await s.host.request("auto.pause", { episodeId: params.episodeId });
  await vi.advanceTimersByTimeAsync(0);
  expect(s.e.automation.enabled).toBe(false);
  expect(s.e.day).toBe(0);
  expect(s.chat.request).toHaveBeenCalledWith(
    "cancelResponse",
    expect.objectContaining({ requestId: s.e.run.id }),
  );
  await vi.advanceTimersByTimeAsync(60000);
  expect(s.chat.respondWithAgent).toHaveBeenCalledOnce();
});
it("resumes persisted budgets after restart and never catches up missed rounds in a burst", async () => {
  const s = setup();
  await s.host.request("auto.start", { ...params, maxRounds: 3 });
  await vi.advanceTimersByTimeAsync(100);
  expect(s.e.automation.completed).toBe(1);
  await s.host.dispose();
  vi.setSystemTime(new Date(Date.now() + 3600000));
  const next = s.make();
  await next.recover();
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.e.automation.completed).toBe(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.e.automation.completed).toBe(2);
  await vi.advanceTimersByTimeAsync(29000);
  expect(s.e.automation.completed).toBe(3);
});
it("pauses when the authorized account changes instead of spending on another account", async () => {
  const s = setup();
  await s.host.request("auto.start", params);
  s.chat.request.mockImplementationOnce(async () => ({
    activeProfileId: "different",
    profiles: [{ id: "different", sharing: true }],
  }));
  await vi.advanceTimersByTimeAsync(100);
  expect(s.e.automation.enabled).toBe(false);
  expect(s.chat.respondWithAgent).not.toHaveBeenCalled();
});
it("rejects scheduling injection and malformed intervals before persistence", async () => {
  const s = setup();
  for (const p of [
    { ...params, intervalSeconds: 0 },
    { ...params, intervalSeconds: 30.1 },
    { ...params, maxRounds: 253 },
    { ...params, command: "shell" },
    { ...params, effort: "bad" },
  ])
    await expect(s.host.request("auto.start", p)).rejects.toThrow();
  expect(s.data.arenaControl).not.toHaveBeenCalled();
});

it("a late response from a paused timer cannot disable a newly started batch", async () => {
  const s = setup();
  const original = s.data.arenaControl.getMockImplementation()!;
  let release!: () => void,
    held = false;
  s.data.arenaControl.mockImplementation(async (method, p) => {
    const out = await original(method, p);
    if (method === "arena.run.finish" && !held) {
      held = true;
      await new Promise<void>((r) => (release = r));
    }
    return out;
  });
  await s.host.request("auto.start", params);
  await vi.advanceTimersByTimeAsync(100);
  expect(held).toBe(true);
  await s.host.request("auto.pause", { episodeId: params.episodeId });
  await s.host.request("auto.start", params);
  release();
  await vi.advanceTimersByTimeAsync(1100);
  expect(s.chat.respondWithAgent).toHaveBeenCalledTimes(2);
  expect(s.e.automation.enabled).toBe(true);
});
