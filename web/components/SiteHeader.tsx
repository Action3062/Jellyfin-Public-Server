"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { shopName } from "../lib/site";
import { LangToggle } from "./LangToggle";
import { useLanguage } from "./LanguageProvider";

export function SiteHeader() {
  const { t } = useLanguage();
  const pathname = usePathname();

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/pay", label: t("nav.pay") },
    { href: "/dashboard", label: t("nav.dashboard") }
  ];

  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label={shopName}>
        <Clapperboard size={22} aria-hidden />
        <span>{shopName}</span>
      </Link>
      <nav className="site-nav" aria-label="Main">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </Link>
        ))}
      </nav>
      <LangToggle />
    </header>
  );
}
