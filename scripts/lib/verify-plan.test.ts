import { describe, expect, it } from "bun:test";
import { planGates, REPRESENTATIVE_BOOK } from "./verify-plan";

const books = ["bad-people", "on-call", "running-hot"];
const ids = (changed: string[] | null) =>
	planGates(changed, books).map((gate) => gate.id);

describe("planGates", () => {
	it("checks a content edit against its own book only", () => {
		expect(
			ids(["apps/running-hot/src/content/book/chapters/12-put-a-clock.mdx"]),
		).toEqual([
			"validate:running-hot",
			"separation",
			"concepts",
			"build:running-hot",
		]);
	});

	it("adds the cross-book mechanism check when a mechanism changes", () => {
		expect(
			ids(["apps/bad-people/src/content/book/mechanisms/delay-as-force.mdx"]),
		).toContain("corpus");
		expect(ids(["corpus.json"])).toEqual(["biome", "corpus"]);
	});

	it("runs types, tests, shims, architecture, and one build for engine code", () => {
		expect(ids(["packages/astro-bookkit/src/seo/book.ts"])).toEqual([
			"biome",
			"types",
			"test",
			"shims",
			"architecture",
			`build:${REPRESENTATIVE_BOOK}`,
		]);
	});

	it("builds another book for engine code when the representative book is gone", () => {
		expect(
			planGates(["packages/astro-bookkit/src/seo/book.ts"], ["my-book"]).map(
				(gate) => gate.id,
			),
		).toContain("build:my-book");
	});

	it("leaves out what a standalone project has no inputs for", () => {
		const project = planGates(null, ["my-book"], () => true, "project").map(
			(gate) => gate.id,
		);
		expect(project).not.toContain("biome");
		expect(project).not.toContain("test");
		expect(project).not.toContain("architecture");
		expect(project).toEqual(
			expect.arrayContaining([
				"types",
				"shims",
				"validate:my-book",
				"build:all",
			]),
		);
	});

	it("skips the slow .astro pass for scripts-only changes", () => {
		const gates = planGates(["scripts/bookkit.ts"], books);
		expect(gates.map((gate) => gate.id)).toEqual(["biome", "types", "test"]);
		expect(gates[1]?.commands[0]).toContain("--no-astro");
	});

	it("leaves deleted files out of the formatter's arguments", () => {
		const gates = planGates(
			["scripts/gone.ts", "scripts/kept.ts"],
			books,
			(file) => file !== "scripts/gone.ts",
		);
		expect(gates[0]?.commands[0]).toEqual([
			"bunx",
			"biome",
			"ci",
			"--no-errors-on-unmatched",
			"scripts/kept.ts",
		]);
	});

	it("needs nothing for prose outside the checked docs", () => {
		expect(ids(["README.md", "docs/bets.md"])).toEqual([]);
		expect(ids(["docs/architecture.md"])).toEqual(["architecture"]);
		expect(ids(["apps/on-call/TODOS.md"])).toEqual(["todos"]);
	});

	it("plans every CI gate with --all", () => {
		expect(ids(null)).toEqual([
			"biome",
			"types",
			"test",
			"separation",
			"architecture",
			"todos",
			"shims",
			"validate:bad-people",
			"validate:on-call",
			"validate:running-hot",
			"corpus",
			"concepts",
			"build:all",
		]);
	});
});
