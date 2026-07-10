"use client";

import { useLanguage } from "../LanguageProvider";

export function Faq() {
  const { t } = useLanguage();
  const items = [
    { q: t("landing.faq.q1"), a: t("landing.faq.a1") },
    { q: t("landing.faq.q2"), a: t("landing.faq.a2") },
    { q: t("landing.faq.q3"), a: t("landing.faq.a3") },
    { q: t("landing.faq.q4"), a: t("landing.faq.a4") }
  ];
  return (
    <section className="section faq" aria-labelledby="faq-title">
      <div className="section-head">
        <h2 id="faq-title">{t("landing.faq.title")}</h2>
      </div>
      <div className="faq-list">
        {items.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
