"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

export const dictionaries: Record<string, Record<string, string>> = { en, es };

export const LOCALES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
] as const;

const STORAGE_KEY = "gamevault_locale"; // carried over from the original hook

interface LocaleContextType {
  locale: string;
  setLocale: (next: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

/**
 * App-wide locale. The stored preference lands after mount (not during
 * render) so server markup and the first client render always agree —
 * Spanish users see a one-frame English flash instead of a hydration
 * mismatch. localStorage-only for now; server-side persistence rides along
 * when user preferences gain a locale field.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && dictionaries[saved]) setLocaleState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: string) => {
    if (!dictionaries[next]) return;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        vars[name] !== undefined ? String(vars[name]) : `{${name}}`
      );
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
