"use client";

import {
  Activity, BarChart3, Clock, CreditCard, Fingerprint, Gauge, Lock, LogOut,
  MessageSquare, RefreshCw, ShieldCheck, Sun, Moon, Users
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const TOKEN_KEY = "bf-admin-token";
const THEME_KEY = "bf-admin-theme";
const DAYS_PER_EUR = 2.12; // reference rate (Azteco: €25 = 53 days); days stay editable

type TabKey = "overview" | "credit" | "payments" | "users" | "discord" | "ops" | "settings";

function errorText(code: string) {
  const map: Record<string, string> = {
    user_not_found: "Benutzer nicht gefunden — Gutschrift nicht möglich",
    user_unverified: "Benutzer nicht prüfbar — Gutschrift nicht möglich",
    invalid_credentials: "Benutzername oder Passwort falsch",
    totp_required: "Bitte den 2FA-Code aus deiner Authenticator-App eingeben",
    invalid_totp: "2FA-Code falsch oder abgelaufen",
    admin_not_configured: "Admin ist nicht konfiguriert (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SESSION_SECRET setzen)",
    unauthorized: "Sitzung abgelaufen — bitte neu anmelden",
    rate_limited: "Zu viele Versuche — bitte kurz warten",
    jfa_error: "jfa-go-Fehler — Aktion nicht möglich"
  };
  return map[code] || code;
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}
function fmtDay(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" });
}

/** Reads the exp claim from our HMAC token (base64url(JSON).sig) for the countdown. */
function tokenExpiry(token: string): number | null {
  try {
    const data = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(data));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPassword("");
    setTotp("");
    setNeedTotp(false);
  }, []);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
    const savedTheme = (localStorage.getItem(THEME_KEY) as "dark" | "light") || "dark";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setReady(true);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  }

  // Authenticated fetch helper: injects the bearer token, logs out on 401.
  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(path, {
      ...opts,
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers || {}),
        Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) ?? ""}`
      }
    });
    if (res.status === 401) {
      logout();
      throw new Error("unauthorized");
    }
    return res;
  }, [logout]);

  async function login() {
    setLoginBusy(true);
    setLoginError("");
    try {
      const res = await fetch("/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, token: totp.trim() || undefined })
      });
      if (res.status === 429) throw new Error("rate_limited");
      const data = await res.json().catch(() => ({}));
      if (data.error === "totp_required") {
        setNeedTotp(true);
        setLoginError(errorText("totp_required"));
        return;
      }
      if (!res.ok || !data.token) throw new Error(data.error || "invalid_credentials");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword("");
      setTotp("");
      setNeedTotp(false);
    } catch (error) {
      setLoginError(errorText(error instanceof Error ? error.message : "invalid_credentials"));
    } finally {
      setLoginBusy(false);
    }
  }

  const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: "Übersicht", icon: <BarChart3 size={16} /> },
    { key: "credit", label: "Gutschrift", icon: <Clock size={16} /> },
    { key: "payments", label: "Zahlungen", icon: <CreditCard size={16} /> },
    { key: "users", label: "Nutzer", icon: <Users size={16} /> },
    { key: "discord", label: "Discord", icon: <MessageSquare size={16} /> },
    { key: "ops", label: "Betrieb", icon: <Gauge size={16} /> },
    { key: "settings", label: "Einstellungen", icon: <ShieldCheck size={16} /> }
  ];

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <div className="grain" />
      </div>

      <main className="page">
        <div className="container" style={{ maxWidth: token ? 920 : 460 }}>
          <header className="nav">
            <div className="brand">
              <span className="brand-mark"><ShieldCheck size={18} /></span>
              <span className="brand-name">Admin</span>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <button className="footer-link" onClick={toggleTheme} style={{ background: "none", border: 0, cursor: "pointer" }} aria-label="Design umschalten">
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {ready && token && (
                <button className="footer-link" onClick={logout} style={{ background: "none", border: 0, cursor: "pointer" }}>
                  <LogOut size={16} /> Abmelden
                </button>
              )}
            </div>
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
              {needTotp && (
                <div className="field">
                  <label>2FA-Code <span className="hint">(Authenticator-App)</span></label>
                  <input className="input" inputMode="numeric" value={totp} placeholder="123456" maxLength={6}
                    onChange={(e) => setTotp(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") login(); }} />
                </div>
              )}
              <button className="primary" disabled={loginBusy || !username.trim() || !password} onClick={login}>
                {loginBusy ? <span className="spinner" /> : <Lock size={18} />} Anmelden
              </button>
              {loginError && <div className="status error">{loginError}</div>}
            </section>
          ) : (
            <>
              <nav className="tabbar">
                {TABS.map((t) => (
                  <button key={t.key} className={`tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
                    {t.icon} <span>{t.label}</span>
                  </button>
                ))}
              </nav>

              {tab === "overview" && <OverviewTab api={api} />}
              {tab === "credit" && <CreditTab api={api} />}
              {tab === "payments" && <PaymentsTab api={api} />}
              {tab === "users" && <UsersTab api={api} onQuickCredit={() => setTab("credit")} />}
              {tab === "discord" && <DiscordTab api={api} />}
              {tab === "ops" && <OpsTab api={api} />}
              {tab === "settings" && <SettingsTab api={api} token={token} onLogout={logout} onToken={(t) => { sessionStorage.setItem(TOKEN_KEY, t); setToken(t); }} />}
            </>
          )}
        </div>
      </main>
    </>
  );
}

