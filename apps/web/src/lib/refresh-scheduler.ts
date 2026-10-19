// Agrupa ráfagas y serializa las recargas. Si llega un evento durante una
// consulta, queda pendiente otra pasada; no se pierde detrás de inFlight.
export function createRefreshScheduler(run: () => Promise<void>,
  options: { batchMs?: number; minIntervalMs?: number; now?: () => number } = {}) {
  const batchMs = options.batchMs ?? 200;
  const minimum = options.minIntervalMs ?? 1000;
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false, dirty = false, stopped = false, visible = true;
  let lastStarted = -Infinity;
  function schedule(immediate = false) {
    if (stopped || !visible || running || timer || !dirty) return;
    const delay = Math.max(immediate ? 0 : batchMs, minimum - (now() - lastStarted));
    timer = setTimeout(() => {
      timer = undefined;
      if (stopped || !visible || !dirty) return;
      dirty = false; running = true; lastStarted = now();
      void Promise.resolve().then(run).catch(() => undefined).finally(() => {
        running = false; schedule();
      });
    }, Math.max(0, delay));
  }
  return {
    request(immediate = false) { dirty = true; schedule(immediate); },
    setVisible(value: boolean) {
      visible = value;
      if (!visible && timer) { clearTimeout(timer); timer = undefined; }
      if (visible) { dirty = true; schedule(true); }
    },
    dispose() { stopped = true; dirty = false; if (timer) clearTimeout(timer); },
  };
}
