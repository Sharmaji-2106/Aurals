"use client";

import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { ProductView } from "@/components/store/product-view";
import { useParams } from "next/navigation";

export default function StoreProductPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="shell flex-1">{slug && <ProductView slug={slug} />}</main>
      <SiteFooter />
    </div>
  );
}
