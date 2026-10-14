import { describe, expect, it } from "bun:test";

import { failedWorkspaces } from "./workspace-output";

// `bun run build:all` with an error in bad-people's overview chapter: its
// error is buried under the books that kept building (trimmed from a real run).
const BUILD_ALL = `$ bun run --workspaces build
@books/bad-people build: 13:18:02 [ERROR] [build] Caught error rendering /read/chapters/overview: ReferenceError: undefinedVariable is not defined
@books/crumple-zone build: 13:18:02   ├─ /sitemap.xml (+5ms)
@books/running-hot build: 13:18:02   ├─ /read/toolkit/index.html (+2ms)
@books/bad-people build:   Hint:
@books/bad-people build:     This issue often occurs when your MDX component encounters runtime errors.
@books/crumple-zone build: 13:18:02 [build] ✓ Completed in 3.79s.
@books/bad-people build: Exited with code 1
@books/running-hot build: 13:18:02 [build] Complete!
@books/running-hot build: Exited with code 0
@books/on-call build: 13:18:03 [build] 38 page(s) built in 4.81s
@books/on-call build: Exited with code 0
@books/crumple-zone build: 13:18:03 [build] Complete!
@books/crumple-zone build: Exited with code 0
error: script "build:all" exited with code 1`;

describe("failedWorkspaces", () => {
	it("names the book whose build failed, with only its own lines", () => {
		expect(failedWorkspaces(BUILD_ALL)).toEqual([
			{
				name: "bad-people",
				lines: [
					"13:18:02 [ERROR] [build] Caught error rendering /read/chapters/overview: ReferenceError: undefinedVariable is not defined",
					"  Hint:",
					"    This issue often occurs when your MDX component encounters runtime errors.",
					"Exited with code 1",
				],
			},
		]);
	});

	it("counts a book killed by a signal, and finds nothing in output from one command", () => {
		expect(
			failedWorkspaces(
				"@books/on-call build: Exited with signal SIGKILL\n@books/a build: Exited with code 0",
			).map((failed) => failed.name),
		).toEqual(["on-call"]);
		expect(failedWorkspaces("error: tests failed\n2 fail")).toEqual([]);
	});
});
