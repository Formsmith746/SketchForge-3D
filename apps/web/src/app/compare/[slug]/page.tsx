import type { Metadata } from "next";
import {
  resourceMetadata,
  resourceStaticParams,
  SanityResourceArticle,
} from "@/components/resources/SanityResourcePages";
import { RESOURCE_SECTIONS } from "@/sanity/types";

export function generateStaticParams() {
  return resourceStaticParams(RESOURCE_SECTIONS.compare.type);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return resourceMetadata(RESOURCE_SECTIONS.compare, slug);
}

export default async function ComparisonArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SanityResourceArticle config={RESOURCE_SECTIONS.compare} slug={slug} />;
}
