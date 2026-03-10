import { createBookExportGetHandler } from "@bookkit/astro-bookkit";

import { getBookExportBundle } from "../../lib/exports";

export const GET = createBookExportGetHandler({
  getBookExportBundle,
  format: "pdf",
  filename: "running-hot.pdf",
});
