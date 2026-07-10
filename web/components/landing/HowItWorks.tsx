"use client";

import { useLanguage } from "../LanguageProvider";

export function HowItWorks() {
  const { t } = useLanguage();
  const steps = [
    { title: t("landing.how.step1.title"), body: t("landing.how.step1.body") },
    { title: t("landing.how.step2.title"), body: t("landing.how.step2.body") },
    { title: t("landing.how.step3.title"), body: t("landing.how.step3.body") }
  ];
  return (
    <section className="section how" aria-labelledby="how-title">
      <div className="section-head">
        <h2 id="how-title">{t("landing.how.title")}</h2>
      </div>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.title} className="step">
            <span className="step-number" aria-hidden>
              {index + 1}
            </span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
