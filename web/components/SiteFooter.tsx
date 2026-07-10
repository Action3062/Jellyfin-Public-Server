"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { discordUrl, shopName } from "../lib/site";
import { useLanguage } from "./LanguageProvider";

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="site-footer">
      <div>
        <strong>{shopName}</strong>
        <p>{t("footer.tagline")}</p>
        <p className="hint">{t("footer.privacy")}</p>
      </div>
      <nav className="site-footer-nav" aria-label="Footer">
        <Link href="/">{t("nav.home")}</Link>
        <Link href="/pay">{t("nav.pay")}</Link>
        <Link href="/dashboard">{t("nav.dashboard")}</Link>
        <Link href="/impressum">Impressum</Link>
        <Link href="/datenschutz">{t("nav.privacylink")}</Link>
        {discordUrl && (
          <a className="discord" href={discordUrl} target="_blank" rel="noreferrer">
            <MessageCircle size={16} aria-hidden /> {t("nav.discord")}
          </a>
        )}
      </nav>
    </footer>
  );
}
