import type { ReleaseModule } from "@bookkit/astro-bookkit";

type BookContentModules = {
  chapters: Record<string, unknown>;
  mechanisms: Record<string, unknown>;
  toolkit: Record<string, unknown>;
  glossary: Record<string, unknown>;
  examples: Record<string, unknown>;
};

type BookContentRawModules = {
  chapters: Record<string, string>;
  mechanisms: Record<string, string>;
  toolkit: Record<string, string>;
  glossary: Record<string, string>;
  examples: Record<string, string>;
};

const contentModules: BookContentModules = {
  chapters: import.meta.glob("../content/book/chapters/*.mdx", { eager: true }),
  mechanisms: import.meta.glob("../content/book/mechanisms/*.mdx", { eager: true }),
  toolkit: import.meta.glob("../content/book/toolkit/*.mdx", { eager: true }),
  glossary: import.meta.glob("../content/book/glossary/*.mdx", { eager: true }),
  examples: import.meta.glob("../content/book/examples/**/*.mdx", { eager: true }),
};

const contentRawModules: BookContentRawModules = {
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
};

const releaseModules = import.meta.glob<ReleaseModule>("../content/book/releases/*.mdx", {
  eager: true,
});

export const bookEntryPoints = {
  contentModules,
  contentRawModules,
  localizedContentModules: [
    contentModules.chapters,
    contentModules.mechanisms,
    contentModules.toolkit,
    contentModules.glossary,
    contentModules.examples,
  ],
  releaseModules,
};
