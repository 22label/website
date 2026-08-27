import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, allProductSlugs } from "@/data/capsule";
import ProductView from "@/components/capsule/ProductView";

/**
 * /capsule/product/[slug] — the CAPSULE single-product page. Explicit `product`
 * segment so no product slug can ever collide with the /capsule/mens and
 * /capsule/womens collection routes. Data-driven from the shared catalogue; an
 * unknown slug falls through to the framework 404. Rendered outside the shared
 * music/WebGL shell (isCapsuleRoute covers /capsule/*).
 */
export function generateStaticParams() {
  return allProductSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Not found · 2HOT2HANDLE" };
  return {
    title: `${product.title} — CAPSULE 22 · 2HOT2HANDLE`,
    description: `${product.title} — the 2HOT2HANDLE CAPSULE 22 collection.`,
  };
}

export default async function CapsuleProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();
  return <ProductView product={product} />;
}
