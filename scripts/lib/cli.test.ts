import { describe, expect, it } from "bun:test";

import { readScriptArgs } from "./cli";

describe("readScriptArgs", () => {
	const spec = { book: "string", title: "string", yes: "boolean" } as const;
	const read = (...argv: string[]) => readScriptArgs(spec, ["book"], argv);

	it("reads flags with values, in either form", () => {
		expect(read("--book", "on-call", "--yes")).toEqual({
			values: { book: "on-call", yes: true },
		});
		expect(read("--book=on-call")).toEqual({ values: { book: "on-call" } });
	});

	it("asks for help instead of running", () => {
		expect(read("--help")).toEqual({ help: true });
		expect(read("-h")).toEqual({ help: true });
	});

	it("names what is wrong", () => {
		expect(read()).toEqual({ error: "Missing --book <book>." });
		expect(read("--book")).toEqual({ error: "--book needs a value." });
		expect(read("--book", "--yes")).toEqual({ error: "--book needs a value." });
		expect(read("--book", "")).toEqual({ error: "--book needs a value." });
		expect(read("--book", "x", "--yes=no")).toEqual({
			error: "--yes takes no value.",
		});
		expect(read("--book", "x", "--titel", "y")).toEqual({
			error: "Unknown option --titel. Did you mean --title?",
		});
		expect(read("on-call")).toEqual({
			error:
				'Unexpected argument "on-call". A value goes right after its flag: --name value.',
		});
	});
});
