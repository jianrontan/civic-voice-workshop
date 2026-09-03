export const HEALTH_CHECK_INTERVAL_MS = 5_000;

export function startHealthPolling(checkHealth, onHealthChange) {
  let active = true;
  let retryTimer;

  async function poll() {
    let available = false;
    try {
      available = await checkHealth();
    } catch {
      available = false;
    }

    if (!active) return;
    onHealthChange(available ? "available" : "unavailable");
    retryTimer = setTimeout(poll, HEALTH_CHECK_INTERVAL_MS);
  }

  void poll();
  return () => {
    active = false;
    clearTimeout(retryTimer);
  };
}
