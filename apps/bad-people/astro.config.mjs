import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { rehypeBookkitHeadingIds } from "@bookkit/astro-bookkit";

export default defineConfig({
  integrations: [mdx({ rehypePlugins: [rehypeBookkitHeadingIds] })],
  vite: {
    ssr: {
      noExternal: ["@bookkit/astro-bookkit"],
    },
  },
});
