"use client";

import { Clock, Lock, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TOKEN_KEY = "bf-admin-token";
const DAYS_PER_EUR = 2.12; // reference rate (Azteco: €25 = 53 days); days stay editable

type UserState = "idle" | "checking" | "found" | "missing" | "unverified";

function errorText(code: string) {
  const map: Record<string, string> = {
    user_not_found: "Benutzer nicht gefunden — Gutschrift nicht möglich",
    user_unverified: "Benutzer nicht prüfbar — Gutschrift nicht möglich",
    invalid_credentials: "Benutzername oder Passwort falsch",
    admin_not_configured: "Admin ist nicht konfiguriert (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SESSION_SECRET setzen)",
    unauthorized: "Sitzung abgelaufen — bitte neu anmelden",
    rate_limited: "Zu viele Versuche — bitte kurz warten"
  };
  return map[code] || code;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  // credit
  const [jfUser, setJfUser] = useState("");
  const [userState, setUserState] = useState<UserState>("idle");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: string; text: string }>({ kind: "info", text: "" });
  const checkSeq = useRef(0);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!token || !jfUser.trim()) {
      setUserState("idle");
      return;
    }
    setUserState("checking");
    const seq = ++checkSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/pay/api/user/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: jfUser.trim() })
        });
        const data = await res.json();
        if (seq !== checkSeq.current) return;
        if (data.verified === false) setUserState("unverified");
        else setUserState(data.exists ? "found" : "missing");
      } catch {
        if (seq === checkSeq.current) setUserState("unverified");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [jfUser, token]);

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPassword("");
  }

  async function login() {
    setLoginBusy(true);
    setLoginError("");
    try {
      const res = await fetch("/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      if (res.status === 429) throw new Error("rate_limited");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) throw new Error(data.error || "invalid_credentials");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword("");
    } catch (error) {
      setLoginError(errorText(error instanceof Error ? error.message : "invalid_credentials"));
    } finally {
      setLoginBusy(false);
    }
  }

  function onAmount(value: string) {
    setAmount(value);
    const n = parseFloat(value.replace(",", "."));
    if (!Number.isNaN(n) && n > 0) setDays(String(Math.round(n * DAYS_PER_EUR)));
  }

  async function credit() {
    setBusy(true);
    setResult({ kind: "checking", text: "Wird gutgeschrieben …" });
    try {
      const amountNum = parseFloat(amount.replace(",", "."));
      const res = await fetch("/admin/api/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: jfUser.trim(),
          days: Number(days),
          amount_eur: Number.isNaN(amountNum) ? undefined : amountNum,
          note: note.trim() || undefined
        })
      });
      if (res.status === 401) {
        logout();
        throw new Error("unauthorized");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "error");
      const until = data.expires_at ? new Date(data.expires_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";
      setResult({ kind: "success", text: `✓ ${days} Tage für „${jfUser.trim()}" gutgeschrieben. Neues Ablaufdatum: ${until}` });
      setAmount("");
      setDays("");
      setNote("");
    } catch (error) {
      setResult({ kind: "error", text: errorText(error instanceof Error ? error.message : "error") });
    } finally {
      setBusy(false);
    }
  }

  const userFeedback =
    userState === "checking" ? <span className="hint checking-dots">Prüfe Benutzer</span>
    : userState === "found" ? <span className="hint ok">✓ Benutzer gefunden</span>
    : userState === "missing" ? <span className="hint bad">Benutzer nicht gefunden</span>
    : userState === "unverified" ? <span className="hint">Konnte nicht geprüft werden</span>
    : null;

  const canCredit = userState === "found" && Number(days) > 0 && !busy;

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <div className="grain" />
      </div>

      <main className="page">
        <div className="container" style={{ maxWidth: 460 }}>
          <header className="nav">
            <div className="brand">
              <span className="brand-mark"><ShieldCheck size={18} /></span>
              <span className="brand-name">Admin</span>
            </div>
            {ready && token && (
              <button className="footer-link" onClick={logout} style={{ background: "none", border: 0, cursor: "pointer" }}>
                <LogOut size={16} /> Abmelden
              </button>
            )}
          </header>

          {!ready ? null : !token ? (
            <section className="card pay-card">
              <div className="section-title">Anmelden</div>
              <div className="field">
                <label>Benutzername</label>
                <input className="input" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="field">
                <label>Passwort</label>
                <input className="input" type="password" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") login(); }} />
              </div>
              <button className="primary" disabled={loginBusy || !username.trim() || !password} onClick={login}>
                {loginBusy ? <span className="spinner" /> : <Lock size={18} />} Anmelden
              </button>
              {loginError && <div className="status error">{loginError}</div>}
            </section>
          ) : (
            <section className="card pay-card">
              <div className="section-title">Zeit gutschreiben</div>

              <div className="field">
                <label>Jellyfin-Benutzername</label>
                <input className="input" value={jfUser} autoComplete="off" onChange={(e) => setJfUser(e.target.value)} />
                {userFeedback}
              </div>

              <div className="field">
                <label>Betrag <span className="hint">(€, optional — schlägt Tage vor)</span></label>
                <input className="input" inputMode="decimal" value={amount} placeholder="z.B. 15" onChange={(e) => onAmount(e.target.value)} />
              </div>

              <div className="field">
                <label>Tage <span className="hint">(wird gutgeschrieben)</span></label>
                <input className="input" inputMode="numeric" value={days} placeholder="z.B. 32" onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))} />
              </div>

              <div className="field">
                <label>Notiz <span className="hint">(optional, z.B. „Amazon 15€")</span></label>
                <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
              </div>

              <button className="primary" disabled={!canCredit} onClick={credit}>
                {busy ? <span className="spinner" /> : <Clock size={18} />} Zeit gutschreiben
              </button>

              {jfUser.trim() && userState !== "found" && userState !== "checking" && (
                <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>
                  Gutschrift erst möglich, wenn der Benutzer bestätigt ist.
                </p>
              )}

              {result.text && <div className={`status ${result.kind}`}>{result.kind === "checking" && <span className="checking-dots" />}{result.text}</div>}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
