import DOMPurify from 'dompurify';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInlineMarkdown(rawText) {
  const escaped = escapeHtml(rawText);
  const codeTokens = [];
  const withPlaceholders = escaped.replace(/`([^`]+)`/g, (_, code) => {
    const index = codeTokens.length;
    codeTokens.push(
      `<code class="px-1.5 py-0.5 mx-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[11px]">${code}</code>`,
    );
    return `%%MISUB_CODE_${index}%%`;
  });

  const formatted = withPlaceholders
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 text-zinc-900 dark:text-zinc-100 hover:opacity-80">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-900 dark:text-zinc-100">$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  return formatted.replace(/%%MISUB_CODE_(\d+)%%/g, (_, idx) => codeTokens[Number(idx)] || '');
}

export function renderChangelogMarkdown(markdown) {
  const source = String(markdown || '').trim();
  if (!source) return '';

  const lines = source.split(/\r?\n/);
  const htmlBlocks = [];
  let listItems = [];
  let listType = null;

  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === 'ol' ? 'ol' : 'ul';
    const listClass = listType === 'ol' ? 'list-decimal pl-5 space-y-1.5 my-2' : 'list-disc pl-5 space-y-1.5 my-2';
    htmlBlocks.push(`<${tag} class="${listClass}">${listItems.join('')}</${tag}>`);
    listItems = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingClass =
        level === 1
          ? 'text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2'
          : 'text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5';
      htmlBlocks.push(
        `<h${level + 1} class="${headingClass}">${formatInlineMarkdown(headingMatch[2])}</h${level + 1}>`,
      );
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(`<li>${formatInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(`<li>${formatInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    flushList();
    htmlBlocks.push(`<p class="mb-2 last:mb-0">${formatInlineMarkdown(line)}</p>`);
  }

  flushList();

  return DOMPurify.sanitize(htmlBlocks.join(''), {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });
}
