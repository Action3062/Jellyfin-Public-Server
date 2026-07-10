export type Lang = "de" | "en";

export const LANG_STORAGE_KEY = "byteflix-lang";

const de = {
  // Shared chrome
  "nav.home": "Start",
  "nav.pay": "Mitglied werden",
  "nav.dashboard": "Dashboard",
  "nav.discord": "Discord Support",
  "nav.privacylink": "Datenschutz",
  "footer.tagline": "Privater Streaming-Server für Filmliebhaber.",
  "footer.privacy": "Keine Tracker. Keine Werbung. Keine Klarnamen.",
  "footer.back": "Zurück zur Startseite",

  // Landing
  "landing.badge": "Privat · Werbefrei · Anonym",
  "landing.hero.title": "Dein privates Kino.\nImmer geöffnet.",
  "landing.hero.subtitle":
    "Kuratiertes Streaming über Jellyfin & Plex — 2000+ Filme, 500+ Serien, 10 Gb/s Anbindung. Bezahlt wird anonym mit Krypto oder Azteco-Gutscheinen.",
  "landing.hero.cta": "Jetzt Mitglied werden",
  "landing.hero.secondary": "Abo-Status prüfen",
  "landing.stats.movies": "Filme",
  "landing.stats.shows": "Serien",
  "landing.stats.speed": "Anbindung",
  "landing.stats.uptime": "Verfügbarkeit",
  "landing.features.title": "Warum dieser Server?",
  "landing.features.subtitle": "Ein Server, gebaut wie ein gutes Kino: dunkel, schnell, diskret.",
  "landing.features.library.title": "Kuratiertes Archiv",
  "landing.features.library.body":
    "Handverlesene Filme und Serien in HD und 4K, sauber gepflegt mit Metadaten, Untertiteln und Originalton.",
  "landing.features.speed.title": "10 Gb/s Streaming",
  "landing.features.speed.body":
    "Direktes Streaming ohne Drosselung — 4K-Remux startet in Sekunden, auch bei mehreren Streams gleichzeitig.",
  "landing.features.privacy.title": "Privatsphäre zuerst",
  "landing.features.privacy.body":
    "Keine E-Mail-Pflicht, keine Zahlungsdaten bei uns, keine Tracker. Bezahlt wird per Krypto oder Azteco-Gutschein.",
  "landing.features.apps.title": "Jellyfin & Plex",
  "landing.features.apps.body":
    "Nutze die Apps, die du kennst: Jellyfin auf allen Geräten, Plex inklusive beim Jahresabo.",
  "landing.how.title": "In drei Schritten dabei",
  "landing.how.step1.title": "Plan wählen",
  "landing.how.step1.body": "1, 3 oder 12 Monate — bezahlbar mit BTC, ETH, XMR und mehr oder per Azteco-Gutschein.",
  "landing.how.step2.title": "Anonym bezahlen",
  "landing.how.step2.body": "Zahlung läuft über NOWPayments oder Azteco. Wir sehen keine Bankdaten, du bleibst anonym.",
  "landing.how.step3.title": "Sofort streamen",
  "landing.how.step3.body":
    "Bestehende Konten werden automatisch verlängert. Neue Mitglieder erhalten einen Einladungslink zur Registrierung.",
  "landing.plans.title": "Faire Preise, keine Abofalle",
  "landing.plans.subtitle": "Kein automatischer Einzug: Dein Zugang endet einfach, wenn du nicht verlängerst.",
  "landing.plans.permonth": "pro Monat",
  "landing.plans.cta": "Weiter zur Zahlung",
  "landing.plans.plex": "Plex-Zugang inklusive",
  "landing.faq.title": "Häufige Fragen",
  "landing.faq.q1": "Warum nur Krypto und Azteco?",
  "landing.faq.a1":
    "Maximale Anonymität für beide Seiten. Azteco-Gutscheine kannst du auf azte.co ganz normal mit Kreditkarte, PayPal oder Apple Pay kaufen und hier einlösen.",
  "landing.faq.q2": "Ich habe noch kein Konto — wie starte ich?",
  "landing.faq.a2":
    "Einfach beim Bezahlen deinen Wunsch-Benutzernamen angeben. Nach Zahlungseingang bekommst du einen Einladungslink, mit dem du dein Jellyfin-Konto selbst anlegst.",
  "landing.faq.q3": "Was passiert, wenn mein Abo ausläuft?",
  "landing.faq.a3":
    "Dein Konto bleibt bestehen, nur das Streaming pausiert. Sobald du verlängerst, läuft alles weiter wie vorher.",
  "landing.faq.q4": "Auf welchen Geräten kann ich schauen?",
  "landing.faq.a4":
    "Überall, wo Jellyfin oder Plex läuft: Smart-TV, Fire TV, Apple TV, iOS, Android, Desktop und Browser.",
  "landing.cta.title": "Bereit für besseres Streaming?",
  "landing.cta.body": "Werde in wenigen Minuten Mitglied — ganz ohne Konto-Zwang, E-Mail oder Kreditkarte bei uns.",

  // Checkout
  "pay.title": "Zahlung",
  "pay.banner": "2000+ Filme · 500+ Serien · 10 Gb/s · Plex & Jellyfin",
  "pay.why.title": "🔒 Warum Crypto & Azteco?",
  "pay.why.body":
    "Nur Krypto und Azteco für maximale Anonymität. Azteco-Gutscheine kannst du auf azte.co mit Kreditkarte, PayPal oder Apple Pay kaufen.",
  "pay.tab.crypto": "₿ Crypto (NOWPayments)",
  "pay.tab.azteco": "🎫 Azteco",
  "pay.duration": "Laufzeit",
  "pay.coin": "Coin",
  "pay.voucher.amount": "Gutscheinbetrag",
  "pay.voucher.hint": "Codes auf azte.co kaufen. Die Einlösung läuft automatisch und sequenziell.",
  "pay.voucher.code1": "Gutschein-Code 1",
  "pay.voucher.code2": "Gutschein-Code 2",
  "pay.voucher.optional": "(optional)",
  "pay.account.title": "Dein Konto",
  "pay.account.existing": "Ich habe ein Konto",
  "pay.account.new": "Ich bin neu hier",
  "pay.account.new.hint":
    "Kein Benutzername nötig: Nach der Zahlung bekommst du einen Einladungslink und wählst Name & Passwort selbst.",
  "pay.username.label": "Dein Jellyfin-Benutzername",
  "pay.username.checking": "Prüfe Benutzer",
  "pay.username.found": "✅ Benutzer gefunden — Laufzeit wird verlängert",
  "pay.username.missing": "Benutzer nicht gefunden — wähle „Ich bin neu hier“",
  "pay.azteco.single.hint": "Als neues Mitglied kannst du pro Bestellung einen Gutschein einlösen.",
  "pay.plex.label": "Plex-Username",
  "pay.plex.hint": "Jahresabo beinhaltet Plex",
  "pay.submit.crypto": "Mit Crypto bezahlen",
  "pay.submit.azteco": "Einlösen & Aktivieren",
  "pay.status.creating": "Invoice wird erstellt",
  "pay.status.redeeming": "Gutschein wird eingelöst",
  "pay.back": "Zurück zu {shop}",

  // Order page
  "order.title": "Deine Bestellung",
  "order.subtitle": "Diese Seite ist dein Zahlungsbeleg. Speichere den Zugangslink unten — er ist dein Schlüssel zu Status und Dashboard.",
  "order.step.payment": "Zahlung",
  "order.step.activation": "Aktivierung",
  "order.step.plex": "Plex-Zugang",
  "order.payment.pending": "Warten auf Zahlungseingang — Status aktualisiert sich automatisch.",
  "order.payment.paid": "Zahlung bestätigt.",
  "order.payment.failed": "Zahlung fehlgeschlagen oder abgelaufen.",
  "order.payment.underpaid":
    "Teilzahlung eingegangen (Betrag zu niedrig). Bitte melde dich im Discord-Support — wir kümmern uns darum.",
  "order.invoice.open": "Zahlungsseite öffnen",
  "order.provision.pending": "Dein Zugang wird aktiviert …",
  "order.provision.provisioned": "Dein Zugang ist aktiv. Viel Spaß!",
  "order.provision.awaiting": "Zahlung erhalten! Erstelle jetzt dein Konto über deinen persönlichen Einladungslink:",
  "order.provision.failed": "Aktivierung fehlgeschlagen — bitte melde dich im Discord-Support.",
  "order.invite.open": "Konto jetzt erstellen",
  "order.invite.hint": "Der Link ist 7 Tage gültig und kann nur einmal verwendet werden.",
  "order.plex.pending": "Plex-Einladung wird versendet …",
  "order.plex.invited": "Plex-Einladung versendet — prüfe dein Plex-Konto.",
  "order.plex.failed": "Plex-Einladung fehlgeschlagen — bitte melde dich im Discord-Support.",
  "order.claim.title": "Dein Zugangslink",
  "order.claim.body":
    "Speichere diesen Link (Lesezeichen oder Passwort-Manager). Er ist der einzige Weg, Bestellung und Dashboard wieder zu öffnen — wir speichern keine E-Mail-Adresse.",
  "order.claim.copy": "Link kopieren",
  "order.claim.copied": "Kopiert!",
  "order.dashboard.cta": "Zum Dashboard",
  "order.notfound": "Bestellung nicht gefunden. Prüfe, ob du den vollständigen Zugangslink (inklusive #t=…) geöffnet hast.",
  "order.expires": "Zugang läuft bis",

  // Dashboard
  "dash.title": "Dein Dashboard",
  "dash.subtitle": "Füge deinen Zugangsschlüssel ein — du findest ihn in deinem gespeicherten Bestell-Link hinter „#t=“.",
  "dash.token.label": "Zugangsschlüssel",
  "dash.token.hint": "Dein Schlüssel steckt im Bestell-Link: …/order/abc#t=SCHLÜSSEL",
  "dash.check": "Status prüfen",
  "dash.checking": "Wird geprüft",
  "dash.notfound": "Kein Zugang zu diesem Schlüssel gefunden.",
  "dash.registration.pending": "Deine Registrierung ist noch offen — erstelle dein Konto über den Einladungslink deiner Bestellung.",
  "dash.order.link": "Zur Bestellung",
  "dash.status.active": "Aktiv",
  "dash.status.expired": "Abgelaufen",
  "dash.status.label": "Status",
  "dash.user.label": "Benutzer",
  "dash.expires": "Läuft ab am",
  "dash.daysleft": "{days} Tage verbleibend",
  "dash.expiredago": "Abgelaufen — jetzt verlängern und weiterschauen.",
  "dash.plan": "Aktueller Plan",
  "dash.source": "Zahlungsart",
  "dash.history.title": "Zahlungshistorie",
  "dash.history.empty": "Noch keine Zahlungen.",
  "dash.renew": "Jetzt verlängern",
  "dash.privacy":
    "Dein Dashboard ist nur über deinen Zugangsschlüssel erreichbar — kein Login, keine E-Mail, keine Klarnamen.",

  // Misc
  "common.error": "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
  "common.loading": "Lädt"
};

