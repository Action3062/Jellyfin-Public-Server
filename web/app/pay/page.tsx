"use client";

import { Suspense } from "react";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { CheckoutForm } from "../../components/checkout/CheckoutForm";
import { useLanguage } from "../../components/LanguageProvider";
import { shopName } from "../../lib/site";

function PayPageBody() {
  const { t } = useLanguage();
  return (
    <main className="page narrow">
      <header className="page-head">
        <h1>
          {shopName} — {t("pay.title")}
        </h1>
        <p className="hint">{t("pay.banner")}</p>
      </header>

      <section className="info">
        <h2>{t("pay.why.title")}</h2>
        <p>{t("pay.why.body")}</p>
      </section>

      <CheckoutForm />
    </main>
  );
}

export default function PayPage() {
  return (
    <div className="subpage">
      <SiteHeader />
      <Suspense fallback={null}>
        <PayPageBody />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
