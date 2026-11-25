<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { useThemeStore } from '@/stores/useThemeStore.js';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoadPromise = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Browser environment required'));
  }

  if (window.turnstile && typeof window.turnstile.render === 'function') {
    return Promise.resolve(window.turnstile);
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`);
    if (existing) {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve(window.turnstile);
        return;
      }
      existing.addEventListener(
        'load',
        () => {
          if (window.turnstile) resolve(window.turnstile);
          else {
            scriptLoadPromise = null;
            reject(new Error('Turnstile API unavailable'));
          }
        },
        { once: true },
      );
      existing.addEventListener(
        'error',
        () => {
          scriptLoadPromise = null;
          reject(new Error('Failed to load Turnstile script'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve(window.turnstile);
      } else {
        scriptLoadPromise = null;
        reject(new Error('Turnstile API unavailable'));
      }
    };
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('Failed to load Turnstile script'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

const props = defineProps({
  siteKey: {
    type: String,
    required: true,
  },
  theme: {
    type: String,
    default: '',
  },
  action: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    default: 'normal',
  },
});

const emit = defineEmits(['verify', 'expire', 'error']);

const themeStore = getActivePinia() ? useThemeStore() : null;
const containerRef = ref(null);
const loadFailed = ref(false);
let widgetId = null;
let unmounted = false;

const resolvedTheme = computed(() => {
  if (props.theme === 'light' || props.theme === 'dark' || props.theme === 'auto') {
    return props.theme;
  }
  if (!themeStore) {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  return themeStore.theme === 'dark' ? 'dark' : 'light';
});

function removeWidget() {
  if (widgetId !== null && typeof window !== 'undefined' && window.turnstile?.remove) {
    try {
      window.turnstile.remove(widgetId);
    } catch {
      // ignore cleanup errors
    }
  }
  widgetId = null;
}

async function renderWidget() {
  if (unmounted || !props.siteKey || !containerRef.value) return;
  loadFailed.value = false;
  removeWidget();

  try {
    const turnstile = await loadTurnstileScript();
    if (unmounted || !containerRef.value) return;

    widgetId = turnstile.render(containerRef.value, {
      sitekey: props.siteKey,
      theme: resolvedTheme.value,
      size: props.size,
      ...(props.action ? { action: props.action } : {}),
      callback: (token) => {
        emit('verify', token);
      },
      'expired-callback': () => {
        emit('expire');
      },
      'error-callback': (code) => {
        emit('error', code || 'turnstile_error');
      },
    });
  } catch (err) {
    if (!unmounted) {
      loadFailed.value = true;
      emit('error', err?.message || 'turnstile_load_failed');
    }
  }
}

function reset() {
  if (widgetId !== null && typeof window !== 'undefined' && window.turnstile?.reset) {
    try {
      window.turnstile.reset(widgetId);
      return;
    } catch {
      // fall through to re-render
    }
  }
  renderWidget();
}

onMounted(() => {
  renderWidget();
});

watch(
  () => [props.siteKey, resolvedTheme.value],
  () => {
    emit('expire');
    renderWidget();
  },
);

onBeforeUnmount(() => {
  unmounted = true;
  removeWidget();
});

defineExpose({ reset });
</script>

<template>
  <div class="turnstile-widget-wrapper min-h-[65px] flex items-center">
    <div ref="containerRef" class="w-full" />
  </div>
</template>
