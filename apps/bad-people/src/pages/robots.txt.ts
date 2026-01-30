import type { APIRoute } from "astro";
import { createBookRobotsTxt } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

export const GET: APIRoute = () => {
  const txt = createBookRobotsTxt({
    site: bookConfig.site,
  });

  return new Response(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