type Api = (path: string, opts?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): { data: T | null; error: string; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fn().then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(errorText(e instanceof Error ? e.message : "error")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = { ok: "ok", warn: "warn", error: "bad", off: "muted" };
  const label: Record<string, string> = { ok: "OK", warn: "Warnung", error: "Fehler", off: "Aus" };
  return <span className={`badge ${map[state] ?? "muted"}`}>{label[state] ?? state}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const good = ["finished", "confirmed", "redeemed", "done"];
  const bad = ["failed", "expired", "invalid", "cancelled"];
  const cls = good.includes(status) ? "ok" : bad.includes(status) ? "bad" : "warn";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function BarChart({ data, height = 140 }: { data: Array<{ label: string; value: number }>; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="barchart" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d.label}: ${fmtEur(d.value)}`}>
          <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
          <span className="bar-label">{d.label.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function SegBar({ data }: { data: Array<{ name: string; total: number }> }) {
  const total = Math.max(1, data.reduce((a, d) => a + d.total, 0));
  const colors = ["#ff3b3b", "#f4c463", "#38d39f", "#5865f2", "#9b59b6", "#ff8c42"];
  return (
    <div>
      <div className="segbar">
        {data.map((d, i) => (
          <div key={i} className="seg" style={{ width: `${(d.total / total) * 100}%`, background: colors[i % colors.length] }} title={`${d.name}: ${fmtEur(d.total)}`} />
        ))}
      </div>
      <div className="legend">
        {data.map((d, i) => (
          <span key={i} className="legend-item"><i style={{ background: colors[i % colors.length] }} /> {d.name} · {fmtEur(d.total)}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ api }: { api: Api }) {
  const { data, error, loading } = useAsync(async () => {
    const [dash, recon, health] = await Promise.all([
      api("/admin/api/dashboard").then((r) => r.json()),
      api("/admin/api/reconciliation").then((r) => r.json()),
      api("/admin/api/health").then((r) => r.json())
    ]);
    return { dash, recon, health };
  }, []);

  if (loading) return <Loading />;
  if (error) return <div className="status error">{error}</div>;
  if (!data) return null;
  const k = data.dash.kpis;
  const alerts = (data.recon.creditedMissing?.length || 0) + (data.recon.stalePending?.length || 0) + (data.recon.unprocessedWebhooks || 0);
  const problems = data.health.checks.filter((c: { state: string }) => c.state === "error").length;

  return (
    <>
      <div className="grid stats">
        <Stat label="Umsatz heute" value={fmtEur(k.today)} />
        <Stat label="Letzte 30 Tage" value={fmtEur(k.last30)} />
        <Stat label="Dieses Jahr" value={fmtEur(k.year)} />
        <Stat label="Zahlungen gesamt" value={String(k.count)} sub={`Ø ${fmtEur(k.avg)}`} />
      </div>

      {(alerts > 0 || problems > 0) && (
        <div className="status warning" style={{ marginTop: 14 }}>
          {problems > 0 && <>⚠ {problems} Integration(en) mit Fehler. </>}
          {alerts > 0 && <>⚠ {alerts} offene Betriebs-Hinweise (siehe Tab „Betrieb“).</>}
        </div>
      )}

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title">Umsatz je Monat</div>
        <BarChart data={data.dash.monthly.map((m: { month: string; total: number }) => ({ label: m.month, value: m.total }))} />
      </section>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="card pay-card">
          <div className="section-title">Zahlungswege</div>
          {data.dash.byProvider.length ? <SegBar data={data.dash.byProvider} /> : <p className="hint">Noch keine Zahlungen.</p>}
        </section>
        <section className="card pay-card">
          <div className="section-title">Top-Zahler</div>
          {data.dash.topPayers.length ? (
            <table className="table"><tbody>
              {data.dash.topPayers.slice(0, 6).map((p: { user: string; total: number; count: number }) => (
                <tr key={p.user}><td>{p.user}</td><td className="num">{fmtEur(p.total)}</td><td className="num hint">{p.count}×</td></tr>
              ))}
            </tbody></table>
          ) : <p className="hint">Noch keine Zahlungen.</p>}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Credit (Zeit gutschreiben) + expiry preview + confirmation
// ---------------------------------------------------------------------------

type UserState = "idle" | "checking" | "found" | "missing" | "unverified";

function CreditTab({ api }: { api: Api }) {
  const [jfUser, setJfUser] = useState("");
  const [userState, setUserState] = useState<UserState>("idle");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: string; text: string }>({ kind: "info", text: "" });
  const [preview, setPreview] = useState<{ current: string | null; projected: string | null } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const checkSeq = useRef(0);

  useEffect(() => {
    if (!jfUser.trim()) { setUserState("idle"); return; }
    setUserState("checking");
    const seq = ++checkSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/pay/api/user/check", {
          method: "POST", headers: { "Content-Type": "application/json" },
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
  }, [jfUser]);

  function onAmount(value: string) {
    setAmount(value);
    const n = parseFloat(value.replace(",", "."));
    if (!Number.isNaN(n) && n > 0) setDays(String(Math.round(n * DAYS_PER_EUR)));
  }

  async function openConfirm() {
    setResult({ kind: "info", text: "" });
    try {
      const res = await api(`/admin/api/expiry-preview?username=${encodeURIComponent(jfUser.trim())}&days=${Number(days) || 0}`);
      const data = await res.json();
      setPreview({ current: data.current, projected: data.projected });
    } catch {
      setPreview({ current: null, projected: null });
    }
    setConfirm(true);
  }

  async function credit() {
    setBusy(true);
    setConfirm(false);
    setResult({ kind: "checking", text: "Wird gutgeschrieben …" });
    try {
      const amountNum = parseFloat(amount.replace(",", "."));
      const res = await api("/admin/api/credit", {
        method: "POST",
        body: JSON.stringify({
          username: jfUser.trim(), days: Number(days),
          amount_eur: Number.isNaN(amountNum) ? undefined : amountNum,
          note: note.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "error");
      setResult({ kind: "success", text: `✓ ${days} Tage für „${jfUser.trim()}" gutgeschrieben. Neues Ablaufdatum: ${fmtDate(data.expires_at)}` });
      setAmount(""); setDays(""); setNote("");
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
      <button className="primary" disabled={!canCredit} onClick={openConfirm}>
        {busy ? <span className="spinner" /> : <Clock size={18} />} Zeit gutschreiben
      </button>
      {jfUser.trim() && userState !== "found" && userState !== "checking" && (
        <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>Gutschrift erst möglich, wenn der Benutzer bestätigt ist.</p>
      )}
      {result.text && <div className={`status ${result.kind}`}>{result.kind === "checking" && <span className="checking-dots" />}{result.text}</div>}

      {confirm && (
        <Modal onClose={() => setConfirm(false)} title="Gutschrift bestätigen">
          <p>Für <strong>{jfUser.trim()}</strong>:</p>
          <table className="table"><tbody>
            <tr><td>Aktuelles Ablaufdatum</td><td className="num">{fmtDate(preview?.current)}</td></tr>
            <tr><td>Gutschrift</td><td className="num">+{days} Tage</td></tr>
            <tr><td><strong>Neues Ablaufdatum</strong></td><td className="num"><strong>{fmtDate(preview?.projected)}</strong></td></tr>
          </tbody></table>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="ghost" onClick={() => setConfirm(false)}>Abbrechen</button>
            <button className="primary" onClick={credit}>Bestätigen &amp; gutschreiben</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payments + vouchers + webhook detail
// ---------------------------------------------------------------------------

function PaymentsTab({ api }: { api: Api }) {
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [user, setUser] = useState("");
  const [detail, setDetail] = useState<unknown>(null);

  const { data, error, loading } = useAsync(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (provider) params.set("provider", provider);
    if (user) params.set("user", user);
    const [payments, vouchers] = await Promise.all([
      api(`/admin/api/payments?${params.toString()}`).then((r) => r.json()),
      api("/admin/api/vouchers").then((r) => r.json())
    ]);
    return { payments, vouchers };
  }, [status, provider, user]);

  async function showWebhooks(orderId: string) {
    const res = await api("/admin/api/webhooks?limit=200");
    const rows = await res.json();
    const match = rows.filter((r: { payload?: { order_id?: string } }) => r.payload?.order_id === orderId);
    setDetail(match.length ? match : { info: "Keine Webhook-Events zu dieser Bestellung." });
  }

  return (
    <>
      <section className="card pay-card">
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>Zahlungen</div>
          <a className="ghost small" href="/admin/api/export/payments.csv">CSV-Export</a>
        </div>
        <div className="filters">
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Alle Wege</option><option value="nowpayments">NowPayments</option><option value="azteco">Azteco</option><option value="manual">Manuell</option>
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Alle Status</option><option value="finished">finished</option><option value="waiting">waiting</option><option value="confirmed">confirmed</option><option value="failed">failed</option><option value="expired">expired</option>
          </select>
          <input className="input" placeholder="Nutzer suchen" value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        {loading ? <Loading /> : error ? <div className="status error">{error}</div> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Datum</th><th>Nutzer</th><th>Weg</th><th>Betrag</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data!.payments.map((p: { id: string; createdAt: string; user: string; provider: string; coin: string | null; amountEur: number; status: string; orderId: string }) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td>{p.user}</td>
                    <td>{p.provider}{p.coin ? ` · ${p.coin}` : ""}</td>
                    <td className="num">{fmtEur(p.amountEur)}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>{p.provider === "nowpayments" && <button className="link" onClick={() => showWebhooks(p.orderId)}>IPN</button>}</td>
                  </tr>
                ))}
                {!data!.payments.length && <tr><td colSpan={6} className="hint">Keine Zahlungen gefunden.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title">Azteco-Gutscheine</div>
        {loading ? null : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Datum</th><th>Nutzer</th><th>Wert</th><th>Status</th></tr></thead>
              <tbody>
                {data!.vouchers.map((v: { id: string; createdAt: string; user: string; valueEur: number; status: string }) => (
                  <tr key={v.id}><td>{fmtDate(v.createdAt)}</td><td>{v.user}</td><td className="num">{v.valueEur ? fmtEur(v.valueEur) : "—"}</td><td><StatusBadge status={v.status} /></td></tr>
                ))}
                {!data!.vouchers.length && <tr><td colSpan={4} className="hint">Keine Einlösungen.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail !== null && (
        <Modal onClose={() => setDetail(null)} title="Webhook-Events (IPN)">
          <pre className="codeblock">{JSON.stringify(detail, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersTab({ api, onQuickCredit }: { api: Api; onQuickCredit: () => void }) {
  const [q, setQ] = useState("");
  const [busyUser, setBusyUser] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(async () => api("/admin/api/users").then((r) => r.json()), []);

  async function toggleEnabled(name: string, enabled: boolean) {
    setBusyUser(name);
    try {
      await api("/admin/api/users/enable", { method: "POST", body: JSON.stringify({ username: name, enabled }) });
      reload();
    } finally {
      setBusyUser("");
    }
  }

  if (loading) return <Loading />;
  if (error) return <div className="status error">{error}</div>;
  const users = (data!.users as Array<{ name: string; expiry: string | null; disabled: boolean; source: string | null; revenueEur: number; discordId: string | null }>)
    .filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      {data!.expiringSoon.length > 0 && (
        <section className="card pay-card">
          <div className="section-title">Läuft bald ab (14 Tage)</div>
          <div className="chips">
            {data!.expiringSoon.map((u: { user: string; daysLeft: number }) => (
              <button key={u.user} className="chip" onClick={() => { navigator.clipboard?.writeText(u.user); onQuickCredit(); }} title="Name kopieren & zur Gutschrift">
                {u.user} <span className="chip-badge">{u.daysLeft}d</span>
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Klick kopiert den Namen und springt zur Gutschrift.</p>
        </section>
      )}

      {(data!.abuse.sharedDiscord.length > 0 || data!.drift.length > 0) && (
        <section className="card pay-card" style={{ marginTop: 16 }}>
          <div className="section-title">Auffälligkeiten</div>
          {data!.abuse.sharedDiscord.map((s: { discordId: string; accounts: string[] }) => (
            <div key={s.discordId} className="status warning">Mehrere Konten mit Discord-ID {s.discordId}: {s.accounts.join(", ")}</div>
          ))}
          {data!.drift.slice(0, 5).map((d: { user: string; deltaHours: number }) => (
            <div key={d.user} className="status warning">Drift bei {d.user}: DB/jfa-go weichen um {d.deltaHours}h ab</div>
          ))}
        </section>
      )}

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>Nutzer ({users.length})</div>
          <input className="input" style={{ maxWidth: 200 }} placeholder="Suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>Läuft ab</th><th>Quelle</th><th>Umsatz</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.name} className={u.disabled ? "row-disabled" : ""}>
                  <td>{u.name}{u.disabled && <span className="badge bad" style={{ marginLeft: 6 }}>gesperrt</span>}</td>
                  <td>{fmtDay(u.expiry)}</td>
                  <td className="hint">{u.source ?? "—"}</td>
                  <td className="num">{u.revenueEur ? fmtEur(u.revenueEur) : "—"}</td>
                  <td className="actions">
                    <button className="link" onClick={() => setHistoryFor(u.name)}>Verlauf</button>
                    <button className="link" disabled={busyUser === u.name} onClick={() => toggleEnabled(u.name, u.disabled)}>
                      {u.disabled ? "Entsperren" : "Sperren"}
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={5} className="hint">Keine Nutzer.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {historyFor && <UserHistoryModal api={api} username={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}

function UserHistoryModal({ api, username, onClose }: { api: Api; username: string; onClose: () => void }) {
  const { data, loading } = useAsync(async () => api(`/admin/api/users/${encodeURIComponent(username)}`).then((r) => r.json()), [username]);
  return (
    <Modal onClose={onClose} title={`Verlauf: ${username}`}>
      {loading || !data ? <Loading /> : (
        <>
          <div className="section-title">Abos</div>
          <table className="table"><tbody>
            {data.subscriptions.length ? data.subscriptions.map((s: { plan: string; source: string; expiresAt: string; status: string }, i: number) => (
              <tr key={i}><td>{s.plan}</td><td className="hint">{s.source}</td><td className="num">{fmtDay(s.expiresAt)}</td></tr>
            )) : <tr><td className="hint">Keine.</td></tr>}
          </tbody></table>
          <div className="section-title" style={{ marginTop: 14 }}>Zahlungen</div>
          <table className="table"><tbody>
            {data.payments.length ? data.payments.map((p: { provider: string; amountEur: number; status: string; createdAt: string }, i: number) => (
              <tr key={i}><td>{fmtDate(p.createdAt)}</td><td>{p.provider}</td><td className="num">{fmtEur(p.amountEur)}</td><td><StatusBadge status={p.status} /></td></tr>
            )) : <tr><td className="hint">Keine.</td></tr>}
          </tbody></table>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Discord / bot control
// ---------------------------------------------------------------------------

const FLAG_LABELS: Record<string, string> = {
  ai_assistant: "AI-Assistent",
  link_filter: "Link-Filter",
  ticket_followups: "Ticket-Follow-ups",
  advanced_anti_spam: "Erweiterter Anti-Spam",
  welcome: "Willkommensnachricht",
  member_monitoring: "Mitglieder-Monitoring",
  new_account_protection: "Neue-Konten-Schutz"
};

function DiscordTab({ api }: { api: Api }) {
  const { data, error, loading, reload } = useAsync(async () => api("/admin/api/bot").then((r) => r.json()), []);
  const [resetTarget, setResetTarget] = useState("");
  const [note, setNote] = useState("");

  async function setFlag(name: string, value: boolean | null) {
    await api("/admin/api/bot/flags", { method: "POST", body: JSON.stringify({ name, value }) });
    reload();
  }
  async function saveSupport(status: string, message: string) {
    await api("/admin/api/bot/support", { method: "POST", body: JSON.stringify({ status, message }) });
    setNote("Support-Status gespeichert."); reload();
  }
  async function resetTrial() {
    if (!resetTarget.trim()) return;
    await api("/admin/api/bot/command", { method: "POST", body: JSON.stringify({ kind: "trial_reset", target: resetTarget.trim() }) });
    setResetTarget(""); setNote("Trial-Reset in Auftrag gegeben — der Bot führt ihn beim nächsten Poll aus.");
  }

  if (loading) return <Loading />;
  if (error) return <div className="status error">{error}</div>;
  const lastSeen = data!.lastSeen ? new Date(data!.lastSeen) : null;
  const lastSeenMin = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null;

  return (
    <>
      <div className="status info">
        Bot zuletzt gesehen: {lastSeen ? `vor ${lastSeenMin} Min` : "nie (kein Heartbeat empfangen)"}
        {lastSeenMin !== null && lastSeenMin > 15 && " ⚠"}
      </div>

      <section className="card pay-card" style={{ marginTop: 14 }}>
        <div className="section-title">Feature-Schalter</div>
        {Object.entries(data!.flags as Record<string, boolean | null>).map(([name, value]) => (
          <div className="toggle-row" key={name} style={{ marginBottom: 10 }}>
            <div>
              <div className="toggle-label">{FLAG_LABELS[name] ?? name}</div>
              <span className="hint">{value === null ? "Kein Override (Bot-Standard)" : value ? "Aktiviert" : "Deaktiviert"}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={`pill-btn${value === true ? " on" : ""}`} onClick={() => setFlag(name, true)}>An</button>
              <button className={`pill-btn${value === false ? " off" : ""}`} onClick={() => setFlag(name, false)}>Aus</button>
              <button className={`pill-btn${value === null ? " neutral" : ""}`} onClick={() => setFlag(name, null)}>Auto</button>
            </div>
          </div>
        ))}
      </section>

      <SupportCard support={data!.support} onSave={saveSupport} />

      <TrialParamsCard api={api} params={data!.trialParams} onSaved={reload} />

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title">Trial zurücksetzen</div>
        <div className="field">
          <label>Discord-ID oder Jellyfin-Name</label>
          <input className="input" value={resetTarget} onChange={(e) => setResetTarget(e.target.value)} placeholder="z.B. 123456789 oder maxmustermann" />
        </div>
        <button className="primary" onClick={resetTrial} disabled={!resetTarget.trim()}><RefreshCw size={16} /> Reset beauftragen</button>
      </section>

      {data!.funnel?.length > 0 && (
        <section className="card pay-card" style={{ marginTop: 16 }}>
          <div className="section-title">Funnel-Verlauf</div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Bis</th><th>Trials</th><th>Upgrades</th><th>Abos</th><th>Konversion</th></tr></thead>
              <tbody>
                {data!.funnel.map((f: { periodEnd: string; trials: number; upgrades: number; activeAbos: number }, i: number) => (
                  <tr key={i}><td>{fmtDay(f.periodEnd)}</td><td className="num">{f.trials}</td><td className="num">{f.upgrades}</td><td className="num">{f.activeAbos}</td><td className="num">{f.trials ? Math.round((f.upgrades / f.trials) * 100) : 0}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {note && <div className="status success" style={{ marginTop: 14 }}>{note}</div>}
    </>
  );
}

function SupportCard({ support, onSave }: { support: { status: string; message: string }; onSave: (s: string, m: string) => void }) {
  const [status, setStatus] = useState(support.status);
  const [message, setMessage] = useState(support.message);
  return (
    <section className="card pay-card" style={{ marginTop: 16 }}>
      <div className="section-title">Support-Status</div>
      <div className="field">
        <label>Status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="online">Online</option><option value="busy">Beschäftigt</option><option value="offline">Offline</option>
        </select>
      </div>
      <div className="field">
        <label>Nachricht</label>
        <input className="input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <button className="primary" onClick={() => onSave(status, message)}>Speichern</button>
    </section>
  );
}

function TrialParamsCard({ api, params, onSaved }: { api: Api; params: { trialHours: number | null; nudgeHours: number | null }; onSaved: () => void }) {
  const [trialHours, setTrialHours] = useState(params.trialHours?.toString() ?? "");
  const [nudgeHours, setNudgeHours] = useState(params.nudgeHours?.toString() ?? "");
  async function save() {
    await api("/admin/api/bot/trial-params", {
      method: "POST",
      body: JSON.stringify({
        trialHours: trialHours.trim() ? Number(trialHours) : null,
        nudgeHours: nudgeHours.trim() ? Number(nudgeHours) : null
      })
    });
    onSaved();
  }
  return (
    <section className="card pay-card" style={{ marginTop: 16 }}>
      <div className="section-title">Trial-Parameter</div>
      <div className="grid two">
        <div className="field"><label>Trial-Dauer (Std.) <span className="hint">leer = Bot-Standard</span></label>
          <input className="input" inputMode="numeric" value={trialHours} placeholder="26" onChange={(e) => setTrialHours(e.target.value.replace(/[^0-9]/g, ""))} /></div>
        <div className="field"><label>Nudge vor Ablauf (Std.)</label>
          <input className="input" inputMode="numeric" value={nudgeHours} placeholder="6" onChange={(e) => setNudgeHours(e.target.value.replace(/[^0-9]/g, ""))} /></div>
      </div>
      <button className="primary" onClick={save}>Speichern</button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

function OpsTab({ api }: { api: Api }) {
  const { data, error, loading, reload } = useAsync(async () => {
    const [health, queue, recon, audit] = await Promise.all([
      api("/admin/api/health").then((r) => r.json()),
      api("/admin/api/queue").then((r) => r.json()),
      api("/admin/api/reconciliation").then((r) => r.json()),
      api("/admin/api/audit").then((r) => r.json())
    ]);
    return { health, queue, recon, audit };
  }, []);

  async function retry(jobId: string) {
    await api("/admin/api/queue/retry", { method: "POST", body: JSON.stringify({ jobId }) });
    reload();
  }

  if (loading) return <Loading />;
  if (error) return <div className="status error">{error}</div>;

  return (
    <>
      <section className="card pay-card">
        <div className="section-title">Integrationen</div>
        {data!.health.checks.map((c: { name: string; state: string; detail: string }) => (
          <div className="health-row" key={c.name}>
            <span>{c.name}</span>
            <span className="hint">{c.detail}</span>
            <StateBadge state={c.state} />
          </div>
        ))}
      </section>

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title">Provisioning-Queue</div>
        <div className="grid stats small">
          {Object.entries(data!.queue.counts as Record<string, number>).map(([k, v]) => (
            <Stat key={k} label={k} value={String(v)} />
          ))}
        </div>
        {data!.queue.failed.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Job</th><th>Grund</th><th>Versuche</th><th></th></tr></thead>
              <tbody>
                {data!.queue.failed.map((j: { id: string; name: string; failedReason: string; attemptsMade: number }) => (
                  <tr key={j.id}><td>{j.name}</td><td className="hint">{j.failedReason}</td><td className="num">{j.attemptsMade}</td><td><button className="link" onClick={() => retry(j.id)}>Erneut</button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title">Betriebs-Hinweise</div>
        {data!.recon.creditedMissing.length === 0 && data!.recon.stalePending.length === 0 && data!.recon.unprocessedWebhooks === 0 ? (
          <p className="hint">Alles sauber — keine offenen Fälle.</p>
        ) : (
          <>
            {data!.recon.creditedMissing.map((p: { user: string; amountEur: number; createdAt: string }, i: number) => (
              <div className="status warning" key={`c${i}`}>Bezahlt, aber keine Gutschrift: {p.user} · {fmtEur(p.amountEur)} · {fmtDate(p.createdAt)}</div>
            ))}
            {data!.recon.stalePending.map((p: { user: string; status: string; createdAt: string }, i: number) => (
              <div className="status warning" key={`s${i}`}>Hängt seit &gt;24h: {p.user} · {p.status} · {fmtDate(p.createdAt)}</div>
            ))}
            {data!.recon.unprocessedWebhooks > 0 && <div className="status warning">{data!.recon.unprocessedWebhooks} unverarbeitete Webhook-Events</div>}
          </>
        )}
      </section>

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title">Audit-Log</div>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Zeit</th><th>Aktion</th><th>Wer</th><th>IP</th></tr></thead>
            <tbody>
              {(data!.audit as Array<{ id: string; createdAt: string; action: string; actor: string; ip: string }>).slice(0, 40).map((a) => (
                <tr key={a.id}><td>{fmtDate(a.createdAt)}</td><td>{a.action}</td><td className="hint">{a.actor || "—"}</td><td className="hint">{a.ip || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings (trial toggle, 2FA, session, absolute expiry)
// ---------------------------------------------------------------------------

function SettingsTab({ api, token, onToken }: { api: Api; token: string; onToken: (t: string) => void; onLogout: () => void }) {
  const [trialEnabled, setTrialEnabled] = useState<boolean | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [twofa, setTwofa] = useState<{ enabled: boolean; configured: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [expLeft, setExpLeft] = useState<number | null>(null);

  useEffect(() => {
    api("/admin/api/settings").then((r) => r.json()).then((d) => setTrialEnabled(d.trial_enabled)).catch(() => undefined);
    api("/admin/api/2fa/status").then((r) => r.json()).then(setTwofa).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    const exp = tokenExpiry(token);
    if (!exp) return;
    const tick = () => setExpLeft(Math.max(0, Math.round((exp - Date.now()) / 60000)));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [token]);

  async function toggleTrial() {
    if (trialEnabled === null || trialBusy) return;
    const next = !trialEnabled;
    setTrialBusy(true);
    try {
      await api("/admin/api/settings/trial", { method: "POST", body: JSON.stringify({ enabled: next }) });
      setTrialEnabled(next);
    } finally {
      setTrialBusy(false);
    }
  }
  async function refreshSession() {
    const res = await api("/admin/api/refresh", { method: "POST" });
    const data = await res.json();
    if (data.token) { onToken(data.token); setMsg("Sitzung verlängert."); }
  }
  async function start2fa() {
    const res = await api("/admin/api/2fa/setup", { method: "POST" });
    setSetup(await res.json());
  }
  async function enable2fa() {
    const res = await api("/admin/api/2fa/enable", { method: "POST", body: JSON.stringify({ token: code.trim() }) });
    const data = await res.json();
    if (data.ok) { setTwofa({ enabled: true, configured: true }); setSetup(null); setCode(""); setMsg("2FA aktiviert."); }
    else setMsg(errorText(data.error || "error"));
  }
  async function disable2fa() {
    await api("/admin/api/2fa/disable", { method: "POST" });
    setTwofa({ enabled: false, configured: true }); setMsg("2FA deaktiviert.");
  }

  return (
    <>
      <section className="card pay-card">
        <div className="section-title">Discord-Trials</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Trial-Funktion</div>
            <span className="hint">
              {trialEnabled === null ? "Status wird geladen …" : trialEnabled ? "Der Bot darf neue Trials vergeben" : "Der Bot vergibt keine neuen Trials"}
            </span>
          </div>
          <button type="button" role="switch" aria-checked={trialEnabled === true} aria-label="Trial-Funktion umschalten"
            className={`switch${trialEnabled ? " on" : ""}`} disabled={trialEnabled === null || trialBusy} onClick={toggleTrial}>
            <span className="knob" />
          </button>
        </div>
      </section>

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title"><Fingerprint size={15} style={{ verticalAlign: "-2px" }} /> Zwei-Faktor (TOTP)</div>
        {!twofa ? <Loading /> : twofa.enabled ? (
          <>
            <p className="hint">2FA ist aktiv. Bei jedem Login wird ein Code aus deiner Authenticator-App verlangt.</p>
            <button className="ghost" onClick={disable2fa}>2FA deaktivieren</button>
          </>
        ) : setup ? (
          <>
            <p className="hint">Secret in der Authenticator-App eintragen, dann Code bestätigen:</p>
            <code className="codeblock" style={{ userSelect: "all" }}>{setup.secret}</code>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Code aus der App</label>
              <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} placeholder="123456" />
            </div>
            <button className="primary" onClick={enable2fa} disabled={code.length !== 6}>2FA aktivieren</button>
          </>
        ) : (
          <>
            <p className="hint">Schützt den Admin-Zugang mit einem zweiten Faktor. Empfohlen, da /admin öffentlich erreichbar ist.</p>
            <button className="primary" onClick={start2fa}>2FA einrichten</button>
          </>
        )}
      </section>

      <section className="card pay-card" style={{ marginTop: 16 }}>
        <div className="section-title"><Activity size={15} style={{ verticalAlign: "-2px" }} /> Sitzung</div>
        <p className="hint">Läuft in {expLeft === null ? "?" : `${expLeft} Min`} ab.</p>
        <button className="ghost" onClick={refreshSession}><RefreshCw size={15} /> Sitzung verlängern</button>
      </section>

      <ExpirySetCard api={api} />

      {msg && <div className="status success" style={{ marginTop: 14 }}>{msg}</div>}
    </>
  );
}

function ExpirySetCard({ api }: { api: Api }) {
  const [username, setUsername] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  async function save() {
    setMsg(null);
    try {
      const res = await api("/admin/api/expiry/set", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), expires_at: new Date(date).toISOString(), note: note.trim() || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "error");
      setMsg({ kind: "success", text: `Ablaufdatum gesetzt: ${fmtDate(data.expires_at)}` });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e instanceof Error ? e.message : "error") });
    }
  }
  return (
    <section className="card pay-card" style={{ marginTop: 16 }}>
      <div className="section-title">Ablaufdatum direkt setzen</div>
      <p className="hint">Für Korrekturen/Storno — setzt das jfa-go-Ablaufdatum absolut (keine Umsatzbuchung).</p>
      <div className="field"><label>Jellyfin-Benutzername</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <div className="field"><label>Neues Ablaufdatum</label><input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label>Notiz</label><input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></div>
      <button className="primary" onClick={save} disabled={!username.trim() || !date}>Ablaufdatum setzen</button>
      {msg && <div className={`status ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Loading() {
  return <div className="loading"><span className="spinner" /> Lädt …</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>{title}</div>
          <button className="footer-link" onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}
