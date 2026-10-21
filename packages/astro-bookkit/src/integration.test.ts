import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
	BOOK_MODULE_ID,
	type BookkitIntegrationOptions,
	bookkit,
	bookModule,
	ONNX_RUNTIME_WASM_BUILD,
	onnxRuntimeWasmOnly,
	optionalDependencies,
	routePatternOf,
} from "./integration";
import { safeHtmlMdastPlugins } from "./markdown/safe-html";

type Command = "dev" | "build";

type InjectedRoute = { pattern: string; entrypoint: URL; prerender?: boolean };

/**
 * Runs config setup for a book at `root`, then route setup for each route;
 * returns their prerender, the routes injected, and the middleware added.
 */
const setUp = (
	options: BookkitIntegrationOptions,
	command: Command,
	components: string[],
	adapter?: object,
	root = new URL("file:///book/"),
) => {
	const hooks = bookkit(options).hooks as Record<
		string,
		(params: Record<string, unknown>) => void
	>;
	const updates: Array<Record<string, unknown>> = [];
	const injected: InjectedRoute[] = [];
	const middleware: Array<{ entrypoint: URL; order: string }> = [];
	hooks["astro:config:setup"]({
		command,
		config: {
			root,
			srcDir: new URL("src/", root),
			publicDir: new URL("static/", root),
			adapter,
		},
		injectRoute: (route: InjectedRoute) => injected.push(route),
		addMiddleware: (entry: { entrypoint: URL; order: string }) =>
			middleware.push(entry),
		updateConfig: (update: Record<string, unknown>) => updates.push(update),
	});
	const prerender = components.map((component) => {
		const route: { component: string; prerender?: boolean } = { component };
		hooks["astro:route:setup"]({ route });
		return route.prerender;
	});
	return { prerender, updates, injected, middleware };
};

const injectedPattern = (routes: InjectedRoute[], pattern: string) =>
	routes.find((route) => route.pattern === pattern);

const ROUTES = ["src/pages/api/mcp.json.ts", "src/pages/read/index.astro"];

