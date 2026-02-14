import { createReleaseWebhookEndpoint } from "@bookkit/astro-bookkit";
import { releaseModules } from "../../lib/release-notes";
import bookConfig from "../../book.config";

export const { POST } = createReleaseWebhookEndpoint({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});
