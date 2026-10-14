import { describe, expect, it } from "bun:test";

import { buildReleaseNotesPageProps, buildVersionArchivePageProps } from ".";

const book = (site: { runtime?: "static" | "server" }, aiQa?: boolean) => ({
	title: "On-Call Runbook",
	status: "draft",
	slug: "on-call",
	site: { url: "https://on-call.example", ...site },
	features: aiQa === undefined ? undefined : { aiQa },
});

const pages = (bookConfig: ReturnType<typeof book>) => [
	buildReleaseNotesPageProps({
		book: bookConfig,
		releases: [],
		versionEntries: [],
		requestUrl: "https://on-call.example/release-notes",
		ogImage: "/og/release-notes.png",
	}),
	buildVersionArchivePageProps({
		book: bookConfig,
		versionEntries: [],
		requestUrl: "https://on-call.example/versions",
		ogImage: "/og/versions.png",
	}),
];

// These pages render BookLayout themselves; without the runtime they used to
// fall back to its defaults and ship Ask and analytics beacons on static builds.
describe("page props for release notes and the version archive", () => {
	it("leave out request-handler features on a static build", () => {
		for (const props of pages(book({}))) {
			expect(props.hasServerRuntime).toBe(false);
			expect(props.aiQaEnabled).toBe(false);
		}
	});

	it("offer them when the book has a server runtime", () => {
		for (const props of pages(book({ runtime: "server" }))) {
			expect(props.hasServerRuntime).toBe(true);
			expect(props.aiQaEnabled).toBe(true);
		}
	});

	it("keep Ask off when the book turns it off", () => {
		for (const props of pages(book({ runtime: "server" }, false))) {
			expect(props.hasServerRuntime).toBe(true);
			expect(props.aiQaEnabled).toBe(false);
		}
	});
});
