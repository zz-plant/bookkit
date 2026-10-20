import { describe, expect, it } from "bun:test";
import { runChild, runChildAsync } from "./child-process.fixture";

describe.each([
	["runChild", runChild],
	["runChildAsync", runChildAsync],
] as const)("%s", (_, run) => {
	it("returns the child's status and output", async () => {
		const result = await run(["sh", "-c", "echo out; echo err >&2; exit 3"]);
		expect(result).toEqual({
			status: 3,
			stdout: "out\n",
			stderr: "err\n",
			output: "out\nerr\n",
		});
	});

	it("passes stdin, and gives none otherwise", async () => {
		expect((await run(["cat"], { stdin: "typed" })).stdout).toBe("typed");
		expect((await run(["cat"])).stdout).toBe("");
	});

	it("kills a child that outlives its deadline, names it, and keeps what it printed", async () => {
		const started = Date.now();
		let error: unknown;
		try {
			await run(["sh", "-c", "echo started; exec sleep 30"], {
				deadlineMs: 500,
			});
		} catch (thrown) {
			error = thrown;
		}
		expect(String(error)).toContain(
			"sh -c echo started; exec sleep 30 was still running after 0.5 s and was killed.\nstarted\n",
		);
		expect(Date.now() - started).toBeLessThan(10_000);
	});
});
