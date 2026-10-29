import { expect, it, vi } from "vitest";
import { ArenaHost } from "./arena";
import type { AgentRuntime } from "./codex-runtime";
const params = {
  episodeId: "a".repeat(32),
  profileId: "profile-test",
  model: "gpt-test",
};
function setup() {
  const control = vi.fn(async (method: string, p?: any) =>
    method === "arena.run.finish"
      ? { episode: { run: { status: p.status }, summary: p.summary } }
      : {},
  );
  const close = vi.fn(),
    agent = { run: vi.fn(), answer: vi.fn(), close } as AgentRuntime;
  const respond = vi.fn(async (..._args: any[]) => ({
    text: "A public thesis",
    details: { tools: [], citations: [], durationMs: 1 },
  }));
  const request = vi.fn(async () => {}),
    factory = vi.fn(() => agent);
  const host = new ArenaHost(
    { request: vi.fn(), arenaControl: control } as any,
    { respondWithAgent: respond, request } as any,
    factory,
  );
  return { host, control, respond, close, request, factory };
}
it("binds a private runtime and commits via Go instead of parsing model text", async () => {
  const s = setup();
  await s.host.request("run", params);
  const begin = s.control.mock.calls[0];
  expect(begin[0]).toBe("arena.run.begin");
  expect(begin[1].runId).toMatch(/^[a-f0-9]{32}$/);
  expect(s.factory).toHaveBeenCalledWith(params.episodeId, begin[1].runId);
  const req = s.respond.mock.calls[0][0];
  expect(req.conversationId).toBe(begin[1].runId);
  expect(req.messages[0].content.length).toBeLessThan(2000);
  expect(s.control.mock.calls[1]).toEqual([
    "arena.run.finish",
    expect.objectContaining({
      status: "succeeded",
      summary: "A public thesis",
    }),
  ]);
  expect(s.close).toHaveBeenCalledOnce();
});
it("records failure through the coordinator so an accepted intent can still settle", async () => {
  const s = setup();
  s.respond.mockRejectedValueOnce(Error("Network disconnected"));
  await s.host.request("run", params);
  expect(s.control).toHaveBeenLastCalledWith(
    "arena.run.finish",
    expect.objectContaining({
      status: "failed",
      summary: "Network disconnected",
    }),
  );
  expect(s.close).toHaveBeenCalledOnce();
});
it("rejects concurrent sessions and cancels only its own inference", async () => {
  const s = setup();
  s.respond.mockImplementationOnce(async (...args: any[]) => {
    await new Promise((_, reject) =>
      args[3].addEventListener("abort", () => reject(Error("Cancelled"))),
    );
    throw Error("unreachable");
  });
  const job = s.host.request("run", params);
  await vi.waitFor(() => expect(s.respond).toHaveBeenCalledOnce());
  await expect(s.host.request("run", params)).rejects.toThrow(
    "already running",
  );
  await s.host.request("cancel", undefined);
  await job;
  expect(s.request).toHaveBeenCalledWith("cancelResponse", {
    requestId: s.control.mock.calls[0][1].runId,
  });
  expect(s.control).toHaveBeenLastCalledWith(
    "arena.run.finish",
    expect.objectContaining({ status: "cancelled" }),
  );
});
it("rejects caller runtime overrides and does not finalize an unstarted session", async () => {
  const s = setup();
  await expect(
    s.host.request("run", { ...params, dataDir: "/tmp" }),
  ).rejects.toThrow("Invalid");
  expect(s.control).not.toHaveBeenCalled();
  s.control.mockRejectedValueOnce(Error("ARENA_BUSY"));
  await expect(s.host.request("run", params)).rejects.toThrow("ARENA_BUSY");
  expect(s.control).toHaveBeenCalledOnce();
  expect(s.factory).not.toHaveBeenCalled();
});
