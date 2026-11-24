const RAW_BUNDLE_URL =
  'https://raw.githubusercontent.com/SparkTech-2049/Shadowrocket-Rule-Sets/refs/heads/main/dist/shadowrocket.rules';
const GH_PROXY_PREFIX = 'https://gh-proxy.org/';
const BUNDLE_HEADER = '# Shadowrocket-Rule-Sets v1';
const CACHE_KEY = 'node_cache_sr_rule_bundle_v1';
const REFRESH_INTERVAL = 60 * 60 * 1000;
const MAX_BYTES = 3_000_000;
const DOMAIN_RULE = /^(DOMAIN(?:-SUFFIX)?,[a-z0-9-]+(?:\.[a-z0-9-]+)+),(DIRECT|PROXY,force-remote-dns)$/;
const IP_RULE = /^(IP-CIDR,\d{1,3}(?:\.\d{1,3}){3}\/(?:[1-9]|[12]\d|3[0-2])),(DIRECT|PROXY),no-resolve$/;

let lastGood;
let retryAfter = 0;
let inFlight;

export function resetShadowrocketRuleBundleState() {
  lastGood = undefined;
  retryAfter = 0;
  inFlight = undefined;
}

export function usesShadowrocketRuleBundle(templateText) {
  let inMiSub = false;
  for (const raw of String(templateText || '').split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (/^\[[^\]]+\]$/.test(line)) inMiSub = line === '[misub]';
    else if (inMiSub && /^shadowrocket-rule-bundle\s*=\s*true$/.test(line)) return true;
  }
  return false;
}

export function parseShadowrocketRuleBundle(text) {
  const lines = String(text || '').trimEnd().split(/\r?\n/);
  if (lines[0] !== BUNDLE_HEADER || lines.length < 51) {
    throw new Error('Invalid rule bundle header or count');
  }
  const keys = new Set();
  return lines.map((lineText) => {
    if (lineText.startsWith('# ') && ![...lineText].some((ch) => {
      const code = ch.charCodeAt(0);
      return code === 13 || code <= 8;
    })) return { text: lineText };
    const [, key, action] = lineText.match(DOMAIN_RULE) || lineText.match(IP_RULE) || [];
    if (!key || keys.has(key)) throw new Error('Invalid or duplicate bundled rule');
    keys.add(key);
    return { text: lineText, key, proxy: action.startsWith('PROXY') };
  });
}

async function readBundleResponse(response) {
  if (!response.ok || !response.body) throw new Error(`Rule bundle HTTP ${response.status}`);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('Rule bundle is too large');
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

async function fetchBundleWithMirror({ isChinaClient = false } = {}) {
  const urls = isChinaClient ? [`${GH_PROXY_PREFIX}${RAW_BUNDLE_URL}`, RAW_BUNDLE_URL] : [RAW_BUNDLE_URL];
  let lastError;
  for (const targetUrl of urls) {
    try {
      const response = await fetch(targetUrl, {
        headers: { Accept: 'text/plain' },
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
        cf: { cacheEverything: true, cacheTtlByStatus: { 200: 300, '300-599': 0 } },
      });
      return await readBundleResponse(response);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Failed to fetch Shadowrocket rule bundle');
}

function refreshRuleBundle(storageAdapter, { isChinaClient = false } = {}) {
  if (inFlight) return inFlight;
  inFlight = fetchBundleWithMirror({ isChinaClient })
    .then(async (text) => {
      lastGood = parseShadowrocketRuleBundle(text);
      const updatedAt = Date.now();
      retryAfter = updatedAt + REFRESH_INTERVAL;
      try {
        if (storageAdapter?.put) {
          await storageAdapter.put(CACHE_KEY, {
            text,
            timestamp: updatedAt,
          });
        }
      } catch (error) {
        console.warn(`[Shadowrocket] Rule snapshot cache write failed: ${error?.message || error}`);
      }
      return lastGood;
    })
    .catch((error) => {
      console.warn(`[Shadowrocket] Using previous cached rules: ${error?.message || error}`);
      retryAfter = Date.now() + 5 * 60 * 1000;
      return lastGood;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

async function readStoredBundle(storageAdapter) {
  if (!storageAdapter?.get) return null;
  const cached = await storageAdapter.get(CACHE_KEY);
  const text = typeof cached?.text === 'string' ? cached.text : '';
  const timestamp = Number(cached?.timestamp) || 0;
  if (!text || text.length > MAX_BYTES + 32 || !timestamp) return null;
  return { rules: parseShadowrocketRuleBundle(text), updatedAt: timestamp };
}

export async function loadShadowrocketRuleBundle(context = {}) {
  const { storageAdapter = null, isChinaClient = false, waitUntil = null } = context || {};
  if (Date.now() < retryAfter && lastGood) return lastGood;

  if (!lastGood && storageAdapter) {
    try {
      const stored = await readStoredBundle(storageAdapter);
      if (stored) {
        lastGood = stored.rules;
        retryAfter = stored.updatedAt + REFRESH_INTERVAL;
      }
    } catch (error) {
      console.warn(`[Shadowrocket] Rule snapshot cache read failed: ${error?.message || error}`);
    }
  }

  if (Date.now() >= retryAfter || !lastGood) {
    const refreshPromise = refreshRuleBundle(storageAdapter, { isChinaClient });
    if (lastGood && typeof waitUntil === 'function') {
      waitUntil(refreshPromise);
      return lastGood;
    }
    return refreshPromise;
  }

  return lastGood;
}

export function formatShadowrocketRuleBundle(bundle, managedProxy, existingKeys) {
  if (!Array.isArray(bundle) || bundle.length === 0) return '';
  return bundle
    .filter(({ key }) => !key || !existingKeys.has(key))
    .map(({ text, proxy }) => (proxy ? text.replace(',PROXY,', `,${managedProxy},`) : text))
    .join('\n');
}
