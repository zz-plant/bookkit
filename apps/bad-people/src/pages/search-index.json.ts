import { createBookSearchIndexEndpoint } from "@bookkit/astro-bookkit";

const { GET } = createBookSearchIndexEndpoint({
  chapters: import.meta.glob<string>("../content/book/chapters/*.mdx", {
    eager: true,
    as: "raw",
  }),
  mechanisms: import.meta.glob<string>("../content/book/mechanisms/*.mdx", {
    eager: true,
    as: "raw",
  }),
  toolkit: import.meta.glob<string>("../content/book/toolkit/*.mdx", {
    eager: true,
    as: "raw",
  }),
  glossary: import.meta.glob<string>("../content/book/glossary/*.mdx", {
    eager: true,
    as: "raw",
  }),
  examples: import.meta.glob<string>("../content/book/examples/**/*.mdx", {
    eager: true,
    as: "raw",
  }),
});

export { GET };
