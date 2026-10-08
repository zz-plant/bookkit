import { describe, expect, it } from "bun:test";

import { closest, didYouMean, editDistance } from "./cli";

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
