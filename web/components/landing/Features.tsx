"use client";

import { Film, Gauge, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export function Features() {
  const { t } = useLanguage();
  const features = [
    { icon: Film, title: t("landing.features.library.title"), body: t("landing.features.library.body") },
    { icon: Gauge, title: t("landing.features.speed.title"), body: t("landing.features.speed.body") },
    { icon: ShieldCheck, title: t("landing.features.privacy.title"), body: t("landing.features.privacy.body") },
    { icon: MonitorSmartphone, title: t("landing.features.apps.title"), body: t("landing.features.apps.body") }
  ];

  return (
    <section className="section features" aria-labelledby="features-title">
      <div className="section-head">
        <h2 id="features-title">{t("landing.features.title")}</h2>
        <p>{t("landing.features.subtitle")}</p>
      </div>
      <div className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="feature-card">
            <feature.icon size={22} aria-hidden className="feature-icon" />
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
