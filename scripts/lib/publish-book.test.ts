import { describe, expect, it } from "bun:test";
import { publishedRecord, withBookStatus } from "./publish-book";

/**
 * The edits `bookkit publish` makes to a book's config and its records. The
 * command itself is in commands/publish.test.ts.
 */

describe("publish's edits", () => {
	it("sets only the book's own status, and refuses a config with none", () => {
		expect(
			withBookStatus(
				'export const bookConfig = {\n\tstatus: "draft",\n\tnested: {\n\t\tstatus: "draft",\n\t},\n};\n',
				"published",
			),
		).toBe(
			'export const bookConfig = {\n\tstatus: "published",\n\tnested: {\n\t\tstatus: "draft",\n\t},\n};\n',
		);
		expect(withBookStatus("export const bookConfig = {};\n", "published")).toBe(
			null,
		);
	});

	it("marks a record without a status published too", () => {
		expect(publishedRecord("---\ntitle: A\n---\n\nText.\n")).toBe(
			"---\ntitle: A\nstatus: published\n---\n\nText.\n",
		);
		expect(publishedRecord('---\nstatus: "draft"\n---\n')).toBe(
			'---\nstatus: "published"\n---\n',
		);
	});
});
