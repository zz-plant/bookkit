import { createExportResponse } from "@bookkit/astro-bookkit/exports";
import { chapterExportSlugs, getChapterExportBundle } from "../../../lib/exports";

export const getStaticPaths = () =>
  chapterExportSlugs.map((slug) => ({
    params: { slug },
  }));

export async function GET({ params }: { params: { slug?: string } }) {
  const slug = params.slug ?? "";
  const bundle = getChapterExportBundle(slug);
  if (!bundle) {
    return new Response("Not found", { status: 404 });
  }
  return createExportResponse(bundle, "pdf", `bad-people-${slug}.pdf`);
}
