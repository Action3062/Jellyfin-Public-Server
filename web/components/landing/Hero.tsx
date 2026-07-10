"use client";

import Link from "next/link";
import { Play, ShieldCheck } from "lucide-react";
import { useLanguage } from "../LanguageProvider";

export function Hero() {
  const { t } = useLanguage();
  const [titleLine1, titleLine2] = t("landing.hero.title").split("\n");

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-inner">
        <p className="hero-badge">
          <ShieldCheck size={15} aria-hidden /> {t("landing.badge")}
        </p>
        <h1 id="hero-title">
          {titleLine1}
          <br />
          <span className="accent">{titleLine2}</span>
        </h1>
        <p className="hero-subtitle">{t("landing.hero.subtitle")}</p>
        <div className="hero-actions">
          <Link className="btn-primary" href="/pay">
            <Play size={17} aria-hidden /> {t("landing.hero.cta")}
          </Link>
          <Link className="btn-ghost" href="/dashboard">
            {t("landing.hero.secondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
