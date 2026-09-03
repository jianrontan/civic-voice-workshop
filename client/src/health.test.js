import { afterEach, describe, expect, it, vi } from "vitest";
import { HEALTH_CHECK_INTERVAL_MS, startHealthPolling } from "./health";

function deferred() {
  let resolve;
  const promise = new Promise((completion) => { resolve = completion; });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("health polling lifecycle", () => {
  it("checks immediately, retries after completion, and recovers without remounting", async () => {
    vi.useFakeTimers();
    const firstCheck = deferred();
    const secondCheck = deferred();
    const checkHealth = vi.fn().mockReturnValueOnce(firstCheck.promise).mockReturnValueOnce(secondCheck.promise);
    const onHealthChange = vi.fn();
    const stopPolling = startHealthPolling(checkHealth, onHealthChange);

    expect(checkHealth).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS);
    expect(checkHealth).toHaveBeenCalledTimes(1);

    firstCheck.resolve(false);
    await flushPromises();
    expect(onHealthChange).toHaveBeenLastCalledWith("unavailable");

    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS);
    expect(checkHealth).toHaveBeenCalledTimes(2);
    secondCheck.resolve(true);
    await flushPromises();
    expect(onHealthChange).toHaveBeenLastCalledWith("available");

    stopPolling();
    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS * 2);
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it("ignores a pending result after cleanup", async () => {
    vi.useFakeTimers();
    const pendingCheck = deferred();
    const onHealthChange = vi.fn();
    const stopPolling = startHealthPolling(() => pendingCheck.promise, onHealthChange);

    stopPolling();
    pendingCheck.resolve(true);
    await flushPromises();
    expect(onHealthChange).not.toHaveBeenCalled();
  });
});