const en: Record<keyof typeof de, string> = {
  "nav.home": "Home",
  "nav.pay": "Become a member",
  "nav.dashboard": "Dashboard",
  "nav.discord": "Discord support",
  "nav.privacylink": "Privacy",
  "footer.tagline": "A private streaming server for film lovers.",
  "footer.privacy": "No trackers. No ads. No real names.",
  "footer.back": "Back to home",

  "landing.badge": "Private · Ad-free · Anonymous",
  "landing.hero.title": "Your private cinema.\nAlways open.",
  "landing.hero.subtitle":
    "Curated streaming via Jellyfin & Plex — 2000+ movies, 500+ shows, on a 10 Gb/s line. Pay anonymously with crypto or Azteco vouchers.",
  "landing.hero.cta": "Become a member",
  "landing.hero.secondary": "Check subscription",
  "landing.stats.movies": "Movies",
  "landing.stats.shows": "Shows",
  "landing.stats.speed": "Bandwidth",
  "landing.stats.uptime": "Uptime",
  "landing.features.title": "Why this server?",
  "landing.features.subtitle": "Built like a good cinema: dark, fast, discreet.",
  "landing.features.library.title": "Curated archive",
  "landing.features.library.body":
    "Hand-picked movies and shows in HD and 4K, carefully maintained with metadata, subtitles, and original audio.",
  "landing.features.speed.title": "10 Gb/s streaming",
  "landing.features.speed.body":
    "Direct streaming with zero throttling — 4K remuxes start in seconds, even with several concurrent streams.",
  "landing.features.privacy.title": "Privacy first",
  "landing.features.privacy.body":
    "No e-mail required, no payment data stored with us, no trackers. Pay with crypto or an Azteco voucher.",
  "landing.features.apps.title": "Jellyfin & Plex",
  "landing.features.apps.body":
    "Use the apps you already know: Jellyfin on every device, Plex included with the yearly plan.",
  "landing.how.title": "Three steps to join",
  "landing.how.step1.title": "Pick a plan",
  "landing.how.step1.body": "1, 3, or 12 months — payable with BTC, ETH, XMR and more, or an Azteco voucher.",
  "landing.how.step2.title": "Pay anonymously",
  "landing.how.step2.body": "Payments run through NOWPayments or Azteco. We never see bank details; you stay anonymous.",
  "landing.how.step3.title": "Stream instantly",
  "landing.how.step3.body":
    "Existing accounts extend automatically. New members receive an invite link to register.",
  "landing.plans.title": "Fair pricing, no subscription trap",
  "landing.plans.subtitle": "No auto-renewal: your access simply ends unless you extend it.",
  "landing.plans.permonth": "per month",
  "landing.plans.cta": "Continue to payment",
  "landing.plans.plex": "Plex access included",
  "landing.faq.title": "Frequently asked questions",
  "landing.faq.q1": "Why crypto and Azteco only?",
  "landing.faq.a1":
    "Maximum anonymity for both sides. You can buy Azteco vouchers on azte.co with a credit card, PayPal, or Apple Pay, then redeem them here.",
  "landing.faq.q2": "I don't have an account yet — how do I start?",
  "landing.faq.a2":
    "Just enter your desired username at checkout. Once your payment is confirmed you'll receive an invite link to create your Jellyfin account.",
  "landing.faq.q3": "What happens when my subscription expires?",
  "landing.faq.a3":
    "Your account stays; only streaming pauses. As soon as you extend, everything continues as before.",
  "landing.faq.q4": "Which devices can I watch on?",
  "landing.faq.a4":
    "Anywhere Jellyfin or Plex runs: smart TVs, Fire TV, Apple TV, iOS, Android, desktop, and the browser.",
  "landing.cta.title": "Ready for better streaming?",
  "landing.cta.body": "Become a member in minutes — no forced account, e-mail, or credit card with us.",

  "pay.title": "Payment",
  "pay.banner": "2000+ movies · 500+ shows · 10 Gb/s · Plex & Jellyfin",
  "pay.why.title": "🔒 Why Crypto & Azteco?",
  "pay.why.body":
    "Crypto and Azteco only for maximum anonymity. You can buy Azteco vouchers on azte.co with credit card, PayPal, or Apple Pay.",
  "pay.tab.crypto": "₿ Crypto (NOWPayments)",
  "pay.tab.azteco": "🎫 Azteco",
  "pay.duration": "Duration",
  "pay.coin": "Coin",
  "pay.voucher.amount": "Voucher amount",
  "pay.voucher.hint": "Buy codes at azte.co. Redemption runs automatically and sequentially.",
  "pay.voucher.code1": "Voucher code 1",
  "pay.voucher.code2": "Voucher code 2",
  "pay.voucher.optional": "(optional)",
  "pay.account.title": "Your account",
  "pay.account.existing": "I have an account",
  "pay.account.new": "I'm new here",
  "pay.account.new.hint":
    "No username needed: after payment you'll receive an invite link and pick your name & password yourself.",
  "pay.username.label": "Your Jellyfin username",
  "pay.username.checking": "Checking user",
  "pay.username.found": "✅ User found — your subscription will be extended",
  "pay.username.missing": "User not found — choose \"I'm new here\"",
  "pay.azteco.single.hint": "As a new member you can redeem one voucher per order.",
  "pay.plex.label": "Plex username",
  "pay.plex.hint": "Yearly subscription includes Plex",
  "pay.submit.crypto": "Pay with Crypto",
  "pay.submit.azteco": "Redeem & Activate",
  "pay.status.creating": "Creating invoice",
  "pay.status.redeeming": "Redeeming voucher",
  "pay.back": "Back to {shop}",

  "order.title": "Your order",
  "order.subtitle": "This page is your receipt. Save the access link below — it is your key to status and dashboard.",
  "order.step.payment": "Payment",
  "order.step.activation": "Activation",
  "order.step.plex": "Plex access",
  "order.payment.pending": "Waiting for payment — this page updates automatically.",
  "order.payment.paid": "Payment confirmed.",
  "order.payment.failed": "Payment failed or expired.",
  "order.payment.underpaid":
    "Partial payment received (amount too low). Please contact Discord support — we'll sort it out.",
  "order.invoice.open": "Open payment page",
  "order.provision.pending": "Activating your access …",
  "order.provision.provisioned": "Your access is active. Enjoy!",
  "order.provision.awaiting": "Payment received! Create your account now via your personal invite link:",
  "order.provision.failed": "Activation failed — please contact Discord support.",
  "order.invite.open": "Create account now",
  "order.invite.hint": "The link is valid for 7 days and can only be used once.",
  "order.plex.pending": "Sending Plex invite …",
  "order.plex.invited": "Plex invite sent — check your Plex account.",
  "order.plex.failed": "Plex invite failed — please contact Discord support.",
  "order.claim.title": "Your access link",
  "order.claim.body":
    "Save this link (bookmark or password manager). It is the only way back to your order and dashboard — we don't store an email address.",
  "order.claim.copy": "Copy link",
  "order.claim.copied": "Copied!",
  "order.dashboard.cta": "Open dashboard",
  "order.notfound": "Order not found. Make sure you opened the full access link (including #t=…).",
  "order.expires": "Access valid until",

  "dash.title": "Your dashboard",
  "dash.subtitle": "Paste your access key — you'll find it in your saved order link after \"#t=\".",
  "dash.token.label": "Access key",
  "dash.token.hint": "Your key is part of the order link: …/order/abc#t=KEY",
  "dash.check": "Check status",
  "dash.checking": "Checking",
  "dash.notfound": "No access found for this key.",
  "dash.registration.pending": "Your registration is still open — create your account via your order's invite link.",
  "dash.order.link": "Open order",
  "dash.status.active": "Active",
  "dash.status.expired": "Expired",
  "dash.status.label": "Status",
  "dash.user.label": "User",
  "dash.expires": "Expires on",
  "dash.daysleft": "{days} days left",
  "dash.expiredago": "Expired — extend now to keep watching.",
  "dash.plan": "Current plan",
  "dash.source": "Payment method",
  "dash.history.title": "Payment history",
  "dash.history.empty": "No payments yet.",
  "dash.renew": "Extend now",
  "dash.privacy":
    "Your dashboard is only reachable with your access key — no login, no email, no real names.",

  "common.error": "Something went wrong. Please try again.",
  "common.loading": "Loading"
};

export type MessageKey = keyof typeof de;

const dictionaries: Record<Lang, Record<MessageKey, string>> = { de, en };

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>) {
  let text = dictionaries[lang][key] ?? dictionaries.de[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
