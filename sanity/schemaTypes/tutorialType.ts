import { defineField, defineType } from "sanity";
import { coverImageField } from "./coverImageField";

export const tutorialType = defineType({
  name: "tutorial",
  title: "Tutorial",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "summary",
      title: "Summary",
      type: "text",
      rows: 3,
      validation: (rule) => rule.required().max(240),
    }),
    coverImageField,
    defineField({
      name: "level",
      title: "Level",
      type: "string",
      options: {
        list: ["Beginner", "Intermediate", "Advanced"],
        layout: "radio",
      },
      initialValue: "Beginner",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "durationMinutes",
      title: "Duration in minutes",
      type: "number",
      validation: (rule) => rule.required().integer().positive(),
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "body",
      title: "Tutorial steps",
      type: "array",
      of: [{ type: "block" }],
    }),
  ],
  orderings: [
    {
      title: "Newest first",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { title: "title", level: "level", duration: "durationMinutes" },
    prepare({ title, level, duration }) {
      return {
        title,
        subtitle: [level, duration ? `${duration} min` : null].filter(Boolean).join(" · "),
      };
    },
  },
});
