import type { Metadata } from "next";
import { SanityResourceIndex } from "@/components/resources/SanityResourcePages";
import { RESOURCE_SECTIONS } from "@/sanity/types";

export const metadata: Metadata = {
  title: "Documentation | SketchForge",
  description: RESOURCE_SECTIONS.documentation.description,
};

export default function DocumentationPage() {
  return <SanityResourceIndex config={RESOURCE_SECTIONS.documentation} />;
}
