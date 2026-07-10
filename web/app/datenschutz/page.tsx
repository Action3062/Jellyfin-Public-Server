import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Datenschutz" };

export default function DatenschutzPage() {
  return (
    <div className="subpage">
      <SiteHeader />
      <main className="page narrow">
        <header className="page-head">
          <h1>Datenschutz / Privacy</h1>
        </header>
        <section className="card">
          <p>
            Diese Plattform ist bewusst datensparsam aufgebaut: keine E-Mail-Pflicht, keine Tracker, keine Analyse-Cookies,
            keine Zahlungsdaten auf unseren Servern.
          </p>
          <p className="hint">
            Gespeichert werden ausschließlich: Jellyfin-Benutzername (bzw. ein anonymer Bestellschlüssel), Zahlungsstatus und
            Laufzeit des Zugangs. Das bei der Registrierung gewählte Passwort wird direkt an den Medienserver übertragen und
            nicht bei uns gespeichert. Kryptozahlungen werden durch NOWPayments abgewickelt, Gutschein-Käufe durch Azteco — es
            gelten deren Datenschutzbestimmungen. Die Spracheinstellung wird lokal im Browser gespeichert (localStorage).
          </p>
          <p className="hint">
            This platform is built data-minimal by design: no email required, no trackers, no analytics cookies, no payment
            data on our servers. We only store your Jellyfin username (or an anonymous order key), payment status, and the
            validity of your access. Crypto payments are processed by NOWPayments, voucher purchases by Azteco — their
            privacy policies apply. Your language preference is stored locally in your browser.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
