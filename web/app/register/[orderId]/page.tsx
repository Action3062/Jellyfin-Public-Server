"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, PartyPopper, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { useLanguage } from "../../../components/LanguageProvider";
import { apiBase, shopName } from "../../../lib/site";

type OrderState = "loading" | "ready" | "notpaid" | "done" | "notfound";

export default function RegisterPage() {
  const { t } = useLanguage();
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [token, setToken] = useState<string | null>(null);
  const [orderState, setOrderState] = useState<OrderState>("loading");
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ username: string; jellyfin_url: string | null } | null>(null);

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
    const stored = sessionStorage.getItem(`portal-claim-${orderId}`);
    const value = fromHash || stored;
    if (fromHash) sessionStorage.setItem(`portal-claim-${orderId}`, fromHash);
    if (!value) {
      setOrderState("notfound");
      return;
    }
    setToken(value);
    fetch(`${apiBase}/order/${orderId}`, { headers: { "x-claim-token": value } })
      .then(async (res) => {
        if (!res.ok) return setOrderState("notfound");
        const order = await res.json();
        if (order.account_mode !== "new") return setOrderState("notfound");
        if (order.provision_state === "provisioned") return setOrderState("done");
        if (order.payment_phase !== "paid") return setOrderState("notpaid");
        setOrderState("ready");
      })
      .catch(() => setOrderState("notfound"));
  }, [orderId]);

  useEffect(() => {
    const name = username.trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(name)) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/register/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: name })
        });
        const data = await res.json();
        setAvailability(data.available ? "available" : "taken");
      } catch {
        setAvailability("idle");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username]);

  const usernameValid = /^[A-Za-z0-9._-]{3,32}$/.test(username.trim());
  const passwordsMatch = password.length >= 8 && password === password2;
  const canSubmit = usernameValid && availability !== "taken" && passwordsMatch && !busy;

  async function submit() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, claim_token: token, username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "username taken") setError(t("register.error.taken"));
        else if (data.error === "payment not completed yet") setError(t("register.error.notpaid"));
        else if (data.error === "already registered") setError(t("register.error.done"));
        else setError(data.error || t("common.error"));
        return;
      }
      setSuccess({ username: data.username, jellyfin_url: data.jellyfin_url });
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="subpage">
      <SiteHeader />
      <main className="page narrow" data-testid="register-page">
        <header className="page-head">
          <h1>{t("register.title")}</h1>
          <p className="hint">{t("register.subtitle")}</p>
        </header>

        {success ? (
          <section className="card register-success" data-testid="register-success">
            <PartyPopper size={28} aria-hidden className="register-success-icon" />
            <h2>{t("register.success.title", { shop: shopName })}</h2>
            <p className="hint">{t("register.success.body")}</p>
            <p>
              {t("register.username.label")}: <strong>{success.username}</strong>
            </p>
            <div className="claim-actions">
              {success.jellyfin_url && (
                <a className="btn-primary" href={success.jellyfin_url} target="_blank" rel="noreferrer">
                  {t("register.success.jellyfin")} <ExternalLink size={14} aria-hidden />
                </a>
              )}
              <Link className={success.jellyfin_url ? "btn-ghost" : "btn-primary"} href={`/dashboard#t=${token}`}>
                {t("register.success.dashboard")}
              </Link>
            </div>
          </section>
        ) : orderState === "loading" ? (
          <section className="card">
            <div className="status checking">
              <span className="checking-dots" /> {t("common.loading")}
            </div>
          </section>
        ) : orderState === "notfound" ? (
          <section className="card">
            <div className="status error">
              <TriangleAlert size={16} aria-hidden /> {t("register.notfound")}
            </div>
          </section>
        ) : orderState === "done" ? (
          <section className="card">
            <div className="status success">{t("register.error.done")}</div>
            <Link className="btn-ghost" href={`/dashboard#t=${token}`}>
              {t("register.success.dashboard")}
            </Link>
          </section>
        ) : orderState === "notpaid" ? (
          <section className="card">
            <div className="status warning">{t("register.error.notpaid")}</div>
            <Link className="btn-ghost" href={`/order/${orderId}#t=${token}`}>
              {t("dash.order.link")}
            </Link>
          </section>
        ) : (
          <section className="card" data-testid="register-form">
            <div className="field">
              <label htmlFor="reg-username">{t("register.username.label")}</label>
              <input
                id="reg-username"
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                maxLength={32}
              />
              {availability === "checking" ? (
                <span className="hint checking-dots">{t("register.username.checking")}</span>
              ) : availability === "available" ? (
                <span className="hint ok">{t("register.username.available")}</span>
              ) : availability === "taken" ? (
                <span className="hint bad">{t("register.username.taken")}</span>
              ) : (
                <span className="hint">{t("register.username.rules")}</span>
              )}
            </div>

            <div className="field">
              <label htmlFor="reg-password">{t("register.password.label")}</label>
              <input
                id="reg-password"
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
              <span className="hint">{t("register.password.rules")}</span>
            </div>

            <div className="field">
              <label htmlFor="reg-password2">{t("register.password2.label")}</label>
              <input
                id="reg-password2"
                className="input"
                type="password"
                value={password2}
                onChange={(event) => setPassword2(event.target.value)}
                autoComplete="new-password"
              />
              {password2 && password !== password2 && <span className="hint bad">{t("register.password.mismatch")}</span>}
            </div>

            <button type="button" className="primary" disabled={!canSubmit} onClick={submit} data-testid="register-submit">
              {busy ? <span className="spinner" /> : <UserPlus size={17} aria-hidden />}
              {busy ? t("register.working") : t("register.submit")}
            </button>

            {error && (
              <div className="status error" role="status">
                {error}
              </div>
            )}

            <p className="hint privacy-note">
              <ShieldCheck size={14} aria-hidden /> {t("register.privacy")}
            </p>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
