"use client";

import { useLanguage } from "../LanguageProvider";

export function Stats() {
  const { t } = useLanguage();
  const stats = [
    { value: "2000+", label: t("landing.stats.movies") },
    { value: "500+", label: t("landing.stats.shows") },
    { value: "10 Gb/s", label: t("landing.stats.speed") },
    { value: "99,9 %", label: t("landing.stats.uptime") }
  ];
  return (
    <section className="stats" aria-label="Stats">
      {stats.map((stat) => (
        <div key={stat.label} className="stat">
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </section>
  );
}
