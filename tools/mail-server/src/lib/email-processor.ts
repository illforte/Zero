import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

interface ProcessEmailOptions {
  html: string;
  shouldLoadImages: boolean;
  theme: 'light' | 'dark';
}

export function processEmailHtml({ html, shouldLoadImages, theme }: ProcessEmailOptions): {
  processedHtml: string;
  hasBlockedImages: boolean;
} {
  // Sanitize HTML
  const sanitizeConfig: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'title', 'details', 'summary', 'style',
    ]),
    allowedAttributes: {
      '*': ['class', 'style', 'align', 'valign', 'width', 'height', 'cellpadding', 'cellspacing', 'border', 'bgcolor', 'colspan', 'rowspan'],
      a: ['href', 'name', 'target', 'rel', 'class', 'style'],
      img: ['src', 'alt', 'width', 'height', 'class', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: attribs['target'] || '_blank', rel: 'noopener noreferrer' },
      }),
    },
  };

  const sanitized = sanitizeHtml(html, sanitizeConfig);
  const $ = cheerio.load(sanitized);
  let hasBlockedImages = false;

  if (!shouldLoadImages) {
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && !src.startsWith('cid:')) {
        hasBlockedImages = true;
        $(el).replaceWith(`<span style="display:none;"><!-- blocked image --></span>`);
      }
    });
  }

  // Collapse quoted text
  const collapseQuoted = (selector: string) => {
    $(selector).each((_, el) => {
      const $el = $(el);
      if ($el.parents('details.quoted-toggle').length) return;
      const inner = $el.html();
      if (typeof inner !== 'string') return;
      $el.replaceWith(
        `<details class="quoted-toggle" style="margin-top:1em;"><summary style="cursor:pointer;">Show quoted text</summary>${inner}</details>`,
      );
    });
  };

  collapseQuoted('blockquote');
  collapseQuoted('.gmail_quote');

  $('title').remove();
  $('img[width="1"][height="1"]').remove();
  $('img[width="0"][height="0"]').remove();

  const isDark = theme === 'dark';
  const themeStyles = `<style type="text/css">:host{display:block;background-color:${isDark ? '#1A1A1A' : '#ffffff'};color:${isDark ? '#ffffff' : '#000000'};}a{color:${isDark ? '#60a5fa' : '#2563eb'};}</style>`;

  return {
    processedHtml: `${themeStyles}${$.html()}`,
    hasBlockedImages,
  };
}
