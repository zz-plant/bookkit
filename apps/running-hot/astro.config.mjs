import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { rehypeBookkitHeadingIds } from "@bookkit/astro-bookkit";

export default defineConfig({
  site: "https://running-hot.book",
  integrations: [mdx({ rehypePlugins: [rehypeBookkitHeadingIds] })],
  vite: {
    ssr: {
      noExternal: ["@bookkit/astro-bookkit"],
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          const message = warning.message ?? "";
          if (message.includes("Module level directives cause errors")) return;
          warn(warning);
        },
      },
    },
  },
});