describe("bookkit() integration", () => {
	it("runs API routes on demand in dev, so POST reaches them", () => {
		expect(setUp({}, "dev", ROUTES).prerender).toEqual([false, undefined]);
	});

	it("leaves a static build's routes to be prerendered", () => {
		expect(setUp({}, "build", ROUTES).prerender).toEqual([
			undefined,
			undefined,
		]);
	});

	it("runs API routes on demand in a server build that has an adapter", () => {
		const { prerender } = setUp({ runtime: "server" }, "build", ROUTES, {
			name: "adapter",
		});
		expect(prerender).toEqual([false, undefined]);
	});

	it("serves the engine's pages, API routes, and middleware to every book", () => {
		const { injected, middleware } = setUp({}, "build", []);
		for (const pattern of [
			"/",
			"/404",
			"/read/chapters",
			"/read/chapters/[slug]",
			"/read/examples/[...slug]",
			"/exports/chapters/[slug].pdf",
			"/sitemap.xml",
			"/api/mcp.json",
		]) {
			// The entrypoint is the engine's page file.
			expect(injectedPattern(injected, pattern)?.entrypoint.href).toContain(
				"/src/routes/pages/",
			);
		}
		expect(middleware).toHaveLength(1);
		expect(middleware[0].order).toBe("pre");
		expect(middleware[0].entrypoint.href).toEndWith(
			"/src/routes/middleware.ts",
		);
	});

	it("runs the engine's API routes on demand in dev and server builds only", () => {
		const prerenderOf = (...args: Parameters<typeof setUp>) =>
			injectedPattern(setUp(...args).injected, "/api/mcp.json")?.prerender;
		expect(prerenderOf({}, "dev", [])).toBe(false);
		expect(prerenderOf({}, "build", [])).toBeUndefined();
		expect(
			prerenderOf({ runtime: "server" }, "build", [], { name: "adapter" }),
		).toBe(false);
		expect(
			injectedPattern(setUp({}, "dev", []).injected, "/read")?.prerender,
		).toBeUndefined();
	});

	it("lets a page in the book's src/pages/ replace the engine's page at its URL", () => {
		const book = mkdtempSync(join(tmpdir(), "bookkit-integration-"));
		try {
			for (const page of [
				"read/examples/index.astro",
				"sitemap.xml.ts",
				"colophon.astro",
				"_draft/read.astro",
			]) {
				mkdirSync(join(book, "src", "pages", page, ".."), { recursive: true });
				writeFileSync(join(book, "src", "pages", page), "");
			}
			const { injected } = setUp(
				{},
				"build",
				[],
				undefined,
				pathToFileURL(`${book}/`),
			);
			expect(injectedPattern(injected, "/read/examples")).toBeUndefined();
			expect(injectedPattern(injected, "/sitemap.xml")).toBeUndefined();
			// Astro skips `_` names, so they replace nothing.
			expect(injectedPattern(injected, "/read")).toBeDefined();
			expect(
				injectedPattern(injected, "/read/examples/[...slug]"),
			).toBeDefined();
		} finally {
			rmSync(book, { recursive: true, force: true });
		}
	});

	it("refuses a server build without an adapter, naming the setting and the fix", () => {
		expect(() => setUp({ runtime: "server" }, "build", ROUTES)).toThrow(
			/site\.runtime is "server" in src\/book\.config\.ts.*Add one to astro\.config\.mjs/,
		);
	});

	it("tells the reader bundle whether request handlers exist", () => {
		const define = (options: BookkitIntegrationOptions) =>
			(
				setUp(options, "build", [], { name: "adapter" }).updates[0] as {
					vite: { define: Record<string, string> };
				}
			).vite.define["import.meta.env.BOOKKIT_SERVER_RUNTIME"];

		expect(define({})).toBe("false");
		expect(define({ runtime: "server" })).toBe("true");
	});

	it("tells the exports where the book's folder and public folder are", () => {
		const { define } = (
			setUp({}, "build", []).updates[0] as {
				vite: { define: Record<string, string> };
			}
		).vite;

		expect(define["import.meta.env.BOOKKIT_ROOT"]).toBe('"/book/"');
		expect(define["import.meta.env.BOOKKIT_PUBLIC_DIR"]).toBe(
			'"/book/static/"',
		);
	});

	it("adds the link and HTML rules to the book's Markdown processor, and says when it cannot", () => {
		const hooks = bookkit().hooks as Record<
			string,
			(params: Record<string, unknown>) => void
		>;
		const setUpWith = (processor: { name: string; options: object }) => {
			const warnings: string[] = [];
			hooks["astro:config:setup"]({
				command: "build",
				config: {
					root: new URL("file:///book/"),
					srcDir: new URL("file:///book/src/"),
					publicDir: new URL("file:///book/static/"),
					markdown: { processor },
				},
				logger: { warn: (message: string) => warnings.push(message) },
				injectRoute: () => {},
				addMiddleware: () => {},
				updateConfig: () => {},
			});
			return warnings;
		};

		// The shape satteri() from @astrojs/markdown-satteri returns.
		const processor = {
			name: "satteri",
			options: { mdastPlugins: [], hastPlugins: [], features: {} },
		};
		expect(setUpWith(processor)).toEqual([]);
		expect(processor.options.mdastPlugins).toEqual(safeHtmlMdastPlugins);
		expect(setUpWith({ name: "custom", options: {} })).toEqual([
			"markdown.processor \"custom\" in astro.config.mjs is not one Bookkit can add its HTML check to, so scripts, event handlers, and links to javascript:, vbscript:, and data: addresses in the book's content reach its pages. Remove markdown.processor to use Astro's default.",
		]);
	});

	it("drops a dependency's module-level directive warning, whichever bundler words it", () => {
		const { onwarn } = (
			setUp({}, "build", []).updates[0] as {
				vite: {
					build: {
						rollupOptions: {
							onwarn: (
								warning: { code: string; message: string },
								warn: (warning: unknown) => void,
							) => void;
						};
					};
				};
			}
		).vite.build.rollupOptions;
		const shown: unknown[] = [];
		const directive = {
			code: "MODULE_LEVEL_DIRECTIVE",
			message:
				'The semantics of the module level directive "use client" in "web-haptics/dist/index.mjs" may not be preserved when bundling.',
		};
		const other = { code: "EVAL", message: "Use of direct `eval`" };
		onwarn(directive, (warning) => shown.push(warning));
		onwarn(other, (warning) => shown.push(warning));

		expect(shown).toEqual([other]);
	});
});

