import type { AstroIntegration } from "astro";

export type BookkitIntegrationOptions = {
	injectRoutes?: boolean;
};

/**
 * Astro integration for Bookkit book applications.
 * Automatically configures Vite SSR bundling and standardizes runtime environment.
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
		},
	};
}

export default bookkit;
