import { createExportResponse } from "@bookkit/astro-bookkit/exports";
import { getChapterExportBundle } from "../../../lib/exports";

export async function GET({ params }: { params: { slug?: string } }) {
  const slug = params.slug ?? "";
  const bundle = getChapterExportBundle(slug);
  if (!bundle) {
    return new Response("Not found", { status: 404 });
  }
  return createExportResponse(bundle, "epub", `bad-people-${slug}.epub`);
}
