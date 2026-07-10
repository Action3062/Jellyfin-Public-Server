"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, UserPlus, UserRound } from "lucide-react";
import { apiBase, aztecoEnabled, plexEnabled } from "../../lib/site";
import { coins, defaultAztecoOptions, defaultPlans, type AztecoOption, type Plan } from "../../lib/plans";
import { useLanguage } from "../LanguageProvider";

type AccountMode = "existing" | "new";

function formatCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1-")
    .replace(/-$/, "");
}

export function CheckoutForm() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"crypto" | "azteco">("crypto");
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);
  const [selectedPlan, setSelectedPlan] = useState(searchParams.get("plan") || "hd_12m");
  const [coin, setCoin] = useState("btc");
  const [options, setOptions] = useState<AztecoOption[]>(defaultAztecoOptions);
  const [accountMode, setAccountMode] = useState<AccountMode>("existing");
  const [username, setUsername] = useState("");
  const [plexUsername, setPlexUsername] = useState("");
  const [userState, setUserState] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [status, setStatus] = useState<{ kind: string; text: string }>({ kind: "info", text: "" });
  const [busy, setBusy] = useState(false);
  const [code1, setCode1] = useState("");
  const [code2, setCode2] = useState("");
  const requestedPlan = useRef(searchParams.get("plan"));

  const plan = useMemo(() => plans.find((item) => item.id === selectedPlan) || plans[0], [plans, selectedPlan]);
  const plexEligible = plexEnabled && tab === "crypto" ? Boolean(plan?.includes_plex) : false;

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/products`).then((res) => (res.ok ? res.json() : defaultPlans)).catch(() => defaultPlans),
      fetch(`${apiBase}/azteco/options`).then((res) => (res.ok ? res.json() : { hd: defaultAztecoOptions })).catch(() => ({ hd: defaultAztecoOptions }))
    ]).then(([products, azteco]) => {
      if (Array.isArray(products) && products.length) {
        setPlans(products);
        const requested = requestedPlan.current;
        if (!requested || !products.some((item: Plan) => item.id === requested)) {
          setSelectedPlan(products.find((item: Plan) => item.popular)?.id || products[0].id);
        }
      }
      if (azteco?.hd?.length) setOptions(azteco.hd);
    });
  }, []);

  useEffect(() => {
    if (accountMode === "new" || !username.trim()) {
      setUserState("idle");
      return;
    }
    setUserState("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/user/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username })
        });
        const data = await res.json();
        setUserState(data.exists ? "found" : "missing");
      } catch {
        setUserState("missing");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username, accountMode]);

  const identityValid = accountMode === "new" || (username.trim().length > 0 && userState === "found");

  function identityPayload() {
    return {
      account_mode: accountMode,
      jellyfin_username: accountMode === "existing" ? username.trim() : undefined,
      plex_username: plexEligible && plexUsername.trim() ? plexUsername.trim() : undefined
    };
  }

  async function payCrypto() {
    setBusy(true);
    setStatus({ kind: "checking", text: t("pay.status.creating") });
    try {
      const res = await fetch(`${apiBase}/nowpayments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: selectedPlan, coin, ...identityPayload() })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "invoice failed");
      window.open(data.invoice_url, "_blank", "noopener,noreferrer");
      router.push(`/order/${data.order_id}#t=${data.claim_token}`);
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : t("common.error") });
      setBusy(false);
    }
  }

  async function redeemAzteco() {
    setBusy(true);
    setStatus({ kind: "checking", text: t("pay.status.redeeming") });
    try {
      const codesToRedeem = accountMode === "new" ? [code1].filter(Boolean) : [code1, code2].filter(Boolean);
      if (!codesToRedeem.length) throw new Error("code invalid");
      let target: { order_id: string; claim_token: string } | null = null;
      for (const code of codesToRedeem) {
        const res = await fetch(`${apiBase}/azteco/redeem`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, product: "hd", ...identityPayload() })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "redeem failed");
        if (!target) target = { order_id: data.order_id, claim_token: data.claim_token };
      }
      if (target) router.push(`/order/${target.order_id}#t=${target.claim_token}`);
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : t("common.error") });
      setBusy(false);
    }
  }

  const userFeedback =
    accountMode === "existing" && username.trim() ? (
      userState === "checking" ? (
        <span className="hint checking-dots">{t("pay.username.checking")}</span>
      ) : userState === "found" ? (
        <span className="hint ok">{t("pay.username.found")}</span>
      ) : userState === "missing" ? (
        <span className="hint bad">{t("pay.username.missing")}</span>
      ) : null
    ) : null;

  return (
    <section className="card" data-testid="checkout">
      {aztecoEnabled ? (
        <div className="tabs">
          <button type="button" className={`tab ${tab === "crypto" ? "active" : ""}`} onClick={() => setTab("crypto")}>
            {t("pay.tab.crypto")}
          </button>
          <button type="button" className={`tab ${tab === "azteco" ? "active" : ""}`} onClick={() => setTab("azteco")}>
            {t("pay.tab.azteco")}
          </button>
        </div>
      ) : (
        <div className="section-title">{t("pay.tab.crypto")}</div>
      )}

      {tab === "crypto" ? (
        <>
          <div className="section-title">{t("pay.duration")}</div>
          <div className="dur-grid">
            {plans.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`choice ${selectedPlan === item.id ? "selected" : ""}`}
                onClick={() => setSelectedPlan(item.id)}
              >
                {item.popular && <span className="badge">★ BEST</span>}
                {item.icon} {lang === "de" ? item.label_de || item.label : item.label_en || item.label}
                <span className="price">€{item.price_eur.toFixed(2)}</span>
              </button>
            ))}
          </div>

          <div className="section-title">{t("pay.coin")}</div>
          <div className="coin-grid">
            {coins.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`choice coin ${coin === item.id ? "selected" : ""}`}
                onClick={() => setCoin(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="section-title">{t("pay.voucher.amount")}</div>
          <div className="amount-grid">
            {options.map((item) => (
              <div key={item.eur} className="choice static">
                {lang === "de" ? item.label_de : item.label_en}
              </div>
            ))}
          </div>
          <p className="hint">{t("pay.voucher.hint")}</p>
          <div className="field">
            <label htmlFor="code1">{t("pay.voucher.code1")}</label>
            <input
              id="code1"
              className="input"
              maxLength={19}
              value={code1}
              onChange={(event) => setCode1(formatCode(event.target.value))}
              placeholder="1234-5678-9012-3456"
            />
          </div>
          {accountMode === "existing" ? (
            <div className="field">
              <label htmlFor="code2">
                {t("pay.voucher.code2")} <span className="hint">{t("pay.voucher.optional")}</span>
              </label>
              <input
                id="code2"
                className="input"
                maxLength={19}
                value={code2}
                onChange={(event) => setCode2(formatCode(event.target.value))}
                placeholder="1234-5678-9012-3456"
              />
            </div>
          ) : (
            <p className="hint">{t("pay.azteco.single.hint")}</p>
          )}
        </>
      )}

      <div className="section-title">{t("pay.account.title")}</div>
      <div className="account-toggle" role="radiogroup" aria-label={t("pay.account.title")}>
        <button
          type="button"
          role="radio"
          aria-checked={accountMode === "existing"}
          className={`choice ${accountMode === "existing" ? "selected" : ""}`}
          onClick={() => setAccountMode("existing")}
        >
          <UserRound size={17} aria-hidden /> {t("pay.account.existing")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={accountMode === "new"}
          className={`choice ${accountMode === "new" ? "selected" : ""}`}
          onClick={() => setAccountMode("new")}
        >
          <UserPlus size={17} aria-hidden /> {t("pay.account.new")}
        </button>
      </div>

      {accountMode === "existing" ? (
        <div className="field">
          <label htmlFor="username">{t("pay.username.label")}</label>
          <input
            id="username"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
          {userFeedback}
        </div>
      ) : (
        <p className="hint account-new-hint">{t("pay.account.new.hint")}</p>
      )}

      {plexEligible && (
        <div className="field">
          <label htmlFor="plex">
            {t("pay.plex.label")} <span className="hint">({t("pay.plex.hint")})</span>
          </label>
          <input id="plex" className="input" value={plexUsername} onChange={(event) => setPlexUsername(event.target.value)} />
        </div>
      )}

      <button
        type="button"
        className="primary"
        disabled={busy || !identityValid || (tab === "azteco" && !code1)}
        onClick={tab === "crypto" ? payCrypto : redeemAzteco}
      >
        {busy ? <span className="spinner" /> : <Lock size={18} aria-hidden />}
        {tab === "crypto" ? t("pay.submit.crypto") : t("pay.submit.azteco")}
      </button>

      {status.text && (
        <div className={`status ${status.kind}`} role="status">
          {status.kind === "checking" && <span className="checking-dots" />} {status.text}
        </div>
      )}
    </section>
  );
}
