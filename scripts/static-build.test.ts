import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * A static build of a book (no `site.runtime`), as `bookkit deploy` publishes
 * it: it prints no warnings about its own routes or bundles, writes only the
 * MCP discovery manifest under /api/, ships valid JSON everywhere, and leaves
 * out the reader features that need a request handler on every page.
 */

const BOOK = "on-call";

let outDir: string;
let log: string;
let exitCode: number | null;

const filesUnder = (dir: string): string[] =>
	readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));

const pages = () => filesUnder(outDir).filter((file) => file.endsWith(".html"));

beforeAll(() => {
	outDir = mkdtempSync(join(tmpdir(), "bookkit-static-build-"));
	const result = Bun.spawnSync(
		[process.execPath, "run", "build", "--outDir", outDir],
		{
			cwd: join(repoRoot(), "apps", BOOK),
			env: { ...process.env, NO_COLOR: "1" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	exitCode = result.exitCode;
	log = `${result.stdout.toString()}${result.stderr.toString()}`;
}, 180_000);

afterAll(() => {
	rmSync(outDir, { recursive: true, force: true });
});

describe(`static build of ${BOOK}`, () => {
	it("succeeds", () => {
		expect(exitCode, log).toBe(0);
	});

	it("prints none of the warnings its routes and bundles used to cause", () => {
		for (const warning of [
			"No API Route handler exists",
			"requests are not available in static endpoints",
			"[EVAL]",
			"has been externalized for browser compatibility",
			"Some chunks are larger than",
		]) {
			expect(log).not.toContain(warning);
		}
	});

	it("writes only the MCP discovery manifest under /api/, saying tool calls are not served there", () => {
		expect(readdirSync(join(outDir, "api"))).toEqual(["mcp.json"]);
		const manifest = JSON.parse(
			readFileSync(join(outDir, "api", "mcp.json"), "utf8"),
		);
		expect(manifest.toolCalls.served).toBe(false);
		expect(manifest.toolCalls.note).toContain("bun run mcp");
	});

	it("ships every .json file as JSON", () => {
		const jsonFiles = filesUnder(outDir).filter((file) =>
			file.endsWith(".json"),
		);
		expect(jsonFiles.length).toBeGreaterThan(0);
		for (const file of jsonFiles) {
			expect(() => JSON.parse(readFileSync(file, "utf8")), file).not.toThrow();
		}
	});

	it("leaves the Ask panel and analytics beacons off every page", () => {
		const offenders = pages().filter((file) => {
			const html = readFileSync(file, "utf8");
			const body = html.match(/<body[^>]*>/)?.[0] ?? "";
			return (
				html.includes("data-qa-panel") ||
				body.includes('data-qa-enabled="true"') ||
				/data-(export-|preview-)?analytics-endpoint="[^"]+"/.test(body)
			);
		});
		// Release notes, the version archive, and the author tools page render
		// the layout themselves; they used to ship both.
		expect(pages().map((file) => file.slice(outDir.length))).toContain(
			"/read/tools/index.html",
		);
		expect(offenders.map((file) => file.slice(outDir.length))).toEqual([]);
	});

	it("does not bundle the in-browser models the Ask panel loads", () => {
		const bundles = filesUnder(join(outDir, "_astro")).filter((file) =>
			file.endsWith(".js"),
		);
		for (const bundle of bundles) {
			const source = readFileSync(bundle, "utf8");
			expect(source.includes("onnxruntime"), bundle).toBe(false);
			expect(source.includes("@mlc-ai/web-llm"), bundle).toBe(false);
		}
	});
});
