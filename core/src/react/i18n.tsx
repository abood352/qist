import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../format';

/**
 * Tiny i18n: a flat dictionary per language, `{name}` interpolation, Arabic by default.
 * Switching language flips <html lang dir>, so every logical CSS property mirrors at once.
 */
export type Dict = Record<string, string>;
export type Localized = { ar: string; en: string };

interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** pick the right side of a bilingual data field */
  l: (value: Localized) => string;
  setLang: (lang: Lang) => void;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ dicts, storageKey, children }: { dicts: Record<Lang, Dict>; storageKey: string; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch {
      /* ignore */
    }
    return 'ar';
  });

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const value = useMemo<I18n>(() => {
    const dict = dicts[lang];
    // Plurals: when vars.n is a number, `key#one` / `#two` / `#few` / `#many` / `#other` win over `key`
    // (Intl plural categories — Arabic has six). Dictionaries without them behave as before.
    const rules = new Intl.PluralRules(lang);
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: (key, vars) => {
        const n = vars?.n;
        const plural = typeof n === 'number' ? dict[`${key}#${rules.select(n)}`] : undefined;
        let s = plural ?? dict[key] ?? dicts.ar[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      l: (v) => v[lang],
      setLang,
    };
  }, [dicts, lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
