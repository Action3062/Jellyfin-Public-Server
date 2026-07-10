import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { CinematicBand } from "../components/landing/CinematicBand";
import { Faq } from "../components/landing/Faq";
import { Features } from "../components/landing/Features";
import { FinalCta } from "../components/landing/FinalCta";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Plans } from "../components/landing/Plans";
import { Stats } from "../components/landing/Stats";

export default function LandingPage() {
  return (
    <div className="landing">
      <SiteHeader />
      <main>
        <Hero />
        <Stats />
        <Features />
        <CinematicBand />
        <HowItWorks />
        <Plans />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
