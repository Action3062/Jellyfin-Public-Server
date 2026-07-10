"use client";

import { useLanguage } from "./LanguageProvider";

export function LangToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" className={lang === "de" ? "active" : ""} onClick={() => setLang("de")}>
        DE
      </button>
      <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>
        EN
      </button>
    </div>
  );
}
