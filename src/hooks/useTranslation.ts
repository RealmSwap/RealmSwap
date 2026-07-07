import { useState, useEffect } from "react";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

const translations: Record<string, Record<string, string>> = {
  en,
  es
};

export function useTranslation() {
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    const savedLocale = localStorage.getItem("gamevault_locale");
    if (savedLocale && translations[savedLocale]) {
      setLocale(savedLocale);
    }
  }, []);

  const t = (key: keyof typeof en) => {
    return translations[locale]?.[key] || translations["en"][key] || key;
  };

  const changeLocale = (newLocale: string) => {
    if (translations[newLocale]) {
      setLocale(newLocale);
      localStorage.setItem("gamevault_locale", newLocale);
    }
  };

  return { t, locale, changeLocale };
}
