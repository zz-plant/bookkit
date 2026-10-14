import { describe, expect, it } from "bun:test";
import { parseCreateArgs } from "./args";

describe("parseCreateArgs", () => {
	it("reads a folder and its options", () => {
		expect(
			parseCreateArgs(["../garden", "--book", "garden", "--title", "Garden"]),
		).toEqual({
			values: {
				target: "../garden",
				book: "garden",
				title: "Garden",
				dir: undefined,
				force: false,
				upgrade: false,
			},
		});
		expect(parseCreateArgs(["--upgrade", "../garden"])).toMatchObject({
			values: { target: "../garden", upgrade: true },
		});
	});

	it("asks for help instead of scaffolding a folder named --help", () => {
		expect(parseCreateArgs(["--help"])).toEqual({ help: true });
		expect(parseCreateArgs(["-h"])).toEqual({ help: true });
	});

	it("never takes a flag for the folder", () => {
		expect(parseCreateArgs(["--book", "foo"])).toEqual({
			error: "Missing the project folder.",
		});
		expect(parseCreateArgs([])).toEqual({
			error: "Missing the project folder.",
		});
	});

	it("names what is wrong", () => {
		expect(parseCreateArgs(["../a", "--titel", "x"])).toEqual({
			error: "Unknown option --titel. Did you mean --title?",
		});
		expect(parseCreateArgs(["../a", "--book"])).toEqual({
			error: "--book needs a value.",
		});
		expect(parseCreateArgs(["../a", "My", "Book"])).toMatchObject({
			error: expect.stringContaining("Expected one project folder, got 3"),
		});
		expect(parseCreateArgs(["../a", "--book", "My Book"])).toMatchObject({
			error: expect.stringContaining("--book my-book"),
		});
		expect(
			parseCreateArgs(["../a", "--upgrade", "--force", "--book", "a"]),
		).toEqual({
			error:
				"--upgrade replaces the engine's files only, so it takes no --book, --force.",
		});
	});
});
