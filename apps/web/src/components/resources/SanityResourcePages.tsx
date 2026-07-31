import { PortableText } from "@portabletext/react";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/client";
import {
  RESOURCE_DETAIL_QUERY,
  RESOURCE_INDEX_QUERY,
  RESOURCE_SLUGS_QUERY,
} from "@/sanity/queries";
import { urlForImage } from "@/sanity/image";
import type {
  ResourceCoverImage,
  ResourceDocument,
  ResourceListItem,
  ResourceSectionConfig,
} from "@/sanity/types";

function ResourceHeader() {
  return (
    <header className="minimal-landing-blue resource-page-header">
      <nav className="minimal-nav" aria-label="Resource page navigation">
        <a className="minimal-nav-brand" href="/" aria-label="SketchForge home">
          <img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" />
          <span>SketchForge</span>
        </a>
        <span aria-hidden="true" />
        <div className="minimal-nav-actions">
          <a className="minimal-nav-cta" href="/">Back to home</a>
        </div>
      </nav>
    </header>
  );
}

function formatResourceDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function resourceMeta(item: ResourceListItem) {
  return [
    item.category,
    item.level,
    typeof item.durationMinutes === "number" ? `${item.durationMinutes} min` : null,
    item.comparedWith ? `vs ${item.comparedWith}` : null,
    formatResourceDate(item.publishedAt),
  ].filter((value): value is string => Boolean(value));
}

function resourceCoverUrl(
  image: ResourceCoverImage,
  width: number,
  height: number,
) {
  return urlForImage(image)
    .width(width)
    .height(height)
    .fit("crop")
    .auto("format")
    .url();
}

function ResourceCover({
  image,
  title,
  variant,
}: {
  image: ResourceCoverImage;
  title: string;
  variant: "card" | "article";
}) {
  const widths = variant === "card" ? [480, 800, 1200] : [640, 960, 1280, 1600];
  const srcSet = widths
    .map((width) => {
      const height = Math.round(width * 9 / 16);
      return `${resourceCoverUrl(image, width, height)} ${width}w`;
    })
    .join(", ");
  const largestWidth = widths.at(-1) ?? 1200;

  return (
    <figure className={`resource-cover resource-cover--${variant}`}>
      <img
        src={resourceCoverUrl(image, largestWidth, Math.round(largestWidth * 9 / 16))}
        srcSet={srcSet}
        sizes={
          variant === "card"
            ? "(max-width: 760px) calc(100vw - 32px), 360px"
            : "(max-width: 760px) calc(100vw - 32px), 1040px"
        }
        alt={image.alt || `${title} cover`}
        loading={variant === "card" ? "lazy" : "eager"}
        decoding="async"
      />
      {variant === "article" && image.caption ? (
        <figcaption>{image.caption}</figcaption>
      ) : null}
    </figure>
  );
}

export async function SanityResourceIndex({
  config,
}: {
  config: ResourceSectionConfig;
}) {
  const items = await sanityClient.fetch<ResourceListItem[]>(
    RESOURCE_INDEX_QUERY,
    { type: config.type },
  );

  return (
    <div className="resource-page">
      <ResourceHeader />
      <main className="resource-page-main">
        <section className="resource-page-hero">
          <p className="resource-page-kicker">Resources</p>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </section>

        {items.length ? (
          <div className="resource-page-grid">
            {items.map((item) => (
              <a
                className={`resource-card${item.coverImage ? " resource-card--with-cover" : ""}`}
                href={`${config.basePath}/${item.slug}`}
                key={item._id}
              >
                {item.coverImage ? (
                  <ResourceCover image={item.coverImage} title={item.title} variant="card" />
                ) : null}
                <div className="resource-card-content">
                  {resourceMeta(item).length ? (
                    <div className="resource-card-meta">
                      {resourceMeta(item).map((meta) => <span key={meta}>{meta}</span>)}
                    </div>
                  ) : null}
                  <h2>{item.title}</h2>
                  {item.summary ? <p>{item.summary}</p> : null}
                  <span className="resource-card-open">Read {config.itemLabel} →</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <section className="resource-page-empty">
            <h2>No published {config.itemLabel}s yet</h2>
            <p>This section is connected to Sanity and will populate when its first entry is published.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export async function SanityResourceArticle({
  config,
  slug,
}: {
  config: ResourceSectionConfig;
  slug: string;
}) {
  const document = await sanityClient.fetch<ResourceDocument | null>(
    RESOURCE_DETAIL_QUERY,
    { type: config.type, slug },
  );

  if (!document) notFound();
  const meta = resourceMeta(document);

  return (
    <div className="resource-page">
      <ResourceHeader />
      <main className="resource-page-main">
        <article className="resource-article">
          <a className="resource-article-back" href={config.basePath}>← Back to {config.title}</a>
          <p className="resource-page-kicker">{config.title}</p>
          <h1>{document.title}</h1>
          {document.coverImage ? (
            <ResourceCover
              image={document.coverImage}
              title={document.title}
              variant="article"
            />
          ) : null}
          {document.summary ? <p className="resource-article-summary">{document.summary}</p> : null}
          {meta.length ? (
            <div className="resource-article-meta">
              {meta.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
          {document.body?.length ? (
            <div className="resource-article-body">
              <PortableText value={document.body} />
            </div>
          ) : null}
        </article>
      </main>
    </div>
  );
}

export async function resourceStaticParams(type: ResourceSectionConfig["type"]) {
  const slugs = await sanityClient.fetch<Array<{ slug: string }>>(
    RESOURCE_SLUGS_QUERY,
    { type },
  );

  // Next's static exporter requires at least one generated value for dynamic
  // routes. The sentinel renders the regular not-found page and disappears
  // from the generated links as soon as real Sanity documents are published.
  return slugs.length ? slugs : [{ slug: "__empty-sanity-section" }];
}

export async function resourceMetadata(
  config: ResourceSectionConfig,
  slug: string,
) {
  const document = await sanityClient.fetch<ResourceDocument | null>(
    RESOURCE_DETAIL_QUERY,
    { type: config.type, slug },
  );
  const coverUrl = document?.coverImage
    ? resourceCoverUrl(document.coverImage, 1200, 630)
    : null;

  return {
    title: document ? `${document.title} | SketchForge` : `${config.title} | SketchForge`,
    description: document?.summary ?? config.description,
    openGraph: coverUrl
      ? {
          images: [{
            url: coverUrl,
            alt: document?.coverImage?.alt || document?.title || config.title,
            width: 1200,
            height: 630,
          }],
        }
      : undefined,
  };
}
