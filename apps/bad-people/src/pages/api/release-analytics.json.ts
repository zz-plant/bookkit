import type { APIRoute } from "astro";
import { recordReleaseEvent } from "@bookkit/astro-bookkit";

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    if (payload?.event === "rss_subscribe_click") {
      await recordReleaseEvent({ event: "rss_subscribe_click" });
    }
  } catch (error) {
    console.warn("Release analytics parse error", error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
