import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { copyBooks } from "./lib/book-workspace.fixture";
import { BUILD_DEADLINE_MS, runChild } from "./lib/child-process.fixture";

/**
 * A build of a book with `site.runtime: "server"`, whose pages carry the Ask
 * panel and the in-browser models it loads. It prints no warnings, keeps
 * every script under Vite's 500 kB limit, and serves ONNX Runtime's
 * WebAssembly from the book's own site under hashed names.
 *
 * The book is a copy of on-call in a scratch workspace, with an adapter that
 * serves nothing (as `browser.fixture.ts` builds it): only the build's
 * output is read.
 */

const BOOK = "on-call";
/** Vite's `build.chunkSizeWarningLimit`, in kB of 1000 bytes. */
const CHUNK_LIMIT_BYTES = 500 * 1000;

const STAND_IN_ADAPTER = `{
	name: "bookkit-server-build-test",
	hooks: {
		"astro:config:done": ({ setAdapter }) =>
			setAdapter({
				name: "bookkit-server-build-test",
				entrypointResolution: "auto",
				serverEntrypoint: new URL("./server-entry.mjs", import.meta.url),
				supportedAstroFeatures: {
					serverOutput: "stable",
					staticOutput: "stable",
					hybridOutput: "stable",
					sharpImageService: "stable",
				},
			}),
	},
}`;

let workspace: string;
let assetsDir: string;
let log: string;
let exitCode: number | null;

const edit = (file: string, from: string, to: string) => {
	const text = readFileSync(file, "utf8");
	if (!text.includes(from)) throw new Error(`${file} has no "${from}".`);
	writeFileSync(file, text.replace(from, to));
};

const assets = () =>
	readdirSync(assetsDir).map((name) => join(assetsDir, name));

beforeAll(() => {
	const copy = copyBooks(`server-build-${BOOK}-`, [BOOK]);
	workspace = copy.workspace;
	const appDir = copy.appDir(BOOK);
	edit(
		join(appDir, "src", "book.config.ts"),
		"site: {",
		'site: {\n\t\truntime: "server",',
	);
	// Link-preview images take seconds and are not what this test is about.
	edit(
		join(appDir, "astro.config.mjs"),
		"integrations: [mdx(), bookkit({",
		`adapter: ${STAND_IN_ADAPTER},\n\tintegrations: [mdx(), bookkit({ ogImages: false,`,
	);
	writeFileSync(
		join(appDir, "server-entry.mjs"),
		'export default { fetch: () => new Response("Not served.", { status: 501 }) };\n',
	);
	const result = runChild([process.execPath, "run", "build"], {
		cwd: appDir,
		env: { ...process.env, NO_COLOR: "1" },
		deadlineMs: BUILD_DEADLINE_MS,
	});
	exitCode = result.status;
	log = result.output;
	assetsDir = join(appDir, "dist", "client", "_astro");
}, 180_000);

afterAll(() => {
	if (workspace) rmSync(workspace, { recursive: true, force: true });
});

describe(`server-runtime build of ${BOOK}`, () => {
	it("succeeds and prints no warnings", () => {
		expect(exitCode, log).toBe(0);
		expect(log.split("\n").filter((line) => line.includes("[WARN]"))).toEqual(
			[],
		);
	});

	it("keeps every script under Vite's chunk size limit", () => {
		const large = assets()
			.filter((file) => file.endsWith(".js"))
			.filter((file) => statSync(file).size > CHUNK_LIMIT_BYTES)
			.map((file) => `${basename(file)}: ${statSync(file).size} bytes`);
		expect(large).toEqual([]);
	});

	it("serves ONNX Runtime's WebAssembly from the book's site, under hashed names", () => {
		const wasm = assets()
			.map((file) => basename(file))
			.filter((name) => name.endsWith(".wasm"))
			.sort();
		expect(wasm).toHaveLength(2);
		expect(wasm[0]).toMatch(/^ort-wasm-simd\.[\w-]+\.wasm$/);
		expect(wasm[1]).toMatch(/^ort-wasm\.[\w-]+\.wasm$/);
		// The models' code names each file at its address on this site.
		const scripts = assets()
			.filter((file) => file.endsWith(".js"))
			.map((file) => readFileSync(file, "utf8"))
			.join("\n");
		for (const name of wasm) expect(scripts).toContain(`/_astro/${name}`);
	});
});
