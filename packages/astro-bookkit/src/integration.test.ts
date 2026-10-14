import { describe, expect, it } from "bun:test";

import { type BookkitIntegrationOptions, bookkit } from "./integration";

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