describe("optionalDependencies", () => {
	const plugin = optionalDependencies();
	const context = (installed: boolean) => ({
		resolve: async (source: string) =>
			installed ? { id: `/node_modules/${source}/index.js` } : null,
	});

	it("leaves an installed optional dependency and other imports to Vite", async () => {
		expect(
			await plugin.resolveId.call(
				context(true),
				"@xenova/transformers",
				"/a.ts",
			),
		).toEqual({ id: "/node_modules/@xenova/transformers/index.js" });
		expect(
			await plugin.resolveId.call(context(false), "zod", "/a.ts"),
		).toBeNull();
		expect(
			await plugin.resolveId.call(
				context(false),
				"@xenova/transformers-extra",
				"/a.ts",
			),
		).toBeNull();
		expect(plugin.load("/a.ts")).toBeNull();
	});

	it("turns a missing one, or a file in it, into a module that throws a message naming it", async () => {
		for (const source of [
			"@xenova/transformers",
			"@xenova/transformers/dist/ort-wasm-simd.wasm?url",
		]) {
			const id = await plugin.resolveId.call(context(false), source, "/a.ts");
			expect(typeof id).toBe("string");
			const code = plugin.load(id as string);
			expect(code).toStartWith("throw new Error(");
			expect(code).toContain(
				'"@xenova/transformers is not installed, so the feature that needs it is off.',
			);
		}
	});
});

describe("onnxRuntimeWasmOnly", () => {
	const plugin = onnxRuntimeWasmOnly();
	const resolved: Array<[string, string | undefined]> = [];
	const context = {
		resolve: async (source: string, importer: string | undefined) => {
			resolved.push([source, importer]);
			return { id: `/node_modules/${source}` };
		},
	};

	it("bundles ONNX Runtime's WebAssembly-only build, found from the package that imports it", async () => {
		const importer = "/node_modules/@xenova/transformers/src/backends/onnx.js";
		expect(
			await plugin.resolveId.call(context, "onnxruntime-web", importer),
		).toEqual({ id: `/node_modules/${ONNX_RUNTIME_WASM_BUILD}` });
		expect(resolved).toEqual([[ONNX_RUNTIME_WASM_BUILD, importer]]);
	});

	it("leaves every other import to Vite", async () => {
		for (const source of [
			"onnxruntime-web/dist/ort.min.js",
			"onnxruntime-node",
			"zod",
		]) {
			expect(await plugin.resolveId.call(context, source, "/a.ts")).toBeNull();
		}
	});
});

describe("routePatternOf", () => {
	it("names a page's URL the way Astro names file routes", () => {
		expect(routePatternOf("index.astro")).toBe("/");
		expect(routePatternOf("404.astro")).toBe("/404");
		expect(routePatternOf("read/chapters/index.astro")).toBe("/read/chapters");
		expect(routePatternOf("read/chapters.astro")).toBe("/read/chapters");
		expect(routePatternOf("read/examples/[...slug].astro")).toBe(
			"/read/examples/[...slug]",
		);
		expect(routePatternOf("sitemap.xml.ts")).toBe("/sitemap.xml");
	});
});

describe("bookModule", () => {
	it("serves virtual:bookkit/book and nothing else", () => {
		const plugin = bookModule("src");
		const id = plugin.resolveId(BOOK_MODULE_ID);
		expect(typeof id).toBe("string");
		expect(plugin.resolveId("./book.config")).toBeNull();
		expect(plugin.load("/src/book.config.ts")).toBeNull();
		expect(plugin.load(id as string)).toContain(
			'import bookConfig from "/src/book.config";',
		);
	});

	it("globs the book's content from the root, keyed as book apps globbed it from src/lib/", () => {
		const code = bookModule("site/src").load(
			bookModule("site/src").resolveId(BOOK_MODULE_ID) as string,
		) as string;
		expect(code).toContain(
			'import.meta.glob("/site/src/content/book/examples/**/*.mdx", { eager: true })',
		);
		expect(code).toContain(
			'import.meta.glob("/site/src/content/book/chapters/*.mdx", { eager: true, query: "?raw", import: "default" })',
		);
		expect(code).toContain('key.replace("/site/src/", "../")');
	});
});
