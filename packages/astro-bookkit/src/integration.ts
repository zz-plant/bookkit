import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { addSafeHtml } from "./markdown/safe-html";
import { writeBookIcons } from "./seo/book-icons";
import type { BookSeoConfig } from "./seo/config";
import { writeOgImages } from "./seo/og-render";

export type BookkitIntegrationOptions = {
	/** Render a PNG link preview for every built page (default true). */
	ogImages?: boolean;
	/** `site.runtime` from book.config.ts: where the built book is served. */
	runtime?: BookSeoConfig["runtime"];
};

/** Packages the engine imports lazily and can run without (the Ask panel's models). */
export const OPTIONAL_DEPENDENCIES = ["@xenova/transformers"];

/** The optional dependency `source` imports (the package or a file in it), if any. */
const optionalDependencyOf = (source: string): string | undefined =>
	OPTIONAL_DEPENDENCIES.find(
		(name) => source === name || source.startsWith(`${name}/`),
	);

const MISSING_PREFIX = "\0bookkit-missing:";

type ResolveContext = {
	resolve: (
		source: string,
		importer: string | undefined,
		options: { skipSelf: boolean },
	) => Promise<{ id: string } | null>;
};

/**
 * Lets a book build when an optional dependency is not installed (for
 * example `bun install --omit=optional`). An import of a missing one resolves
 * to a module that throws when loaded, so the lazy `import()` that asked for
 * it rejects with that message and the feature stays off, where Vite would
 * otherwise fail the build on an unresolved import.
 */
export const optionalDependencies = () => ({
	name: "bookkit:optional-dependencies",
	enforce: "pre" as const,
	async resolveId(
		this: ResolveContext,
		source: string,
		importer: string | undefined,
	) {
		if (!optionalDependencyOf(source)) return null;
		const resolved = await this.resolve(source, importer, { skipSelf: true });
		return resolved ?? `${MISSING_PREFIX}${source}`;
	},
	load(id: string) {
		if (!id.startsWith(MISSING_PREFIX)) return null;
		const source = id.slice(MISSING_PREFIX.length);
		const name = optionalDependencyOf(source) ?? source;
		return `throw new Error(${JSON.stringify(
			`${name} is not installed, so the feature that needs it is off. It is an optional dependency of @bookkit/astro-bookkit; run bun install without --omit=optional to add it.`,
		)});`;
	},
});

/** ONNX Runtime's build with only the WebAssembly backend, threads and proxy worker left out. */
export const ONNX_RUNTIME_WASM_BUILD =
	"onnxruntime-web/dist/ort.wasm-core.min.js";

/**
 * Bundles ONNX Runtime's WebAssembly-only build where @xenova/transformers
 * imports `onnxruntime-web`. The package's browser entry also carries the
 * WebGL backend: 548 kB, with a direct `eval` (protobufjs's `inquire`) that
 * Rolldown warns about. Transformers.js runs its models only on WebAssembly
 * (`executionProviders: ["wasm"]`), and the Ask panel runs it on one thread
 * (`embeddings/transformers.ts`), which this 54 kB build covers. Resolved
 * from the importer, so it finds the onnxruntime-web that transformers.js
 * pins. Only the reader's browser loads it: on a server, transformers.js
 * uses onnxruntime-node.
 */
export const onnxRuntimeWasmOnly = () => ({
	name: "bookkit:onnx-runtime-wasm-only",
	enforce: "pre" as const,
	resolveId(
		this: ResolveContext,
		source: string,
		importer: string | undefined,
	) {
		if (source !== "onnxruntime-web") return null;
		return this.resolve(ONNX_RUNTIME_WASM_BUILD, importer, { skipSelf: true });
	},
});

/**
 * Astro integration for Bookkit book applications.
 * Configures Vite SSR bundling and the optional dependencies, keeps unsafe
 * links and raw HTML out of the book's pages, decides which API routes run
 * on demand, and
 * after a build writes the site's icons (see `seo/book-icons.ts`) and each
 * page's link-preview image (see `seo/og-image.ts`).
 *
 * API routes (`src/pages/api/**`) run on demand in `astro dev`, so POST works
 * there (MCP tool calls, feedback), and in a build when `runtime` is "server".
 * A static build prerenders them: the MCP discovery manifest is written, and
 * the request handlers answer the prerender with no body, which leaves them
 * out of `dist/` (see `utils/http.ts`).
 */
export function bookkit(
	options: BookkitIntegrationOptions = {},
): AstroIntegration {
	const serverRuntime = options.runtime === "server";
	let apiRoutesOnDemand = false;
	let apiRouteDir = "src/pages/api/";

	return {
		name: "@bookkit/astro-bookkit",
		hooks: {
			"astro:config:setup": ({ command, config, logger, updateConfig }) => {
				if (command === "build" && serverRuntime && !config.adapter) {
					throw new Error(
						'site.runtime is "server" in src/book.config.ts, so the API routes run on demand, which needs an adapter. Add one to astro.config.mjs (for example @astrojs/node), or remove site.runtime to build a static site.',
					);
				}
				// Pages keep only the links and HTML the exports keep (see markdown/safe-html.ts).
				const processor = config.markdown?.processor;
				if (processor && !addSafeHtml(processor)) {
					logger.warn(
						`markdown.processor "${processor.name}" in astro.config.mjs is not one Bookkit can add its HTML check to, so scripts, event handlers, and links to javascript:, vbscript:, and data: addresses in the book's content reach its pages. Remove markdown.processor to use Astro's default.`,
					);
				}
				apiRoutesOnDemand = command === "dev" || serverRuntime;
				apiRouteDir = `${relative(
					fileURLToPath(config.root),
					fileURLToPath(new URL("pages/api/", config.srcDir)),
				).replaceAll("\\", "/")}/`;
				updateConfig({
					vite: {
						plugins: [optionalDependencies(), onnxRuntimeWasmOnly()],
						// Read by the reader UI: without request handlers the Ask
						// island and the in-browser models it loads are compiled out.
						define: {
							"import.meta.env.BOOKKIT_SERVER_RUNTIME":
								JSON.stringify(serverRuntime),
							// Where the PDF and EPUB exports read images and fonts from,
							// and where the API routes keep what readers send
							// (`<root>/.bookkit/`, see utils/book-data.ts).
							"import.meta.env.BOOKKIT_ROOT": JSON.stringify(
								fileURLToPath(config.root),
							),
							"import.meta.env.BOOKKIT_PUBLIC_DIR": JSON.stringify(
								fileURLToPath(config.publicDir),
							),
						},
						ssr: {
							noExternal: ["@bookkit/astro-bookkit"],
						},
						build: {
							rollupOptions: {
								// A dependency's "use client" (web-haptics) matters to React
								// server bundlers, not to a browser bundle. Matched by code:
								// Rollup and Rolldown word the message differently.
								onwarn<W extends { code?: string }>(
									warning: W,
									warn: (warning: W) => void,
								) {
									if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
									warn(warning);
								},
							},
						},
					},
				});
			},
			"astro:route:setup": ({ route }) => {
				if (apiRoutesOnDemand && route.component.startsWith(apiRouteDir)) {
					route.prerender = false;
				}
			},
			"astro:build:done": async ({ dir, logger }) => {
				const icons = await writeBookIcons(fileURLToPath(dir));
				if (icons.skipped) logger.warn(`No site icons: ${icons.skipped}`);
				else if (icons.written > 0) logger.info(`${icons.written} site icons`);
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
