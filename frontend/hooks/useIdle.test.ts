import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIdleWatcher } from "./useIdle";

describe("createIdleWatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onIdle after the threshold with no activity", () => {
    const onIdle = vi.fn();
    const watcher = createIdleWatcher(1000, onIdle);
    watcher.start();
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("resets the timer on activity", () => {
    const onIdle = vi.fn();
    const watcher = createIdleWatcher(1000, onIdle);
    watcher.start();
    vi.advanceTimersByTime(900);
    watcher.notifyActivity();
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onIdle).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("does not fire after stop", () => {
    const onIdle = vi.fn();
    const watcher = createIdleWatcher(1000, onIdle);
    watcher.start();
    watcher.stop();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
