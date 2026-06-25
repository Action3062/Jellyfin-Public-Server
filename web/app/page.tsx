"use client";

import {
  ArrowLeft,
  Bitcoin,
  Clapperboard,
  ExternalLink,
  Film,
  Gauge,
  Lock,
  MessageCircle,
  Server,
  ShieldCheck,
  Sparkles,
  Ticket,
  Tv
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CoinIcon } from "./coin-icons";

type Plan = {
  id: string;
  product: string;
  label: string;
  price_eur: number;
  months: number;
  icon: string;
  popular: boolean;
};

type AztecoOption = {
  eur: number;
  days: number;
  label_en: string;
  label_de: string;
};

const coins = [
  { id: "btc", label: "BTC" },
  { id: "eth", label: "ETH" },
  { id: "ltc", label: "LTC" },
  { id: "usdc", label: "USDC" },
  { id: "usdterc20", label: "USDT" },
  { id: "sol", label: "SOL" },
  { id: "xmr", label: "XMR" },
  { id: "trx", label: "TRX" }
];

const defaultPlans: Plan[] = [
  { id: "hd_1m", product: "hd", label: "1 Month", price_eur: 12.99, months: 1, icon: "🎬", popular: false },
  { id: "hd_3m", product: "hd", label: "3 Months", price_eur: 34.99, months: 3, icon: "🎬", popular: false },
  { id: "hd_12m", product: "hd", label: "Yearly", price_eur: 99.99, months: 12, icon: "🎬", popular: true }
];

const defaultOptions: AztecoOption[] = [
  { eur: 25, days: 53, label_en: "€25 · 53 days", label_de: "25 € · 53 Tage" },
  { eur: 50, days: 106, label_en: "€50 · 106 days", label_de: "50 € · 106 Tage" },
  { eur: 75, days: 159, label_en: "€75 · 159 days", label_de: "75 € · 159 Tage" },
  { eur: 100, days: 335, label_en: "€100 · ~335 days", label_de: "100 € · ~335 Tage" }
];

const shopName = process.env.NEXT_PUBLIC_SHOP_NAME || "<<< SHOP_NAME >>>";
const discordUrl = process.env.NEXT_PUBLIC_SHOP_DISCORD_URL || "<<< DISCORD_INVITE_URL >>>";
// Plex is disabled by default. Set NEXT_PUBLIC_PLEX_ENABLED=true to re-enable.
const plexEnabled = (process.env.NEXT_PUBLIC_PLEX_ENABLED || "false") === "true";
const apiBase = "/pay/api";

function formatCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1-")
    .replace(/-$/, "");
}

// Maps the payment_status returned by /pay/api/nowpayments/status to a UI
// status kind and localized text. Values mirror the NowPayments lifecycle.
const paymentStatusInfo: Record<string, { kind: string; de: string; en: string }> = {
  waiting: { kind: "checking", de: "Warte auf deine Zahlung …", en: "Waiting for your payment …" },
  confirming: { kind: "checking", de: "Zahlung erkannt – wird im Netzwerk bestätigt …", en: "Payment detected – confirming on-chain …" },
  confirmed: { kind: "checking", de: "Zahlung bestätigt – wird abgeschlossen …", en: "Payment confirmed – finalizing …" },
  sending: { kind: "checking", de: "Zahlung wird verarbeitet …", en: "Payment is being processed …" },
  partially_paid: { kind: "warning", de: "Teilzahlung erhalten – bitte Restbetrag senden.", en: "Partial payment received – please send the remaining amount." },
  finished: { kind: "confirmed", de: "Zahlung abgeschlossen. Abo aktiviert!", en: "Payment complete. Subscription active!" },
  failed: { kind: "error", de: "Zahlung fehlgeschlagen.", en: "Payment failed." },
  expired: { kind: "error", de: "Invoice abgelaufen.", en: "Invoice expired." },
  refunded: { kind: "error", de: "Zahlung erstattet.", en: "Payment refunded." }
};

