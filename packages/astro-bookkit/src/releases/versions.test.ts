import { describe, expect, it } from "bun:test";

import { versionHref } from "./versions";

const latest = { version: "0.2.0", isLatest: true };
const older = { version: "0.1.0", isLatest: false };

describe("version links", () => {
	it("keeps the reader on the same page for the latest version", () => {
		expect(versionHref("/read/chapters/a", latest)).toBe("/read/chapters/a");
		expect(versionHref("/v/0.1.0/read/chapters/a", latest)).toBe(
			"/read/chapters/a",
		);
	});

	it("links an older version to what changed in it, never to /v/<version>/", () => {
		// The book keeps one copy of its content: /v/0.1.0/ would show today's pages.
		for (const path of ["/", "/read/chapters/a", "/v/0.2.0/read"]) {
			expect(versionHref(path, older)).toBe("/release-notes#release-0.1.0");
		}
	});
});
