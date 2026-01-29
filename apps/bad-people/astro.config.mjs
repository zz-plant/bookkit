import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  integrations: [mdx()],
  vite: {
    ssr: {
      noExternal: ["@bookkit/astro-bookkit"],
    },
  },
});
