"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Hourglass, TriangleAlert } from "lucide-react";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { useLanguage } from "../../../components/LanguageProvider";
import { apiBase } from "../../../lib/site";

type Order = {
  order_id: string;
  provider: "nowpayments" | "azteco";
  payment_status: string;
  payment_phase: "pending" | "paid" | "failed" | "underpaid";
  provision_state: "pending" | "awaiting_registration" | "provisioned" | "failed";
  account_mode: "existing" | "new";
  amount_eur: number;
  plan: { id: string; label_de: string; label_en: string; months: number };
  days: number | null;
  invoice_url: string | null;
  invite_url: string | null;
  plex_state: "none" | "pending" | "invited" | "failed";
  provisioned_at: string | null;
};

function tokenStorageKey(orderId: string) {
  return `portal-claim-${orderId}`;
}

export default function OrderPage() {
  const { t, lang } = useLanguage();
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [token, setToken] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
    const stored = sessionStorage.getItem(tokenStorageKey(orderId));
    const value = fromHash || stored;
    if (fromHash) sessionStorage.setItem(tokenStorageKey(orderId), fromHash);
    if (value) setToken(value);
    else setFailed(true);
  }, [orderId]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/order/${orderId}`, { headers: { "x-claim-token": token } });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as Order;
      setOrder(data);
      setFailed(false);
      const done =
        data.payment_phase === "failed" ||
        (data.payment_phase === "paid" && data.provision_state === "provisioned" && data.plex_state !== "pending");
      if (!done) {
        pollRef.current = setTimeout(load, data.payment_phase === "pending" ? 7000 : 15000);
      }
    } catch {
      pollRef.current = setTimeout(load, 15000);
    }
  }, [token, orderId]);

  useEffect(() => {
    if (!token) return;
    load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [token, load]);

  const claimLink = token && typeof window !== "undefined" ? `${window.location.origin}/order/${orderId}#t=${token}` : "";

  async function copyClaimLink() {
    if (!claimLink) return;
    await navigator.clipboard.writeText(claimLink).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="subpage">
      <SiteHeader />
      <main className="page narrow" data-testid="order-page">
        <header className="page-head">
          <h1>{t("order.title")}</h1>
          <p className="hint">{t("order.subtitle")}</p>
        </header>

        {failed && !order ? (
          <section className="card">
            <div className="status error">
              <TriangleAlert size={16} aria-hidden /> {t("order.notfound")}
            </div>
          </section>
        ) : !order ? (
          <section className="card">
            <div className="status checking">
              <span className="checking-dots" /> {t("common.loading")}
            </div>
          </section>
        ) : (
          <>
            <section className="card order-steps">
              <div
                className={`order-step ${order.payment_phase === "underpaid" ? "failed" : order.payment_phase}`}
                data-testid="step-payment"
              >
                <div className="order-step-head">
                  {order.payment_phase === "paid" ? (
                    <Check size={17} aria-hidden />
                  ) : order.payment_phase === "failed" ? (
                    <TriangleAlert size={17} aria-hidden />
                  ) : (
                    <Hourglass size={17} aria-hidden />
                  )}
                  <h2>{t("order.step.payment")}</h2>
                  <span className="order-step-meta">
                    €{order.amount_eur.toFixed(2)} · {lang === "de" ? order.plan.label_de : order.plan.label_en}
                  </span>
                </div>
                <p>
                  {order.payment_phase === "paid"
                    ? t("order.payment.paid")
                    : order.payment_phase === "failed"
                      ? t("order.payment.failed")
                      : order.payment_phase === "underpaid"
                        ? t("order.payment.underpaid")
                        : t("order.payment.pending")}{" "}
                  {order.payment_phase === "pending" && <span className="hint">({order.payment_status})</span>}
                </p>
                {order.payment_phase === "pending" && order.invoice_url && (
                  <a className="btn-ghost" href={order.invoice_url} target="_blank" rel="noreferrer">
                    {t("order.invoice.open")} <ExternalLink size={14} aria-hidden />
                  </a>
                )}
              </div>

              <div
                className={`order-step ${order.provision_state === "provisioned" ? "paid" : order.provision_state === "failed" ? "failed" : "pending"}`}
                data-testid="step-activation"
              >
                <div className="order-step-head">
                  {order.provision_state === "provisioned" ? (
                    <Check size={17} aria-hidden />
                  ) : order.provision_state === "failed" ? (
                    <TriangleAlert size={17} aria-hidden />
                  ) : (
                    <Hourglass size={17} aria-hidden />
                  )}
                  <h2>{t("order.step.activation")}</h2>
                </div>
                {order.payment_phase !== "paid" ? (
                  <p className="hint">—</p>
                ) : order.provision_state === "provisioned" ? (
                  <p>{t("order.provision.provisioned")}</p>
                ) : order.provision_state === "awaiting_registration" ? (
                  <>
                    <p>{t("order.provision.awaiting")}</p>
                    {order.invite_url && (
                      <a className="btn-primary" href={order.invite_url} target="_blank" rel="noreferrer" data-testid="invite-link">
                        {t("order.invite.open")} <ExternalLink size={14} aria-hidden />
                      </a>
                    )}
                    <p className="hint">{t("order.invite.hint")}</p>
                  </>
                ) : order.provision_state === "failed" ? (
                  <p>{t("order.provision.failed")}</p>
                ) : (
                  <p>{t("order.provision.pending")}</p>
                )}
              </div>

              {order.plex_state !== "none" && (
                <div className={`order-step ${order.plex_state === "invited" ? "paid" : order.plex_state === "failed" ? "failed" : "pending"}`}>
                  <div className="order-step-head">
                    {order.plex_state === "invited" ? (
                      <Check size={17} aria-hidden />
                    ) : order.plex_state === "failed" ? (
                      <TriangleAlert size={17} aria-hidden />
                    ) : (
                      <Hourglass size={17} aria-hidden />
                    )}
                    <h2>{t("order.step.plex")}</h2>
                  </div>
                  <p>
                    {order.plex_state === "invited"
                      ? t("order.plex.invited")
                      : order.plex_state === "failed"
                        ? t("order.plex.failed")
                        : t("order.plex.pending")}
                  </p>
                </div>
              )}
            </section>

            {claimLink && (
              <section className="card claim-card" data-testid="claim-card">
                <h2>{t("order.claim.title")}</h2>
                <p className="hint">{t("order.claim.body")}</p>
                <code className="claim-link">{claimLink}</code>
                <div className="claim-actions">
                  <button type="button" className="btn-ghost" onClick={copyClaimLink}>
                    <Copy size={14} aria-hidden /> {copied ? t("order.claim.copied") : t("order.claim.copy")}
                  </button>
                  <Link className="btn-primary" href={`/dashboard#t=${token}`}>
                    {t("order.dashboard.cta")}
                  </Link>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
