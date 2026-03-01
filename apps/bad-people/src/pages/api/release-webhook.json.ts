import { createReleaseWebhookApiHandlers } from "@bookkit/astro-bookkit";
import bookConfig from "../../book.config";
import { releaseModules } from "../../lib/release-notes";

export const { POST } = createReleaseWebhookApiHandlers({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});
