import { afterEach, describe, expect, it } from "bun:test";
import {
	askCommand,
	commandFor,
	commandsFrom,
	inTurn,
	plainOutput,
} from "./model-command";

/**
 * The runner behind `bookkit judge` and `bookkit draft`. commandLabel and
 * splitCommands are in scripts/corpus-judgments.test.ts, with the votes that
 * record them.
 */

describe("commandsFrom and commandFor", () => {
	const ENV = "BOOKKIT_TEST_MODEL_COMMAND";
	afterEach(() => {
		delete process.env[ENV];
	});

	it("takes every use of the flag, else the variable's lines", () => {
		process.env[ENV] = "first model\nsecond model\n";
		expect(commandsFrom(["--judges", "3"], "--writer", ENV)).toEqual([
			"first model",
			"second model",
		]);
		expect(
			commandsFrom(
				["--writer", "a", "--judge", "b", "--writer", "c"],
				"--writer",
				ENV,
			),
		).toEqual(["a", "c"]);
		delete process.env[ENV];
		expect(commandsFrom(["--writer"], "--writer", ENV)).toEqual([]);
	});

	it("gives the nth run the nth command, in turn", () => {
		expect([1, 2, 3, 4].map((n) => commandFor(["a", "b", "c"], n))).toEqual([
			"a",
			"b",
			"c",
			"a",
		]);
	});
});

describe("plainOutput", () => {
	it("removes what a terminal would have drawn and keeps the text", () => {
		expect(
			plainOutput(
				"\u001b[?2026h\u001b[?25l\u001b[1G⠙ \u001b[K\u001b[?25h\u001b[?2026lError: pull model manifest: file does not exist\n",
			),
		).toBe("Error: pull model manifest: file does not exist\n");
		expect(plainOutput("\u001b[1mbold\u001b[0m and plain\r\n")).toBe(
			"bold and plain\r\n",
		);
	});
});

describe("askCommand", () => {
	it("gives the command its prompt on stdin and as a file, in a folder with nothing else", async () => {
		const asked = await askCommand(
			'cat; echo; cat "$PROMPT_FILE"; echo; ls',
			"the prompt",
			"PROMPT_FILE",
		);
		expect(asked.error).toBeUndefined();
		expect(asked.reply).toBe("the prompt\nthe prompt\nprompt.md\n");
	});

	it("says how a command failed, in one short line", async () => {
		const failed = await askCommand(
			`printf '%s\\n' first; printf '\\033[1G%s' ${"x".repeat(400)} >&2; exit 4`,
			"",
			"PROMPT_FILE",
		);
		expect(failed.error).toBe(`the command exited with 4: ${"x".repeat(200)}…`);
		expect(failed.reply).toBe("first\n");
		expect(failed.output).toBe(`first\n${"x".repeat(400)}`);
	});

	it("stops a command at its time limit and says so", async () => {
		const slow = await askCommand("sleep 20", "", "PROMPT_FILE", 1000);
		expect(slow.error).toBe("it had not finished after 1 s and was stopped");
		expect(slow.seconds).toBeLessThan(10);
	});
});

describe("inTurn", () => {
	it("runs no more than the limit at once, and gives results in the tasks' order", async () => {
		let running = 0;
		let most = 0;
		const task = (value: number, ms: number) => async () => {
			running += 1;
			most = Math.max(most, running);
			await Bun.sleep(ms);
			running -= 1;
			return value;
		};
		const tasks = [task(1, 30), task(2, 5), task(3, 20), task(4, 5)];
		expect(await inTurn(tasks, 2)).toEqual([1, 2, 3, 4]);
		expect(most).toBe(2);
		most = 0;
		expect(await inTurn(tasks, 1)).toEqual([1, 2, 3, 4]);
		expect(most).toBe(1);
		expect(await inTurn([], 3)).toEqual([]);
	});
});
