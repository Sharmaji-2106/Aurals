import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteGlow } from "@/components/scene/site-glow";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
const shoulders = Big_Shoulders({ variable: "--font-shoulders", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: {
    default: "AURALS · Beyond what you hear",
    template: "%s · AURALS",
  },
  description:
    "AURALS listens to the music you love and learns your sound, then matches you with in-ear monitors that draw the same line — measured, and explained.",
  applicationName: "AURALS",
  openGraph: {
    title: "AURALS · Beyond what you hear",
    description: "Your music, measured into a sound of your own — and the earphones that match it.",
    siteName: "AURALS",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0913",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable} ${shoulders.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <div className="atmosphere" aria-hidden="true" />
        <SiteGlow />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
