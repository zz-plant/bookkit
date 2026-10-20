import { describe, expect, it } from "bun:test";
import { runChild } from "./child-process.fixture";

describe("runChild", () => {
	it("returns the child's status and output", () => {
		const result = runChild(["sh", "-c", "echo out; echo err >&2; exit 3"]);
		expect(result).toEqual({
			status: 3,
			stdout: "out\n",
			stderr: "err\n",
			output: "out\nerr\n",
		});
	});

	it("passes stdin, and gives none otherwise", () => {
		expect(runChild(["cat"], { stdin: "typed" }).stdout).toBe("typed");
		expect(runChild(["cat"]).stdout).toBe("");
	});

	it("kills a child that outlives its deadline, and names it", () => {
		const started = Date.now();
		expect(() => runChild(["sleep", "30"], { deadlineMs: 200 })).toThrow(
			"sleep 30 was still running after 0.2 s and was killed.",
		);
		expect(Date.now() - started).toBeLessThan(10_000);
	});
});
