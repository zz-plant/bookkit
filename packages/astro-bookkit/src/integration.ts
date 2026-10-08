import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { writeOgImages } from "./seo/og-render";

export type BookkitIntegrationOptions = {
	injectRoutes?: boolean;
	/** Render a PNG link preview for every built page (default true). */
	ogImages?: boolean;
};

/**
 * Astro integration for Bookkit book applications.
 * Configures Vite SSR bundling, and after a build writes each page's
 * link-preview image (see `seo/og-image.ts`).
 */
export function bookkit(
	options: BookkitIntegrationOptions = {},
): AstroIntegration {
	return {
		name: "@bookkit/astro-bookkit",
		hooks: {
			"astro:config:setup": ({ updateConfig }) => {
				updateConfig({
					vite: {
						ssr: {
							noExternal: ["@bookkit/astro-bookkit"],
						},
						build: {
							rollupOptions: {
								onwarn(
									warning: { message?: string; [key: string]: any },
									warn: (w: any) => void,
								) {
									const message = warning.message ?? "";
									if (message.includes("Module level directives cause errors"))
										return;
									warn(warning);
								},
							},
						},
					},
				});
			},
			"astro:build:done": async ({ dir, logger }) => {
				if (options.ogImages === false) return;
				const started = performance.now();
				const { written, rendered } = await writeOgImages(fileURLToPath(dir));
				logger.info(
					`${written} link-preview images (${rendered} rendered, ${written - rendered} cached) in ${((performance.now() - started) / 1000).toFixed(1)}s`,
				);
			},
		},
	};
}

export default bookkit;
