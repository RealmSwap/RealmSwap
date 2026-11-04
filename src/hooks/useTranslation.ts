"use client";

import { useContext } from "react";
import { LocaleContext, dictionaries } from "@/components/LocaleProvider";

/**
 * Translate a namespaced key ("wizard.title") with optional {placeholder}
 * interpolation. Falls back to English, then to the key itself, so a missing
 * string can never blank the UI — and components mounted outside the
 * LocaleProvider simply render English instead of crashing.
 */
export function useTranslation() {
  const ctx = useContext(LocaleContext);

  if (!ctx) {
    return {
      locale: "en",
      setLocale: () => {},
      t: (key: string, vars?: Record<string, string | number>) => {
        const raw = dictionaries.en[key] ?? key;
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
          vars[name] !== undefined ? String(vars[name]) : `{${name}}`
        );
      },
    };
  }

  return ctx;
}
