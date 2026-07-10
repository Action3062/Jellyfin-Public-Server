import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <div className="subpage">
      <SiteHeader />
      <main className="page narrow">
        <header className="page-head">
          <h1>Impressum</h1>
        </header>
        <section className="card">
          <p className="hint">
            Angaben gemäß § 5 TMG. Bitte vor dem öffentlichen Betrieb mit den Daten des Betreibers vervollständigen:
          </p>
          <p>
            <strong>Betreiber:</strong> — <br />
            <strong>Kontakt:</strong> Discord-Support (siehe Footer)
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
