import type { Metadata } from "next";
import { SanityResourceIndex } from "@/components/resources/SanityResourcePages";
import { RESOURCE_SECTIONS } from "@/sanity/types";

export const metadata: Metadata = {
  title: "Compare | SketchForge",
  description: RESOURCE_SECTIONS.compare.description,
};

export default function ComparePage() {
  return <SanityResourceIndex config={RESOURCE_SECTIONS.compare} />;
}
