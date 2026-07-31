import type { Metadata } from "next";
import { SanityResourceIndex } from "@/components/resources/SanityResourcePages";
import { RESOURCE_SECTIONS } from "@/sanity/types";

export const metadata: Metadata = {
  title: "Updates | SketchForge",
  description: RESOURCE_SECTIONS.updates.description,
};

export default function UpdatesPage() {
  return <SanityResourceIndex config={RESOURCE_SECTIONS.updates} />;
}
