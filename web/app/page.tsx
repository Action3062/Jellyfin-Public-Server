"use client";

import { ExternalLink, Lock, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
const apiBase = "/pay/api";

function formatCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1-")
    .replace(/-$/, "");
}

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
  const [userState, setUserState] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [status, setStatus] = useState<{ kind: string; text: string }>({ kind: "info", text: "" });
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [code1, setCode1] = useState("");
  const [code2, setCode2] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const plan = useMemo(() => plans.find((item) => item.id === selectedPlan) || plans[0], [plans, selectedPlan]);
  const annualSelected = plan?.months === 12 || amount >= 100;

  useEffect(() => {
    const stored = localStorage.getItem("arkiv3-pay-lang");
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
    localStorage.setItem("arkiv3-pay-lang", lang);
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
        setUserState(data.exists ? "found" : "missing");
      } catch {
        setUserState("missing");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function maybeInvitePlex(product: string) {
    if (!plexUsername.trim() || !annualSelected) return;
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
      setStatus({ kind: "info", text: lang === "de" ? "Invoice erstellt. Zahlungsstatus wird alle 30 Sekunden geprüft." : "Invoice created. Payment status checks every 30 seconds." });
      window.open(data.invoice_url, "_blank", "noopener,noreferrer");

      const started = Date.now();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (Date.now() - started > 60 * 60 * 1000) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus({ kind: "warning", text: lang === "de" ? "Polling nach 1 Stunde beendet." : "Polling stopped after 1 hour." });
          return;
        }
        const statusRes = await fetch(`${apiBase}/nowpayments/status/${data.invoice_id}`);
        const statusData = await statusRes.json();
        const paymentStatus = statusData.payment_status;
        if (["finished", "confirmed", "completed"].includes(paymentStatus)) {
          if (pollRef.current) clearInterval(pollRef.current);
          await maybeInvitePlex(plan.product);
          setStatus({ kind: "confirmed", text: lang === "de" ? "Zahlung bestätigt. Abo aktiviert." : "Payment confirmed. Subscription active." });
        } else if (["failed", "expired", "refunded"].includes(paymentStatus)) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus({ kind: "error", text: paymentStatus });
        } else {
          setStatus({ kind: "checking", text: paymentStatus });
        }
      }, 30000);
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "error" });
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
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  const userFeedback = userState === "checking"
    ? <span className="hint checking-dots">Prüfe Benutzer</span>
    : userState === "found"
      ? <span className="hint ok"><span lang="de">✅ Benutzer gefunden</span><span lang="en">✅ User found</span></span>
      : userState === "missing"
        ? <span className="hint bad"><span lang="de">Benutzer nicht gefunden</span><span lang="en">User not found</span></span>
        : null;

  return (
    <main className="shell">
      <header className="topbar">
        <h1 className="title">{shopName} — Payment</h1>
        <div className="lang-toggle" aria-label="Language">
          <button className={lang === "de" ? "active" : ""} onClick={() => setLang("de")}>DE</button>
          <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
        </div>
      </header>

      <section className="banner">
        <strong>🎬 {shopName}</strong>
        2000+ Filme · 500+ Serien · 10Gb/s · Plex & Jellyfin
      </section>

      <section className="info">
        <h2><span lang="de">🔒 Warum Crypto & Azteco?</span><span lang="en">🔒 Why Crypto & Azteco?</span></h2>
        <p lang="de">Nur Krypto und Azteco für maximale Anonymität. Azteco-Gutscheine kannst du auf azte.co mit Kreditkarte, PayPal oder Apple Pay kaufen.</p>
        <p lang="en">Crypto and Azteco only for maximum anonymity. You can buy Azteco vouchers on azte.co with credit card, PayPal, or Apple Pay.</p>
      </section>

      <section className="card">
        <div className="tabs">
          <button className={`tab ${tab === "crypto" ? "active" : ""}`} onClick={() => setTab("crypto")}>₿ Crypto (NowPayments)</button>
          <button className={`tab ${tab === "azteco" ? "active" : ""}`} onClick={() => setTab("azteco")}>🎫 Azteco</button>
        </div>

        {tab === "crypto" ? (
          <>
            <div className="section-title"><span lang="de">Laufzeit</span><span lang="en">Duration</span></div>
            <div className="dur-grid">
              {plans.map((item) => (
                <button key={item.id} className={`choice ${selectedPlan === item.id ? "selected" : ""}`} onClick={() => setSelectedPlan(item.id)}>
                  {item.popular && <span className="badge">★ BEST</span>}
                  {item.icon} {item.label}
                  <span className="price">€{item.price_eur.toFixed(2)}</span>
                </button>
              ))}
            </div>

            <div className="section-title">Coin</div>
            <div className="coin-grid">
              {coins.map((item) => (
                <button key={item.id} className={`choice coin ${coin === item.id ? "selected" : ""}`} onClick={() => setCoin(item.id)}>
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
                <button key={item.eur} className={`choice ${amount === item.eur ? "selected" : ""}`} onClick={() => setAmount(item.eur)}>
                  {lang === "de" ? item.label_de : item.label_en}
                </button>
              ))}
            </div>
            <p className="hint"><span lang="de">Codes auf azte.co kaufen. Die Einlösung läuft automatisch und sequenziell.</span><span lang="en">Buy codes at azte.co. Redemption runs automatically and sequentially.</span></p>
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

        {annualSelected && (
          <div className="field">
            <label>Plex-Username <span className="hint">(<span lang="de">Jahresabo beinhaltet Plex</span><span lang="en">Yearly subscription includes Plex</span>)</span></label>
            <input className="input" value={plexUsername} onChange={(event) => setPlexUsername(event.target.value)} />
          </div>
        )}

        <button className="primary" disabled={busy || !username.trim()} onClick={tab === "crypto" ? payCrypto : redeemAzteco}>
          {busy ? <span className="spinner" /> : <Lock size={18} />}
          {tab === "crypto" ? (
            <><span lang="de">Mit Crypto bezahlen</span><span lang="en">Pay with Crypto</span></>
          ) : (
            <><span lang="de">Einlösen & Aktivieren</span><span lang="en">Redeem & Activate</span></>
          )}
        </button>

        {status.text && <div className={`status ${status.kind}`}>{status.kind === "checking" && <span className="checking-dots" />} {status.text}</div>}
        {invoiceUrl && (
          <a className="pay-link" href={invoiceUrl} target="_blank" rel="noreferrer">
            Invoice / Pay-Link <ExternalLink size={15} />
            <small>{invoiceUrl}</small>
          </a>
        )}
      </section>

      <footer className="footer">
        <a href="/">← <span lang="de">Zurück zu Arkiv3</span><span lang="en">Back to Arkiv3</span></a>
        <a className="discord" href={discordUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Discord Support</a>
      </footer>
    </main>
  );
}
