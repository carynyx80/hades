import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://haze-lake.vercel.app"),
  title: "Primar — First privacy prediction platform on BNB and Robinhood Chain",
  description: "Primar is the first privacy prediction platform on BNB Chain and Robinhood Chain. Call the move. Stay unseen.",
  openGraph: { title: "Primar", description: "The first privacy prediction platform on BNB Chain and Robinhood Chain.", siteName: "Primar", type: "website" },
  twitter: { card: "summary_large_image", title: "Primar", description: "The first privacy prediction platform on BNB Chain and Robinhood Chain." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      </head>
      <body className="grain font-sans">{children}</body>
    </html>
  );
}
