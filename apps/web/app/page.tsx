import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Ticker } from "@/components/ticker";
import { HowItWorks, Markets, Privacy, Bento, Chains, FAQ, CTA, Footer } from "@/components/sections";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Ticker />
      <HowItWorks />
      <Markets />
      <Privacy />
      <Bento />
      <Chains />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