export default function PaymentPage() {
  const [lang, setLang] = useState<"de" | "en">("de");
  const [tab, setTab] = useState<"crypto" | "azteco">("crypto");
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);
  const [selectedPlan, setSelectedPlan] = useState("hd_12m");
  const [coin, setCoin] = useState("btc");
  const [options, setOptions] = useState<AztecoOption[]>(defaultOptions);
  const [amount, setAmount] = useState(25);
  const [username, setUsername] = useState("");
  const [plexUsername, setPlexUsername] = useState("");
  const [userState, setUserState] = useState<"idle" | "checking" | "found" | "missing" | "unverified">("idle");
  const [status, setStatus] = useState<{ kind: string; text: string }>({ kind: "info", text: "" });
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [code1, setCode1] = useState("");
  const [code2, setCode2] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const plan = useMemo(() => plans.find((item) => item.id === selectedPlan) || plans[0], [plans, selectedPlan]);
  const annualSelected = plan?.months === 12 || amount >= 100;
  const userConfirmed = userState === "found";

  function errorText(code: string) {
    const map: Record<string, { de: string; en: string }> = {
      user_not_found: { de: "Benutzer nicht gefunden — Zahlung nicht möglich", en: "User not found — payment not possible" },
      user_unverified: { de: "Benutzer nicht prüfbar — Zahlung nicht möglich", en: "User not verifiable — payment not possible" }
    };
    return map[code]?.[lang] ?? code;
  }

  useEffect(() => {
    const stored = localStorage.getItem("pay-portal-lang");
    const nextLang = stored === "en" ? "en" : "de";
    setLang(nextLang);
    document.documentElement.classList.toggle("en", nextLang === "en");

    Promise.all([
      fetch(`${apiBase}/products`).then((res) => res.ok ? res.json() : defaultPlans).catch(() => defaultPlans),
      fetch(`${apiBase}/azteco/options`).then((res) => res.ok ? res.json() : { hd: defaultOptions }).catch(() => ({ hd: defaultOptions }))
    ]).then(([products, azteco]) => {
      if (Array.isArray(products) && products.length) {
        setPlans(products);
        setSelectedPlan(products.find((item: Plan) => item.popular)?.id || products[0].id);
      }
      if (azteco?.hd?.length) setOptions(azteco.hd);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("en", lang === "en");
    localStorage.setItem("pay-portal-lang", lang);
  }, [lang]);

  useEffect(() => {
    if (!username.trim()) {
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
        if (data.verified === false) setUserState("unverified");
        else setUserState(data.exists ? "found" : "missing");
      } catch {
        setUserState("unverified");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function maybeInvitePlex(product: string) {
    if (!plexEnabled || !plexUsername.trim() || !annualSelected) return;
    await fetch(`${apiBase}/plex/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plex_username: plexUsername.trim(), product })
    });
  }

  async function payCrypto() {
    setBusy(true);
    setInvoiceUrl("");
    setStatus({ kind: "checking", text: lang === "de" ? "Invoice wird erstellt" : "Creating invoice" });
    try {
      const res = await fetch(`${apiBase}/nowpayments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier_id: selectedPlan, coin, discord_user: username.trim() })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "invoice failed");
      setInvoiceUrl(data.invoice_url);
      setPending(true);
      setStatus({ kind: "checking", text: lang === "de" ? "Warte auf deine Zahlung … (Status wird alle 30 s geprüft)" : "Waiting for your payment … (status checked every 30s)" });
      window.open(data.invoice_url, "_blank", "noopener,noreferrer");

      const started = Date.now();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (Date.now() - started > 60 * 60 * 1000) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPending(false);
          setStatus({ kind: "warning", text: lang === "de" ? "Statusprüfung nach 1 Stunde beendet. Bei offener Zahlung bitte den Support kontaktieren." : "Status checks stopped after 1 hour. If your payment is still pending, please contact support." });
          return;
        }
        const statusRes = await fetch(`${apiBase}/nowpayments/status/${data.invoice_id}`);
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        const paymentStatus = String(statusData.payment_status || "waiting");
        const info = paymentStatusInfo[paymentStatus];
        if (["finished", "confirmed", "completed"].includes(paymentStatus)) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPending(false);
          await maybeInvitePlex(plan.product);
          setStatus({ kind: "confirmed", text: lang === "de" ? "Zahlung bestätigt. Abo aktiviert." : "Payment confirmed. Subscription active." });
        } else if (["failed", "expired", "refunded"].includes(paymentStatus)) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPending(false);
          setStatus({ kind: "error", text: info ? (lang === "de" ? info.de : info.en) : paymentStatus });
        } else {
          setStatus({ kind: info?.kind ?? "checking", text: info ? (lang === "de" ? info.de : info.en) : `Status: ${paymentStatus}` });
        }
      }, 30000);
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? errorText(error.message) : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function redeemAzteco() {
    setBusy(true);
    setStatus({ kind: "checking", text: lang === "de" ? "Gutscheine werden eingelöst" : "Redeeming vouchers" });
    try {
      let total = 0;
      for (const code of [code1, code2].filter(Boolean)) {
        const res = await fetch(`${apiBase}/azteco/redeem`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, discord_user: username.trim(), product: "hd" })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "redeem failed");
        total += Number(data.value_eur || 0);
      }
      if (total <= 0) throw new Error("code invalid");
      await maybeInvitePlex("hd");
      setStatus({ kind: "success", text: lang === "de" ? `Aktiviert: ${total} € eingelöst.` : `Active: redeemed €${total}.` });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? errorText(error.message) : "error" });
    } finally {
      setBusy(false);
    }
  }

  const userFeedback = userState === "checking"
    ? <span className="hint checking-dots">{lang === "de" ? "Prüfe Benutzer" : "Checking user"}</span>
    : userState === "found"
      ? <span className="hint ok"><span lang="de">✓ Benutzer gefunden</span><span lang="en">✓ User found</span></span>
      : userState === "missing"
        ? <span className="hint bad"><span lang="de">Benutzer nicht gefunden</span><span lang="en">User not found</span></span>
        : userState === "unverified"
          ? <span className="hint"><span lang="de">Konnte nicht geprüft werden — bitte Schreibweise selbst kontrollieren</span><span lang="en">Could not be verified — please double-check the spelling</span></span>
          : null;

  const features = [
    { icon: <Film size={20} className="feature-icon" />, value: "2000+", de: "Filme", en: "Movies" },
    { icon: <Tv size={20} className="feature-icon" />, value: "500+", de: "Serien", en: "Series" },
    { icon: <Gauge size={20} className="feature-icon" />, value: "10 Gb/s", de: "Speed", en: "Speed" },
    plexEnabled
      ? { icon: <Server size={20} className="feature-icon" />, value: "Plex", de: "& Jellyfin", en: "& Jellyfin" }
      : { icon: <Server size={20} className="feature-icon" />, value: "Jellyfin", de: "Streaming", en: "Streaming" }
  ];

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <div className="grain" />
      </div>

      <main className="page">
        <div className="container">
          <header className="nav">
            <div className="brand">
              <span className="brand-mark"><Clapperboard size={22} /></span>
              <span className="brand-name">{shopName}</span>
            </div>
            <div className="lang-toggle" role="group" aria-label="Language">
              <button className={lang === "de" ? "active" : ""} onClick={() => setLang("de")}>DE</button>
              <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
            </div>
          </header>

          <section className="hero">
            <span className="eyebrow">
              <Sparkles size={14} />
              <span lang="de">Premium Streaming</span>
              <span lang="en">Premium Streaming</span>
            </span>
            <h1 className="hero-title">
              <span lang="de">Dein Zugang zu <span className="grad">{shopName}</span></span>
              <span lang="en">Your access to <span className="grad">{shopName}</span></span>
            </h1>
            <p className="hero-sub">
              <span lang="de">Aktiviere dein Abo in Sekunden — anonym bezahlt mit Krypto oder Azteco-Gutscheinen.</span>
              <span lang="en">Activate your subscription in seconds — paid anonymously with crypto or Azteco vouchers.</span>
            </p>
            <div className="features">
              {features.map((item) => (
                <div className="feature" key={item.value + item.de}>
                  {item.icon}
                  <b>{item.value}</b>
                  <span><span lang="de">{item.de}</span><span lang="en">{item.en}</span></span>
                </div>
              ))}
            </div>
          </section>

          <section className="card info-card">
            <div className="info-icon"><ShieldCheck size={22} /></div>
            <div>
              <h2><span lang="de">Warum Crypto & Azteco?</span><span lang="en">Why crypto & Azteco?</span></h2>
              <p lang="de">Nur Krypto und Azteco für maximale Anonymität. Azteco-Gutscheine kannst du auf azte.co mit Kreditkarte, PayPal oder Apple Pay kaufen.</p>
              <p lang="en">Crypto and Azteco only for maximum anonymity. You can buy Azteco vouchers on azte.co with credit card, PayPal, or Apple Pay.</p>
            </div>
          </section>

          <section className="card pay-card">
            <div className="tabs" role="tablist">
              <button className={`tab ${tab === "crypto" ? "active" : ""}`} role="tab" aria-selected={tab === "crypto"} onClick={() => setTab("crypto")}>
                <Bitcoin size={17} /> Crypto
              </button>
              <button className={`tab ${tab === "azteco" ? "active" : ""}`} role="tab" aria-selected={tab === "azteco"} onClick={() => setTab("azteco")}>
                <Ticket size={17} /> Azteco
              </button>
            </div>

            {tab === "crypto" ? (
              <>
                <div className="section-title"><span lang="de">Laufzeit</span><span lang="en">Duration</span></div>
                <div className="dur-grid">
                  {plans.map((item) => (
                    <button key={item.id} className={`choice duration ${selectedPlan === item.id ? "selected" : ""}`} onClick={() => setSelectedPlan(item.id)}>
                      {item.popular && <span className="ribbon"><Sparkles size={10} /> BEST</span>}
                      <span className="choice-icon">{item.icon}</span>
                      <span className="choice-label">{item.label}</span>
                      <span className="price">€{item.price_eur.toFixed(2)}</span>
                    </button>
                  ))}
                </div>

                <div className="section-title"><span lang="de">Coin wählen</span><span lang="en">Choose coin</span></div>
                <div className="coin-grid">
                  {coins.map((item) => (
                    <button key={item.id} className={`chip ${coin === item.id ? "selected" : ""}`} onClick={() => setCoin(item.id)}>
                      <CoinIcon id={item.id} size={20} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="section-title"><span lang="de">Gutscheinbetrag</span><span lang="en">Voucher amount</span></div>
                <div className="amount-grid">
                  {options.map((item) => (
                    <button key={item.eur} className={`choice amount ${amount === item.eur ? "selected" : ""}`} onClick={() => setAmount(item.eur)}>
                      {lang === "de" ? item.label_de : item.label_en}
                    </button>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 12 }}><span lang="de">Codes auf azte.co kaufen. Die Einlösung läuft automatisch und sequenziell.</span><span lang="en">Buy codes at azte.co. Redemption runs automatically and sequentially.</span></p>
                <div className="field">
                  <label>Gutschein-Code 1</label>
                  <input className="input" maxLength={19} value={code1} onChange={(event) => setCode1(formatCode(event.target.value))} placeholder="1234-5678-9012-3456" />
                </div>
                <div className="field">
                  <label>Gutschein-Code 2 <span className="hint">(optional)</span></label>
                  <input className="input" maxLength={19} value={code2} onChange={(event) => setCode2(formatCode(event.target.value))} placeholder="1234-5678-9012-3456" />
                </div>
              </>
            )}

            <div className="field">
              <label><span lang="de">Dein Jellyfin-Benutzername</span><span lang="en">Your Jellyfin username</span></label>
              <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
              {userFeedback}
            </div>

            {plexEnabled && annualSelected && (
              <div className="field">
                <label>Plex-Username <span className="hint">(<span lang="de">Jahresabo beinhaltet Plex</span><span lang="en">Yearly subscription includes Plex</span>)</span></label>
                <input className="input" value={plexUsername} onChange={(event) => setPlexUsername(event.target.value)} />
              </div>
            )}

            <button className="primary" disabled={busy || pending || !userConfirmed} onClick={tab === "crypto" ? payCrypto : redeemAzteco}>
              {busy || pending ? <span className="spinner" /> : <Lock size={18} />}
              {pending ? (
                <><span lang="de">Zahlung läuft …</span><span lang="en">Payment in progress …</span></>
              ) : tab === "crypto" ? (
                <><span lang="de">Mit Crypto bezahlen</span><span lang="en">Pay with crypto</span></>
              ) : (
                <><span lang="de">Einlösen & Aktivieren</span><span lang="en">Redeem & activate</span></>
              )}
            </button>

            {username.trim() && !userConfirmed && userState !== "checking" && (
              <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>
                <span lang="de">Bezahlung erst möglich, wenn der Jellyfin-Benutzer bestätigt ist.</span>
                <span lang="en">Payment is only possible once the Jellyfin user is confirmed.</span>
              </p>
            )}

            {status.text && <div className={`status ${status.kind}`}>{status.kind === "checking" && <span className="checking-dots" />}{status.text}</div>}
            {invoiceUrl && (
              <a className="pay-link" href={invoiceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Invoice / Pay-Link
                <small>{invoiceUrl}</small>
              </a>
            )}
          </section>

          <footer className="footer">
            <a className="footer-link" href="/"><ArrowLeft size={16} /> <span lang="de">Zurück zu {shopName}</span><span lang="en">Back to {shopName}</span></a>
            <a className="discord" href={discordUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Discord Support</a>
          </footer>
        </div>
      </main>
    </>
  );
}
