import type { MetadataRoute } from "next";
import { sanityClient } from "@/sanity/client";

const siteUrl = "https://sketchforge3d.com";

const resourceBasePaths = {
  update: "/updates",
  tutorial: "/tutorials",
  comparison: "/compare",
  documentation: "/documentation",
} as const;

type ResourceSitemapEntry = {
  _type: keyof typeof resourceBasePaths;
  slug: string;
  updatedAt: string;
};

const resourceSitemapQuery = `*[
  _type in ["update", "tutorial", "comparison", "documentation"]
  && defined(slug.current)
] {
  _type,
  "slug": slug.current,
  "updatedAt": _updatedAt
}`;

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const resources = await sanityClient.fetch<ResourceSitemapEntry[]>(
    resourceSitemapQuery,
  );

  const pages: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/demo/`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/updates/`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/tutorials/`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/compare/`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/documentation/`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/privacy/`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms/`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  return [
    ...pages,
    ...resources.map((resource) => ({
      url: `${siteUrl}${resourceBasePaths[resource._type]}/${resource.slug}/`,
      lastModified: resource.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
