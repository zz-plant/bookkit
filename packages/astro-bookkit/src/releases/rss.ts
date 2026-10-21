import { escapeHtml } from "../utils/character-references";
import type { ReleaseNote } from "./notes";

type ReleaseNotesRssOptions = {
	siteUrl: string;
	bookTitle: string;
	releases: ReleaseNote[];
	releaseNotesPath?: string;
	description?: string;
	language?: string;
};

export const createReleaseNotesRss = ({
	siteUrl,
	bookTitle,
	releases,
	releaseNotesPath = "/release-notes",
	description = `Release notes and updates for the ${bookTitle} book.`,
	language = "en-us",
}: ReleaseNotesRssOptions): string => {
	const trimmedSiteUrl = siteUrl.replace(/\/$/, "");
	const items = releases
		.map((release) => {
			const link = `${trimmedSiteUrl}${releaseNotesPath}#release-${release.version}`;
			return `\n    <item>\n      <title>${escapeHtml(release.title)} (v${escapeHtml(
				release.version,
			)})</title>\n      <link>${escapeHtml(link)}</link>\n      <guid>${escapeHtml(link)}</guid>\n      <pubDate>${new Date(release.date).toUTCString()}</pubDate>\n      <description>${escapeHtml(release.summary)}</description>\n    </item>`;
		})
		.join("");

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(bookTitle)} Release Notes</title>
    <link>${escapeHtml(`${trimmedSiteUrl}${releaseNotesPath}`)}</link>
    <description>${escapeHtml(description)}</description>
    <language>${escapeHtml(language)}</language>${items}
  </channel>
</rss>`;
};

export const createReleaseNotesRssResponse = (
	options: ReleaseNotesRssOptions,
): Response => {
	const xml = createReleaseNotesRss(options);
	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
		},
	});
};

export type { ReleaseNotesRssOptions };
