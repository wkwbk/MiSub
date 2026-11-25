export type PrefetchLoader = () => unknown;

export interface IdlePrefetchOptions {
  delayMs?: number;
  timeoutMs?: number;
}

const prefetchedLoaders = new WeakSet<PrefetchLoader>();

const isTestEnv = (): boolean => {
  try {
    return import.meta.env?.MODE === 'test' || Boolean(import.meta.env?.VITEST);
  } catch {
    return false;
  }
};

export function prefetchLoader(loader: PrefetchLoader | null | undefined): void {
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

export function scheduleIdlePrefetch(
  loaders: PrefetchLoader[] | null | undefined,
  options: IdlePrefetchOptions = {},
): () => void {
  if (typeof window === 'undefined' || isTestEnv()) {
    return () => {};
  }

  const validLoaders = (Array.isArray(loaders) ? loaders : []).filter(
    (fn): fn is PrefetchLoader => typeof fn === 'function',
  );
  if (validLoaders.length === 0) {
    return () => {};
  }

  const delayMs = options.delayMs ?? 450;
  const timeoutMs = options.timeoutMs ?? 2000;
  let cancelled = false;
  let delayTimerId: number | null = null;
  let idleHandle: number | null = null;

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
