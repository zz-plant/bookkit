import type { APIRoute } from "astro";
import { createReleaseNotesRssResponse } from "@bookkit/astro-bookkit";
import { getReleaseNotes } from "../lib/release-notes";
import bookConfig from "../book.config";

const siteUrl = import.meta.env.SITE_URL || "http://localhost:4321";

export const GET: APIRoute = () => {
  const releases = getReleaseNotes();
  return createReleaseNotesRssResponse({
    siteUrl,
    bookTitle: bookConfig.title,
    releases,
  });
};
