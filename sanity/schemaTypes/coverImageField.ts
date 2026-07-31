import { defineField } from "sanity";

export const coverImageField = defineField({
  name: "coverImage",
  title: "Cover image",
  type: "image",
  description: "Displayed on the resource card and at the top of the published article.",
  options: {
    hotspot: true,
  },
  fields: [
    defineField({
      name: "alt",
      title: "Alternative text",
      type: "string",
      description: "Briefly describe the image for people using screen readers.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "caption",
      title: "Caption",
      type: "string",
    }),
  ],
});
