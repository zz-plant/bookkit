import mdx from "@astrojs/mdx";
import { rehypeBookkitHeadingIds } from "@bookkit/astro-bookkit";
import { defineConfig } from "astro/config";
import { bookConfig } from "./src/book.config";

// `site` derives from book.config.ts so canonical URLs, the sitemap, robots.txt,
// and the RSS feed share one declaration. Change the URL there, not here.
export default defineConfig({
	site: bookConfig.site.url,
	integrations: [mdx({ rehypePlugins: [rehypeBookkitHeadingIds] })],
	devToolbar: { enabled: false },
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
