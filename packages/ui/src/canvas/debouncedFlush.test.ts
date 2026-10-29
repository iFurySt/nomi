import { afterEach, describe, it, expect, vi } from "vitest";
import { createDebouncedFlush } from "./debouncedFlush";
describe("document save scheduling", () => {
  afterEach(() => vi.useRealTimers());
  it("coalesces a typing burst and writes the latest snapshot after idle", () => {
    vi.useFakeTimers();
    let source = "";
    const written: string[] = [];
    const q = createDebouncedFlush(() => written.push(source));
    for (const c of "连续写作") {
      source += c;
      q.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(written).toEqual([]);
    vi.advanceTimersByTime(600);
    expect(written).toEqual(["连续写作"]);
  });
  it("does not starve saves during continuous typing; cancelling removes both deadlines", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const q = createDebouncedFlush(save);
    for (let i = 0; i < 30; i++) {
      q.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(save).toHaveBeenCalledTimes(1);
    q.schedule();
    q.cancel();
    vi.advanceTimersByTime(4000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
