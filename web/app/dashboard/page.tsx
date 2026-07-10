"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, KeyRound, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { useLanguage } from "../../components/LanguageProvider";
import { apiBase } from "../../lib/site";
import { defaultPlans } from "../../lib/plans";

const SESSION_KEY = "byteflix-session";

type DashboardData =
  | {
      registered: true;
      username_masked: string;
      active: boolean;
      expires_at: string | null;
      expiry_source: "server" | "portal";
      days_left: number;
      last_active: string | null;
      account_disabled: boolean;
      plan: string | null;
      plan_id: string | null;
      source: string | null;
      history: Array<{ date: string; amount_eur: number; method: string; status: string; provision_state: string }>;
    }
  | {
      registered: false;
      order: { order_id: string; invite_url?: string | null };
    };

export default function DashboardPage() {
  const { t, lang } = useLanguage();

  const [mode, setMode] = useState<"login" | "key">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwRepeat, setPwRepeat] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadWith = useCallback(async (payload: { token?: string; session?: string }) => {
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`${apiBase}/dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        if (res.status === 401 && payload.session) {
          localStorage.removeItem(SESSION_KEY);
          setSession(null);
          setSessionUser(null);
        }
        return false;
      }
      setData((await res.json()) as DashboardData);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Order links carry a claim token in the fragment and take precedence.
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
    if (fromHash) {
      setMode("key");
      setToken(fromHash);
      loadWith({ token: fromHash }).then((ok) => {
        if (!ok) setError(t("dash.notfound"));
      });
      return;
    }
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const [storedUser, storedToken] = stored.split("\n");
      if (storedToken) {
        setSession(storedToken);
        setSessionUser(storedUser || null);
        loadWith({ session: storedToken });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/session/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 503 ? t("dash.login.unavailable") : t("dash.login.failed"));
        return;
      }
      localStorage.setItem(SESSION_KEY, `${body.username}\n${body.token}`);
      setSession(body.token);
      setSessionUser(body.username);
      setPassword("");
      await loadWith({ session: body.token });
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setSessionUser(null);
    setData(null);
    setPwMessage(null);
  }

  async function changePassword() {
    if (!session) return;
    setPwBusy(true);
    setPwMessage(null);
    try {
      const res = await fetch(`${apiBase}/session/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, current_password: pwCurrent, new_password: pwNew })
      });
      if (!res.ok) {
        setPwMessage({ kind: "error", text: res.status === 401 ? t("dash.pw.failed") : t("common.error") });
        return;
      }
      setPwMessage({ kind: "success", text: t("dash.pw.success") });
      setPwCurrent("");
      setPwNew("");
      setPwRepeat("");
    } catch {
      setPwMessage({ kind: "error", text: t("common.error") });
    } finally {
      setPwBusy(false);
    }
  }

  const dateFormat = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" });
  const dateTimeFormat = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const pwValid = pwCurrent.length > 0 && pwNew.length >= 8 && pwNew === pwRepeat;

  return (
    <div className="subpage">
      <SiteHeader />
      <main className="page narrow" data-testid="dashboard-page">
        <header className="page-head">
          <h1>{t("dash.title")}</h1>
          <p className="hint">{t("dash.subtitle")}</p>
        </header>

        {!session && (
          <section className="card">
            <div className="account-toggle" role="radiogroup" aria-label={t("dash.title")}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "login"}
                className={`choice ${mode === "login" ? "selected" : ""}`}
                onClick={() => setMode("login")}
              >
                <LogIn size={17} aria-hidden /> {t("dash.auth.login")}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "key"}
                className={`choice ${mode === "key" ? "selected" : ""}`}
                onClick={() => setMode("key")}
              >
                <KeyRound size={17} aria-hidden /> {t("dash.auth.key")}
              </button>
            </div>

            {mode === "login" ? (
              <>
                <div className="field">
                  <label htmlFor="login-user">{t("dash.login.username")}</label>
                  <input
                    id="login-user"
                    className="input"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="field">
                  <label htmlFor="login-pass">{t("dash.login.password")}</label>
                  <input
                    id="login-pass"
                    className="input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && username.trim() && password && login()}
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !username.trim() || !password}
                  onClick={login}
                  data-testid="login-submit"
                >
                  {busy ? <span className="spinner" /> : <LogIn size={17} aria-hidden />}
                  {busy ? t("dash.login.working") : t("dash.login.submit")}
                </button>
              </>
            ) : (
              <>
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
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !token.trim()}
                  onClick={() => loadWith({ token: token.trim() }).then((ok) => !ok && setError(t("dash.notfound")))}
                >
                  {busy ? <span className="spinner" /> : <KeyRound size={17} aria-hidden />}
                  {busy ? t("dash.checking") : t("dash.check")}
                </button>
              </>
            )}
            {error && (
              <div className="status error" role="status">
                {error}
              </div>
            )}
          </section>
        )}

        {session && (
          <section className="card status-card-head-row">
            <div className="status-card-head">
              <span className="hint">
                {t("dash.user.label")}: <strong>{sessionUser}</strong>
              </span>
              <button type="button" className="btn-ghost" onClick={logout} data-testid="logout">
                <LogOut size={15} aria-hidden /> {t("dash.logout")}
              </button>
            </div>
          </section>
        )}

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
              {data.account_disabled && (
                <div className="status error" role="status">
                  {t("dash.disabled")}
                </div>
              )}
              <div className="status-grid">
                <div>
                  <span className="hint">
                    {t("dash.expires")}
                    {data.expiry_source === "server" && <> · {t("dash.live")}</>}
                  </span>
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
                  <strong>
                    {data.source === "nowpayments"
                      ? "Crypto"
                      : data.source === "azteco"
                        ? "Azteco"
                        : data.source === "manual"
                          ? "Support"
                          : "—"}
                  </strong>
                </div>
                {data.last_active && (
                  <div>
                    <span className="hint">{t("dash.lastactive")}</span>
                    <strong>{dateTimeFormat.format(new Date(data.last_active))}</strong>
                  </div>
                )}
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
                          <td>{item.method === "nowpayments" ? "Crypto" : item.method === "azteco" ? "Azteco" : "Support"}</td>
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

            {session && (
              <section className="card" data-testid="password-card">
                <h2 className="section-title">{t("dash.pw.title")}</h2>
                <p className="hint">{t("dash.pw.hint")}</p>
                <div className="field">
                  <label htmlFor="pw-current">{t("dash.pw.current")}</label>
                  <input
                    id="pw-current"
                    className="input"
                    type="password"
                    value={pwCurrent}
                    onChange={(event) => setPwCurrent(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pw-new">{t("dash.pw.new")}</label>
                  <input
                    id="pw-new"
                    className="input"
                    type="password"
                    value={pwNew}
                    onChange={(event) => setPwNew(event.target.value)}
                    autoComplete="new-password"
                  />
                  <span className="hint">{t("register.password.rules")}</span>
                </div>
                <div className="field">
                  <label htmlFor="pw-repeat">{t("dash.pw.repeat")}</label>
                  <input
                    id="pw-repeat"
                    className="input"
                    type="password"
                    value={pwRepeat}
                    onChange={(event) => setPwRepeat(event.target.value)}
                    autoComplete="new-password"
                  />
                  {pwRepeat && pwNew !== pwRepeat && <span className="hint bad">{t("register.password.mismatch")}</span>}
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={pwBusy || !pwValid}
                  onClick={changePassword}
                  data-testid="password-submit"
                >
                  {pwBusy ? <span className="spinner" /> : <ShieldCheck size={17} aria-hidden />}
                  {pwBusy ? t("dash.pw.working") : t("dash.pw.submit")}
                </button>
                {pwMessage && (
                  <div className={`status ${pwMessage.kind}`} role="status">
                    {pwMessage.text}
                  </div>
                )}
              </section>
            )}

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
