"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { apiBase, plexEnabled } from "../../lib/site";
import { useLanguage } from "../LanguageProvider";
import { defaultPlans, type Plan } from "../../lib/plans";

export function Plans() {
  const { t, lang } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);

  useEffect(() => {
    fetch(`${apiBase}/products`)
      .then((res) => (res.ok ? res.json() : defaultPlans))
      .then((data: Plan[]) => {
        if (Array.isArray(data) && data.length) setPlans(data);
      })
      .catch(() => undefined);
  }, []);

  return (
    <section className="section plans" aria-labelledby="plans-title">
      <div className="section-head">
        <h2 id="plans-title">{t("landing.plans.title")}</h2>
        <p>{t("landing.plans.subtitle")}</p>
      </div>
      <div className="plan-grid">
        {plans.map((plan) => {
          const perMonth = plan.price_eur / plan.months;
          return (
            <article key={plan.id} className={`plan-card ${plan.popular ? "popular" : ""}`}>
              {plan.popular && <span className="badge">★ BEST</span>}
              <h3>
                {plan.icon} {(lang === "de" ? plan.label_de : plan.label_en) || plan.label}
              </h3>
              <p className="plan-price">
                €{plan.price_eur.toFixed(2)}
                <span className="plan-permonth">
                  €{perMonth.toFixed(2)} {t("landing.plans.permonth")}
                </span>
              </p>
              {plexEnabled && plan.months === 12 && (
                <p className="plan-perk">
                  <Check size={15} aria-hidden /> {t("landing.plans.plex")}
                </p>
              )}
              <Link className={plan.popular ? "btn-primary" : "btn-ghost"} href={`/pay?plan=${plan.id}`}>
                {t("landing.plans.cta")}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
