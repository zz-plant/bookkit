import { describe, expect, it } from "bun:test";

import {
	type BookkitIntegrationOptions,
	bookkit,
	optionalDependencies,
} from "./integration";
import { safeHtmlMdastPlugins } from "./markdown/safe-html";

type Command = "dev" | "build";

/** Runs config setup, then route setup for each route; returns their prerender. */
const setUp = (
	options: BookkitIntegrationOptions,
	command: Command,
	components: string[],
	adapter?: object,
) => {
	const hooks = bookkit(options).hooks as Record<
		string,
		(params: Record<string, unknown>) => void
	>;
	const updates: Array<Record<string, unknown>> = [];
	hooks["astro:config:setup"]({
		command,
		config: {
			root: new URL("file:///book/"),
			srcDir: new URL("file:///book/src/"),
			publicDir: new URL("file:///book/static/"),
			adapter,
		},
		updateConfig: (update: Record<string, unknown>) => updates.push(update),
	});
	const prerender = components.map((component) => {
		const route: { component: string; prerender?: boolean } = { component };
		hooks["astro:route:setup"]({ route });
		return route.prerender;
	});
	return { prerender, updates };
};

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
			await plugin.resolveId.call(context(true), "@mlc-ai/web-llm", "/a.ts"),
		).toEqual({ id: "/node_modules/@mlc-ai/web-llm/index.js" });
		expect(
			await plugin.resolveId.call(context(false), "zod", "/a.ts"),
		).toBeNull();
		expect(plugin.load("/a.ts")).toBeNull();
	});

	it("turns a missing one into a module that throws a message naming it", async () => {
		const id = await plugin.resolveId.call(
			context(false),
			"@xenova/transformers",
			"/a.ts",
		);
		expect(typeof id).toBe("string");
		const code = plugin.load(id as string);
		expect(code).toStartWith("throw new Error(");
		expect(code).toContain("@xenova/transformers is not installed");
	});
});
