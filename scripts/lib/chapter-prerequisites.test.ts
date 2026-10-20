import { describe, expect, it } from "bun:test";
import { planEdges, withPrerequisites } from "./chapter-prerequisites";
import { parseFrontmatter } from "./content-frontmatter";

const edge = (chapter: string, introducedIn: string) => ({
	id: `edge:${introducedIn}->${chapter}`,
	chapter,
	introducedIn,
	mechanism: "queue-reset",
});

describe("planEdges", () => {
	it("keeps the edge that follows reading order when two would make a loop", () => {
		const plan = planEdges(
			[
				{ slug: "basics", prerequisites: [], file: "01-basics.mdx" },
				{ slug: "later", prerequisites: [], file: "02-later.mdx" },
			],
			[edge("basics", "later"), edge("later", "basics")],
		);
		expect([...plan.add]).toEqual([["later", ["basics"]]]);
		expect(plan.skipped.map(({ edge }) => edge.id)).toEqual([
			"edge:later->basics",
		]);
		expect(plan.skipped[0].why).toContain("would be a loop");
	});

	it("skips an edge a longer path already runs the other way", () => {
		const plan = planEdges(
			[
				{ slug: "a", prerequisites: [], order: 1 },
				{ slug: "b", prerequisites: ["a"], order: 2 },
				{ slug: "c", prerequisites: ["b"], order: 3 },
			],
			[edge("a", "c")],
		);
		expect(plan.add.size).toBe(0);
		expect(plan.skipped).toHaveLength(1);
	});
});

describe("withPrerequisites", () => {
	const chapter = (front: string) =>
		`---\nslug: later\ntitle: "Later"\n${front}---\n\nBody.\n`;

	it("adds the list before mechanisms:, as the books write it", () => {
		expect(
			withPrerequisites(chapter("mechanisms:\n  - queue-reset\n"), ["basics"]),
		).toBe(
			chapter("prerequisites:\n  - basics\nmechanisms:\n  - queue-reset\n"),
		);
	});

	it("extends a block list or a one-line list, once", () => {
		expect(
			withPrerequisites(chapter("prerequisites:\n  - intro\nstatus: draft\n"), [
				"basics",
				"intro",
			]),
		).toBe(chapter("prerequisites:\n  - intro\n  - basics\nstatus: draft\n"));
		const inline = withPrerequisites(chapter("prerequisites: [intro]\n"), [
			"basics",
		]);
		expect(parseFrontmatter(inline).data.prerequisites).toEqual([
			"intro",
			"basics",
		]);
	});
});
