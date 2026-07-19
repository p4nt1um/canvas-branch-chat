/**
 * locale/index.ts — i18n entry: t() function + language detection
 *
 * Usage:
 *   import { t } from './locale';
 *   new Notice(t('notice.noModel'));
 *   t('menu.mergeN', { n: 3 });
 */

import { Platform } from 'obsidian';
import { zh } from './zh';
import { en } from './en';

type Locale = Record<string, string>;

const locales: Record<string, Locale> = { zh, en };

/** Detect Obsidian UI language (system default) */
function detectSystemLocale(): string {
  // moment locale is the most reliable way in Obsidian
  const ml = (window.moment as typeof import('moment') | undefined)?.locale?.();
  if (ml) {
    if (ml.startsWith('zh')) return 'zh';
    if (ml.startsWith('en')) return 'en';
  }
  // fallback
  return 'en';
}

let currentLocale: string = detectSystemLocale();

/**
 * Apply language setting.
 * - 'auto'  → follow Obsidian system locale
 * - 'zh'    → force Chinese
 * - 'en'    → force English
 */
export function setLocale(locale: string): void {
  if (locale === 'auto' || !locales[locale]) {
    currentLocale = detectSystemLocale();
  } else {
    currentLocale = locale;
  }
}

/** Get current locale */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Translate a key with optional template parameters.
 * t('menu.mergeN', { n: 3 }) → "🔀 合并 3 个分支"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = locales[currentLocale] || locales['en'];
  let str = dict[key] ?? locales['en'][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
