import { createExportResponse } from "@bookkit/astro-bookkit/exports";
import { getBookExportBundle } from "../../lib/exports";

export async function GET() {
  const bundle = getBookExportBundle();
  return createExportResponse(bundle, "epub", "bad-people.epub");
}
