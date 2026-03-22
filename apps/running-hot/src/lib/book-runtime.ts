import { createBookRuntime } from "@bookkit/astro-bookkit";

import bookConfig from "../book.config";

export const bookRuntime = createBookRuntime({
  bookConfig,
  modules: {
    contentModules: {
      chapters: import.meta.glob("../content/book/chapters/*.mdx", { eager: true }),
      mechanisms: import.meta.glob("../content/book/mechanisms/*.mdx", { eager: true }),
      toolkit: import.meta.glob("../content/book/toolkit/*.mdx", { eager: true }),
      glossary: import.meta.glob("../content/book/glossary/*.mdx", { eager: true }),
      examples: import.meta.glob("../content/book/examples/**/*.mdx", { eager: true }),
    },
    contentRawModules: {
      chapters: import.meta.glob<string>("../content/book/chapters/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      mechanisms: import.meta.glob<string>("../content/book/mechanisms/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      toolkit: import.meta.glob<string>("../content/book/toolkit/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      glossary: import.meta.glob<string>("../content/book/glossary/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      examples: import.meta.glob<string>("../content/book/examples/**/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
    },
    releaseModules: import.meta.glob("../content/book/releases/*.mdx", {
      eager: true,
    }),
  },
  releaseNotes: {
    latestLabel: "Latest",
  },
});
