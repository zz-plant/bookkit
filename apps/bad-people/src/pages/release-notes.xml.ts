import type { APIRoute } from "astro";
import { escapeXml, getReleaseNotes } from "../lib/release-notes";

const siteUrl = import.meta.env.SITE_URL || "http://localhost:4321";

export const GET: APIRoute = () => {
  const releases = getReleaseNotes();
  const items = releases
    .map((release) => {
      const link = `${siteUrl}/release-notes#release-${release.version}`;
      return `\n    <item>\n      <title>${escapeXml(release.title)} (v${escapeXml(
        release.version
      )})</title>\n      <link>${escapeXml(link)}</link>\n      <guid>${escapeXml(link)}</guid>\n      <pubDate>${new Date(release.date).toUTCString()}</pubDate>\n      <description>${escapeXml(release.summary)}</description>\n    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bad People Release Notes</title>
    <link>${escapeXml(`${siteUrl}/release-notes`)}</link>
    <description>Release notes and updates for the Bad People book.</description>
    <language>en-us</language>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
};
