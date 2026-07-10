"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export function FinalCta() {
  const { t } = useLanguage();
  return (
    <section className="section final-cta" aria-labelledby="cta-title">
      <div className="final-cta-card">
        <h2 id="cta-title">{t("landing.cta.title")}</h2>
        <p>{t("landing.cta.body")}</p>
        <Link className="btn-primary" href="/pay">
          <Play size={17} aria-hidden /> {t("landing.hero.cta")}
        </Link>
      </div>
    </section>
  );
}
