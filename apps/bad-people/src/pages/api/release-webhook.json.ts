import type { APIRoute } from "astro";
import {
  parseReleaseWebhookTargets,
  sendReleaseWebhooks,
} from "@bookkit/astro-bookkit";
import { getReleaseNotes } from "../../lib/release-notes";
import bookConfig from "../../book.config";

const webhookTargets = parseReleaseWebhookTargets(import.meta.env.BOOKKIT_RELEASE_WEBHOOKS);

export const POST: APIRoute = async () => {
  if (!webhookTargets.length) {
    return new Response(JSON.stringify({ ok: false, error: "No webhook targets configured." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [latest] = getReleaseNotes();
  if (!latest) {
    return new Response(JSON.stringify({ ok: false, error: "No releases available." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = await sendReleaseWebhooks({
    release: latest,
    book: { slug: bookConfig.slug, title: bookConfig.title },
    targets: webhookTargets,
  });

  return new Response(JSON.stringify({ ok: true, delivered: results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
