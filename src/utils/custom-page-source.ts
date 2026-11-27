import DOMPurify from 'dompurify';

interface ParsedCustomPageScript {
  src: string;
  content: string;
}

export interface ParsedCustomPageSource {
  html: string;
  css: string;
  title: string;
  description: string;
  stylesheets: string[];
  scripts: ParsedCustomPageScript[];
  hadFullDocument: boolean;
  extractedStyles: boolean;
  strippedScripts: boolean;
}

export const CUSTOM_PAGE_DOMPURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['data-slot', 'target'],
  FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'style'],
};

export const CUSTOM_PAGE_COMPONENT_PLACEHOLDERS = [
  'profiles',
  'announcement',
  'announcements',
  'hero',
  'guestbook',
  'theme_toggle',
] as const;

export const PORTAL_PAGE_COMPONENT_PLACEHOLDERS = [
  'overview',
  'quick_import',
  'quickImport',
  'multi_socks',
  'multiSocksTable',
  'theme_toggle',
] as const;

export const CUSTOM_PAGE_SLOT_ALIASES: Record<string, string> = {
  announcement: 'announcements',
};

export const PORTAL_PAGE_SLOT_ALIASES: Record<string, string> = {
  quickImport: 'quick_import',
  multiSocksTable: 'multi_socks',
};

export function sanitizeCustomPageHtml(html: string): string {
  return DOMPurify.sanitize(html || '', CUSTOM_PAGE_DOMPURIFY_CONFIG);
}

export function escapeCustomPageText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderCustomPageHtml(
  parsedHtml: string,
  textVars: Record<string, string | number>,
  options: {
    componentPlaceholders?: readonly string[];
    slotAliases?: Record<string, string>;
  } = {},
): string {
  let html = parsedHtml || '';
  const componentPlaceholders = options.componentPlaceholders ?? CUSTOM_PAGE_COMPONENT_PLACEHOLDERS;
  const slotAliases = options.slotAliases ?? CUSTOM_PAGE_SLOT_ALIASES;

  for (const [key, val] of Object.entries(textVars)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    html = html.replace(regex, escapeCustomPageText(val));
  }

  componentPlaceholders.forEach((p) => {
    const slotName = slotAliases[p] ?? p;
    const regex = new RegExp(`{{\\s*${p}\\s*}}`, 'gi');
    html = html.replace(regex, `<div data-slot="${slotName}"></div>`);
  });

  return sanitizeCustomPageHtml(html);
}

export function parseCustomPageSource(content: string | null | undefined, css = ''): ParsedCustomPageSource {
  const rawContent = typeof content === 'string' ? content : '';
  const rawCss = typeof css === 'string' ? css : '';

  if (!rawContent.trim()) {
    return {
      html: '',
      css: rawCss,
      title: '',
      description: '',
      stylesheets: [],
      scripts: [],
      hadFullDocument: false,
      extractedStyles: false,
      strippedScripts: false,
    };
  }

  if (typeof DOMParser === 'undefined') {
    return {
      html: rawContent,
      css: rawCss,
      title: '',
      description: '',
      stylesheets: [],
      scripts: [],
      hadFullDocument: /<!DOCTYPE|<html|<head|<body/i.test(rawContent),
      extractedStyles: false,
      strippedScripts: false,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawContent, 'text/html');
  const hadFullDocument = /<!DOCTYPE|<html|<head|<body/i.test(rawContent);
  const title = doc.querySelector('title')?.textContent?.trim() || '';
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

  const styleBlocks = Array.from(doc.querySelectorAll('style')).map((node) => node.textContent || '');
  const stylesheetLinks = Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))
    .map((node) => node.getAttribute('href'))
    .filter((href): href is string => Boolean(href))
    .map(normalizeUrl);

  const scriptNodes = Array.from(doc.querySelectorAll('script'));
  const scripts: ParsedCustomPageScript[] = scriptNodes.map((node) => {
    const srcAttr = node.getAttribute('src');
    return {
      src: srcAttr ? normalizeUrl(srcAttr) : '',
      content: node.textContent || '',
    };
  });
  const strippedScripts = scriptNodes.length > 0;
  scriptNodes.forEach((node) => node.remove());

  doc.querySelectorAll('style, link[rel~="stylesheet"], meta, title').forEach((node) => node.remove());

  const body = doc.body;
  const extractedCss = normalizeDocumentCss([...styleBlocks, rawCss].filter(Boolean).join('\n\n'));
  const needsWrapper =
    hadFullDocument || body.attributes.length > 0 || /(^|[^\w-])(html|body|:root)(?=[^\w-]|$)/i.test(extractedCss);
  const html = needsWrapper ? wrapBodyContent(body) : body.innerHTML;

  return {
    html,
    css: extractedCss,
    title,
    description,
    stylesheets: stylesheetLinks,
    scripts,
    hadFullDocument,
    extractedStyles: styleBlocks.length > 0,
    strippedScripts,
  };
}

function normalizeUrl(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^http:\/\//i, 'https://');
}

function wrapBodyContent(body: HTMLElement): string {
  const attrs: string[] = [];
  const classes = ['custom-page-document', 'custom-page-html', 'custom-page-body'];

  Array.from(body.attributes).forEach((attr) => {
    if (attr.name === 'class') {
      classes.push(...String(attr.value).split(/\s+/).filter(Boolean));
      return;
    }
    attrs.push(`${attr.name}="${escapeHtmlAttribute(attr.value)}"`);
  });

  return `<div class="${Array.from(new Set(classes)).join(' ')}" ${attrs.join(' ')}>${body.innerHTML}</div>`;
}

function normalizeDocumentCss(cssText: string): string {
  if (!cssText.trim()) return '';

  return cssText
    .replace(/:root\b/g, '.custom-page-body')
    .replace(/(^|[\s,{>+~])html(?=($|[\s.#:[,{>+~]))/gm, '$1.custom-page-html')
    .replace(/(^|[\s,{>+~])body(?=($|[\s.#:[,{>+~]))/gm, '$1.custom-page-body');
}

function escapeHtmlAttribute(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
