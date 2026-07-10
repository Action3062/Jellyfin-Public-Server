"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, KeyRound, ShieldCheck } from "lucide-react";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { useLanguage } from "../../components/LanguageProvider";
import { apiBase } from "../../lib/site";
import { defaultPlans } from "../../lib/plans";

type DashboardData =
  | {
      registered: true;
      username_masked: string;
      active: boolean;
      expires_at: string | null;
      days_left: number;
      plan: string | null;
      plan_id: string | null;
      source: string | null;
      history: Array<{ date: string; amount_eur: number; method: string; status: string; provision_state: string }>;
    }
  | {
      registered: false;
      order: { order_id: string; invite_url: string | null };
    };

export default function DashboardPage() {
  const { t, lang } = useLanguage();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const check = useCallback(
    async (value: string) => {
      if (!value.trim()) return;
      setBusy(true);
      setNotFound(false);
      setData(null);
      try {
        const res = await fetch(`${apiBase}/dashboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: value.trim() })
        });
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setData((await res.json()) as DashboardData);
      } catch {
        setNotFound(true);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
    if (fromHash) {
      setToken(fromHash);
      check(fromHash);
    }
  }, [check]);

  const dateFormat = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" });

  return (
    <div className="subpage">
      <SiteHeader />
      <main className="page narrow" data-testid="dashboard-page">
        <header className="page-head">
          <h1>{t("dash.title")}</h1>
          <p className="hint">{t("dash.subtitle")}</p>
        </header>

        <section className="card">
          <div className="field">
            <label htmlFor="token">{t("dash.token.label")}</label>
            <input
              id="token"
              className="input"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="z. B. Qx3…"
              autoComplete="off"
            />
            <span className="hint">{t("dash.token.hint")}</span>
          </div>
          <button type="button" className="primary" disabled={busy || !token.trim()} onClick={() => check(token)}>
            {busy ? <span className="spinner" /> : <KeyRound size={17} aria-hidden />}
            {busy ? t("dash.checking") : t("dash.check")}
          </button>
          {notFound && (
            <div className="status error" role="status">
              {t("dash.notfound")}
            </div>
          )}
        </section>

        {data && !data.registered && (
          <section className="card" data-testid="dashboard-unregistered">
            <div className="status warning">{t("dash.registration.pending")}</div>
            <Link className="btn-ghost" href={`/order/${data.order.order_id}#t=${token.trim()}`}>
              {t("dash.order.link")}
            </Link>
          </section>
        )}

        {data && data.registered && (
          <>
            <section className={`card status-card ${data.active ? "active" : "expired"}`} data-testid="dashboard-status">
              <div className="status-card-head">
                <span className={`pill ${data.active ? "ok" : "bad"}`}>
                  {data.active ? t("dash.status.active") : t("dash.status.expired")}
                </span>
                <span className="hint">
                  {t("dash.user.label")}: {data.username_masked}
                </span>
              </div>
              <div className="status-grid">
                <div>
                  <span className="hint">{t("dash.expires")}</span>
                  <strong data-testid="expires-at">
                    {data.expires_at ? dateFormat.format(new Date(data.expires_at)) : "—"}
                  </strong>
                  {data.active && (
                    <span className="hint">
                      <CalendarClock size={13} aria-hidden /> {t("dash.daysleft", { days: data.days_left })}
                    </span>
                  )}
                  {!data.active && <span className="hint">{t("dash.expiredago")}</span>}
                </div>
                <div>
                  <span className="hint">{t("dash.plan")}</span>
                  <strong>
                    {(() => {
                      const planRecord = defaultPlans.find((item) => item.id === data.plan_id);
                      if (!planRecord) return data.plan || "—";
                      return (lang === "de" ? planRecord.label_de : planRecord.label_en) || planRecord.label;
                    })()}
                  </strong>
                </div>
                <div>
                  <span className="hint">{t("dash.source")}</span>
                  <strong>{data.source === "nowpayments" ? "Crypto" : data.source === "azteco" ? "Azteco" : "—"}</strong>
                </div>
              </div>
              <Link className="btn-primary" href="/pay">
                {t("dash.renew")}
              </Link>
            </section>

            <section className="card">
              <h2 className="section-title">{t("dash.history.title")}</h2>
              {data.history.length === 0 ? (
                <p className="hint">{t("dash.history.empty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="history-table">
                    <tbody>
                      {data.history.map((item) => (
                        <tr key={`${item.date}-${item.amount_eur}`}>
                          <td>{dateFormat.format(new Date(item.date))}</td>
                          <td>€{item.amount_eur.toFixed(2)}</td>
                          <td>{item.method === "nowpayments" ? "Crypto" : "Azteco"}</td>
                          <td>
                            <span className={`pill ${item.status === "finished" ? "ok" : "muted"}`}>{item.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="hint privacy-note">
              <ShieldCheck size={14} aria-hidden /> {t("dash.privacy")}
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
