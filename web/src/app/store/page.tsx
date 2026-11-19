import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { StoreBrowser } from "@/components/store/store-browser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store",
  description: "Every earphone and headphone AURALS has measured, with where to buy it in India.",
};

export default function StorePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="shell flex-1 pb-28">
        <StoreBrowser />
      </main>
      <SiteFooter />
    </div>
  );
}
