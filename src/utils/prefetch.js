const prefetchedLoaders = new WeakSet();

const isTestEnv = () => {
  try {
    return import.meta.env?.MODE === 'test' || Boolean(import.meta.env?.VITEST);
  } catch {
    return false;
  }
};

export function prefetchLoader(loader) {
  if (typeof loader !== 'function' || prefetchedLoaders.has(loader)) {
    return;
  }
  prefetchedLoaders.add(loader);
  try {
    Promise.resolve(loader()).catch(() => {
      prefetchedLoaders.delete(loader);
    });
  } catch {
    prefetchedLoaders.delete(loader);
  }
}

export function scheduleIdlePrefetch(loaders, options = {}) {
  if (typeof window === 'undefined' || isTestEnv()) {
    return () => {};
  }

  const validLoaders = (Array.isArray(loaders) ? loaders : []).filter((fn) => typeof fn === 'function');
  if (validLoaders.length === 0) {
    return () => {};
  }

  const delayMs = options.delayMs ?? 450;
  const timeoutMs = options.timeoutMs ?? 2000;
  let cancelled = false;
  let delayTimerId = null;
  let idleHandle = null;

  const runPrefetch = () => {
    if (cancelled) return;
    for (const loader of validLoaders) {
      prefetchLoader(loader);
    }
  };

  delayTimerId = window.setTimeout(() => {
    delayTimerId = null;
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(runPrefetch, { timeout: timeoutMs });
    } else {
      runPrefetch();
    }
  }, delayMs);

  return () => {
    cancelled = true;
    if (delayTimerId !== null) {
      window.clearTimeout(delayTimerId);
      delayTimerId = null;
    }
    if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
  };
}
