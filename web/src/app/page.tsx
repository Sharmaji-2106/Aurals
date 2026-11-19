import { BandExplorer } from "@/components/landing/band-explorer";
import { Closing, Principles } from "@/components/landing/closing";
import { Hero } from "@/components/landing/hero";
import { Journey } from "@/components/landing/journey";
import { LandingScene } from "@/components/landing/landing-scene";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";

export default function Home() {
  return (
    <>
      <LandingScene />
      <SiteHeader overlay />
      <main className="flex-1">
        <Hero />
        <Journey />
        <BandExplorer />
        <Principles />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
