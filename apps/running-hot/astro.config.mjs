import mdx from "@astrojs/mdx";
import { bookkit } from "@bookkit/astro-bookkit/integration";
import { defineConfig } from "astro/config";
import { bookConfig } from "./src/book.config";

// `site` derives from book.config.ts so canonical URLs, the sitemap, robots.txt,
// and the RSS feed share one declaration. Change the URL there, not here.
export default defineConfig({
	site: bookConfig.site.url,
	// Headings get Astro's GitHub-style ids; the search index matches them.
	// bookkit() bundles the engine for SSR and, after a build, draws the site's
	// icons and each page's link-preview image.
	integrations: [mdx(), bookkit()],
	devToolbar: { enabled: false },
});
