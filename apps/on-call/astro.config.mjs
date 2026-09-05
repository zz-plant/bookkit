import mdx from "@astrojs/mdx";
import { rehypeBookkitHeadingIds } from "@bookkit/astro-bookkit";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://on-call.book",
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
