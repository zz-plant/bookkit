import { createBookExportGetHandler } from "@bookkit/astro-bookkit";

import { getBookExportBundle } from "../../lib/exports";

export const GET = createBookExportGetHandler({
  getBookExportBundle,
  format: "epub",
  filename: "running-hot.epub",
});
