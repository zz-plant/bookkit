import { describe, expect, it } from "bun:test";

import { closest, didYouMean, editDistance, readScriptArgs } from "./cli";

const commands = [
	"status",
	"check",
	"contract",
	"new",
	"dev",
	"build",
	"deploy",
	"verify",
	"similar",
	"use",
];
const books = ["bad-people", "on-call", "running-hot", "crumple-zone"];

describe("closest", () => {
	it("catches typos, missing hyphens, and unique prefixes", () => {
		expect(closest("chek", commands)).toBe("check");
		expect(closest("verfy", commands)).toBe("verify");
		expect(closest("runninghot", books)).toBe("running-hot");
		expect(closest("running_hot", books)).toBe("running-hot");
		expect(closest("crum", books)).toBe("crumple-zone");
		expect(closest("Bad-People", books)).toBe("bad-people");
	});

	it("stays quiet when nothing is close", () => {
		expect(closest("publish", commands)).toBeUndefined();
		expect(closest("zzz", books)).toBeUndefined();
	});
});

describe("didYouMean", () => {
	it("phrases a suggestion, or nothing", () => {
		expect(didYouMean("oncall", books)).toBe(" Did you mean on-call?");
		expect(didYouMean("novel", books)).toBe("");
	});
});

describe("editDistance", () => {
	it("counts a transposition as one edit", () => {
		expect(editDistance("chcek", "check")).toBe(1);
		expect(editDistance("", "abc")).toBe(3);
	});
});

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
