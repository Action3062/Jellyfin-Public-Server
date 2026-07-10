"use client";

import { useLanguage } from "../LanguageProvider";

/**
 * Full-width cinematic image band (Higgsfield artwork). The image is layered
 * under a gradient in CSS, so a missing asset degrades to a pure gradient.
 */
export function CinematicBand() {
  const { t } = useLanguage();
  return (
    <section className="cinematic-band" role="img" aria-label={t("landing.features.library.title")}>
      <div className="cinematic-band-caption">
        <h2>{t("landing.features.library.title")}</h2>
        <p>{t("landing.features.library.body")}</p>
      </div>
    </section>
  );
}
