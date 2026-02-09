import type { APIContext } from "astro";

export const ORIGINAL_URL_HEADER = "x-bookkit-original-url";

export const getOriginalUrl = (context: Pick<APIContext, "locals" | "request">): string | null => {
  const locals = context.locals as Record<string, unknown> | undefined;
  if (typeof locals?.originalUrl === "string") {
    return locals.originalUrl;
  }

  const headerUrl = context.request.headers.get(ORIGINAL_URL_HEADER);
  return headerUrl && headerUrl.length ? headerUrl : null;
};
