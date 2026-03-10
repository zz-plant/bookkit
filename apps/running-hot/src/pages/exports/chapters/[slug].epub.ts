import { createChapterExportHandlers } from "@bookkit/astro-bookkit";

import { chapterExportSlugs, getChapterExportBundle } from "../../../lib/exports";

export const { GET, getStaticPaths } = createChapterExportHandlers({
  chapterExportSlugs,
  getChapterExportBundle,
  format: "epub",
  filenamePrefix: "running-hot",
});
