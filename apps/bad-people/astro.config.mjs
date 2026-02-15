import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { rehypeBookkitHeadingIds } from "@bookkit/astro-bookkit";

export default defineConfig({
  site: "https://bad-people.book",
  integrations: [mdx({ rehypePlugins: [rehypeBookkitHeadingIds] })],
  devToolbar: { enabled: false },
  vite: {
    ssr: {
      noExternal: ["@bookkit/astro-bookkit"],
    },
  },
});
