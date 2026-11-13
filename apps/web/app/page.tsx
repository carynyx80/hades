import { Nav } from "@/components/nav";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Hero } from "@/components/hero";
import { Ticker } from "@/components/ticker";
import { Statement, HowItWorks, Markets, Stats, Privacy, Bento, Chains, FAQ, CTA, Footer } from "@/components/sections";

export default function Home() {
  return (
    <main>
      <SmoothScroll />
      <Nav />
      <Hero />
      <Ticker />
      <Statement />
      <HowItWorks />
      <Markets />
      <Stats />
      <Privacy />
      <Bento />
      <Chains />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
