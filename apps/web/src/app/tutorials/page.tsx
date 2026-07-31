import type { Metadata } from "next";
import { SanityResourceIndex } from "@/components/resources/SanityResourcePages";
import { RESOURCE_SECTIONS } from "@/sanity/types";

export const metadata: Metadata = {
  title: "Tutorials | SketchForge",
  description: RESOURCE_SECTIONS.tutorials.description,
};

export default function TutorialsPage() {
  return <SanityResourceIndex config={RESOURCE_SECTIONS.tutorials} />;
}
