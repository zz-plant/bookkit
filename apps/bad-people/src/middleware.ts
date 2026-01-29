import { createPreviewAccessMiddleware } from "@bookkit/astro-bookkit/preview";
import bookConfig from "./book.config";

export const onRequest = createPreviewAccessMiddleware({
  ...bookConfig.previewAccess,
  siteTitle: bookConfig.title,
});
