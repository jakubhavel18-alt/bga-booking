import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";

// Podle brand manuálu Business Gate: hlavní písmo je Work Sans (nadpisy
// i běžný text appky). "Strojové" písmo z manuálu (Helvetica) appka bere
// jako systémový font — viz --font-mono v globals.css — ať appka
// nezávisí na dalším webfontu jen pro pár čísel/časů.
const display = Work_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rezervace místností",
  description: "Rezervační systém pro místnosti a stoly",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
