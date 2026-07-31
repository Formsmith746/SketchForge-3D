import type { PortableTextBlock } from "@portabletext/react";
import type { SanityImageObject } from "@sanity/image-url";

export type ResourceDocumentType =
  | "update"
  | "tutorial"
  | "comparison"
  | "documentation";

export type ResourceSectionConfig = {
  type: ResourceDocumentType;
  title: string;
  description: string;
  basePath: "/updates" | "/tutorials" | "/compare" | "/documentation";
  itemLabel: string;
};

export type ResourceCoverImage = SanityImageObject & {
  alt?: string;
  caption?: string;
};

export type ResourceListItem = {
  _id: string;
  _type: ResourceDocumentType;
  title: string;
  slug: string;
  summary?: string;
  publishedAt?: string;
  category?: string;
  level?: string;
  durationMinutes?: number;
  comparedWith?: string;
  coverImage?: ResourceCoverImage;
};

export type ResourceDocument = ResourceListItem & {
  body?: PortableTextBlock[];
};

export const RESOURCE_SECTIONS = {
  updates: {
    type: "update",
    title: "Updates",
    description: "Product improvements, editor changes, and release notes from SketchForge.",
    basePath: "/updates",
    itemLabel: "update",
  },
  tutorials: {
    type: "tutorial",
    title: "Tutorials",
    description: "Step-by-step lessons for building and refining models in SketchForge.",
    basePath: "/tutorials",
    itemLabel: "tutorial",
  },
  compare: {
    type: "comparison",
    title: "Compare",
    description: "Straightforward comparisons between SketchForge and other 3D design tools.",
    basePath: "/compare",
    itemLabel: "comparison",
  },
  documentation: {
    type: "documentation",
    title: "Documentation",
    description: "Guides and reference material for SketchForge tools and workflows.",
    basePath: "/documentation",
    itemLabel: "article",
  },
} as const satisfies Record<string, ResourceSectionConfig>;
