import { defineQuery } from "next-sanity";

export const RESOURCE_INDEX_QUERY = defineQuery(`
  *[_type == $type && defined(slug.current)]
  | order(coalesce(sortOrder, 999999) asc, coalesce(publishedAt, _updatedAt) desc) {
    _id,
    _type,
    title,
    "slug": slug.current,
    summary,
    publishedAt,
    category,
    level,
    durationMinutes,
    comparedWith,
    coverImage
  }
`);

export const RESOURCE_SLUGS_QUERY = defineQuery(`
  *[_type == $type && defined(slug.current)] {
    "slug": slug.current
  }
`);

export const RESOURCE_DETAIL_QUERY = defineQuery(`
  *[_type == $type && slug.current == $slug][0] {
    _id,
    _type,
    title,
    "slug": slug.current,
    summary,
    publishedAt,
    category,
    level,
    durationMinutes,
    comparedWith,
    coverImage,
    body
  }
`);
