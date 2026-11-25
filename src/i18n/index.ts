import { computed, inject, readonly, ref, shallowRef } from 'vue';
import type { App, InjectionKey, Ref } from 'vue';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
import zhCN from '@/i18n/locales/zh-CN.js';

export interface LocaleOption {
  code: string;
  label: string;
}

export interface LocaleMessages {
  [key: string]: string | LocaleMessages;
}

export type TranslationParams = Record<string, unknown>;

export interface CreateI18nOptions {
  initialLocale?: string;
}

export interface I18nInstance {
  locale: Ref<string>;
  supportedLocales: LocaleOption[];
  t: (key: string, params?: TranslationParams, forcedLocale?: string) => string;
  setLocale: (nextLocale: string) => void;
  install: (app: App) => void;
}

export const DEFAULT_LOCALE = 'zh-CN';
const LOCALE_STORAGE_KEY = 'misub:locale';
export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
];

const supportedCodes = new Set(SUPPORTED_LOCALES.map((item) => item.code));
const I18N_KEY: InjectionKey<I18nInstance> = Symbol('misub-i18n');

const loadedMessages = shallowRef<Record<string, LocaleMessages>>({
  'zh-CN': zhCN,
});

const localeLoaders: Record<string, () => Promise<{ default: LocaleMessages } | LocaleMessages>> = {
  'en-US': () => import('@/i18n/locales/en-US.js'),
};

const pendingLocaleLoads = new Map<string, Promise<LocaleMessages>>();

export function registerLocaleMessages(locale: string, dict: LocaleMessages | null | undefined): void {
  if (!locale || !dict) return;
  loadedMessages.value = {
    ...loadedMessages.value,
    [locale]: dict,
  };
}

export async function ensureLocaleLoaded(locale?: string): Promise<LocaleMessages> {
  const normalized = normalizeLocale(locale);
  const existing = loadedMessages.value[normalized];
  if (existing) return existing;

  const loader = localeLoaders[normalized];
  if (!loader) return loadedMessages.value[DEFAULT_LOCALE];

  const pending = pendingLocaleLoads.get(normalized);
  if (pending) return pending;

  const promise = loader()
    .then((mod) => {
      const dict =
        mod && typeof mod === 'object' && 'default' in mod && mod.default
          ? (mod.default as LocaleMessages)
          : (mod as LocaleMessages);
      registerLocaleMessages(normalized, dict);
      return dict;
    })
    .finally(() => {
      pendingLocaleLoads.delete(normalized);
    });
  pendingLocaleLoads.set(normalized, promise);

  return promise;
}

function readStoredLocale(): string {
  return readRawPreference(LOCALE_STORAGE_KEY) || '';
}

function writeStoredLocale(locale: string): void {
  // 写入失败（隐私模式 / 存储被禁用）只影响「下次启动的语言」，
  // 本次切换已经生效，不需要打扰用户。
  writeRawPreference(LOCALE_STORAGE_KEY, locale);
}

export function hasStoredLocale(): boolean {
  return supportedCodes.has(readStoredLocale());
}

function normalizeLocale(locale?: string | null): string {
  if (!locale || typeof locale !== 'string') return DEFAULT_LOCALE;
  if (supportedCodes.has(locale)) return locale;
  const lower = locale.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en-US';
  return DEFAULT_LOCALE;
}

export function detectInitialLocale(browserLanguages: string[] = []): string {
  const stored = readStoredLocale();
  if (supportedCodes.has(stored)) return stored;

  const candidates =
    Array.isArray(browserLanguages) && browserLanguages.length > 0
      ? browserLanguages
      : typeof navigator !== 'undefined'
        ? [navigator.language, ...(navigator.languages || [])]
        : [];

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (supportedCodes.has(normalized) && normalized !== DEFAULT_LOCALE) return normalized;
  }

  return DEFAULT_LOCALE;
}

function lookupMessage(locale: string, key: string): string | LocaleMessages | undefined {
  return key.split('.').reduce<string | LocaleMessages | undefined>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[part];
  }, loadedMessages.value[locale]);
}

function interpolate(template: string, params: TranslationParams = {}): string {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function createI18n(options: CreateI18nOptions = {}): I18nInstance {
  const initial = normalizeLocale(options.initialLocale || detectInitialLocale());
  const locale = ref<string>(initial);
  if (initial !== DEFAULT_LOCALE && !loadedMessages.value[initial]) {
    void ensureLocaleLoaded(initial);
  }

  const translate = (key: string, params: TranslationParams = {}, forcedLocale?: string): string => {
    const targetLocale = normalizeLocale(forcedLocale || locale.value);
    const resolved = lookupMessage(targetLocale, key) ?? lookupMessage(DEFAULT_LOCALE, key);
    if (resolved === undefined) return key;
    return typeof resolved === 'string' ? interpolate(resolved, params) : String(resolved);
  };

  const set = (nextLocale: string): void => {
    const normalized = normalizeLocale(nextLocale);
    if (!loadedMessages.value[normalized]) {
      void ensureLocaleLoaded(normalized);
    }
    locale.value = normalized;
    writeStoredLocale(normalized);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = normalized;
    }
  };

  const instance: I18nInstance = {
    locale,
    supportedLocales: SUPPORTED_LOCALES,
    t: translate,
    setLocale: set,
    install(app: App): void {
      app.provide(I18N_KEY, instance);
      app.config.globalProperties.$t = translate;
      app.config.globalProperties.$locale = readonly(locale);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = locale.value;
      }
    },
  };

  return instance;
}

export const i18n = createI18n();

export function t(key: string, params: TranslationParams = {}, forcedLocale?: string): string {
  return i18n.t(key, params, forcedLocale);
}

export function setLocale(locale: string): void {
  i18n.setLocale(locale);
}

export function useI18n() {
  const instance = inject(I18N_KEY, i18n);
  return {
    locale: instance.locale,
    supportedLocales: instance.supportedLocales,
    t: instance.t,
    setLocale: instance.setLocale,
    currentLocaleLabel: computed(
      () => SUPPORTED_LOCALES.find((item) => item.code === instance.locale.value)?.label || instance.locale.value,
    ),
  };
}
