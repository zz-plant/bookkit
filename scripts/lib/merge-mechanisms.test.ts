import { describe, expect, it } from "bun:test";
import { rebindCode, rebindContent } from "./merge-mechanisms";

/**
 * How a merge rewrites the dropped slug where it is a reference, and leaves
 * it where it is not. `bookkit merge` and `bookkit sync` themselves are in
 * commands/merge.test.ts.
 */

describe("rebinding a slug", () => {
	const rebind = { drop: "waiting-game", keep: "slow-walk" };

	it("leaves longer slugs and plain words in prose alone", () => {
		const text =
			'---\nslug: waiting-game--deadline\nmechanism: "waiting-game"\n---\n\nThe "waiting-game" and waiting-games, see /read/toolkit/waiting-game--deadline.\n';
		expect(rebindContent(text, rebind)).toBe(
			'---\nslug: waiting-game--deadline\nmechanism: "slow-walk"\n---\n\nThe "waiting-game" and waiting-games, see /read/toolkit/waiting-game--deadline.\n',
		);
	});

	it("does not rebind a chapter's own slug or its prerequisites", () => {
		const text =
			"---\nslug: waiting-game\nprerequisites:\n  - waiting-game\nmechanisms:\n  - waiting-game\n---\n";
		expect(rebindContent(text, rebind)).toBe(
			"---\nslug: waiting-game\nprerequisites:\n  - waiting-game\nmechanisms:\n  - slow-walk\n---\n",
		);
	});

	it("rebinds slug strings in code, and links built from a route", () => {
		// Source text that builds a link with a template literal.
		const route = (slug: string) =>
			`const href = \`\${readRoutes.mechanisms}/${slug}\`;\nconst slug = '${slug}';\n`;
		expect(rebindCode(route("waiting-game"), rebind)).toBe(route("slow-walk"));
	});
});
