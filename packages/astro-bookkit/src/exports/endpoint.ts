import { recordExportEvent, type ExportAnalyticsEvent } from "./analytics";

export type ExportAnalyticsEndpointOptions = {
  onRecord?: (event: ExportAnalyticsEvent) => Promise<void> | void;
};

const MAX_TEXT_LENGTH = 240;
const MAX_SLUG_LENGTH = 200;
const MAX_PATH_LENGTH = 240;
const MAX_HREF_LENGTH = 320;
const MAX_METADATA_VALUE_LENGTH = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeScope = (value: unknown): "book" | "chapter" | null => {
  if (value === "book" || value === "chapter") return value;
  return null;
};

const normalizeMetadata = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, raw]) => {
      const cleanedKey = cleanText(key, 80);
      const cleanedValue = cleanText(raw, MAX_METADATA_VALUE_LENGTH);
      if (!cleanedKey || !cleanedValue) return null;
      return [cleanedKey, cleanedValue] as const;
    })
        .filter((entry): entry is readonly [string, string] => entry !== null);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const normalizeEvent = (payload: Record<string, unknown>, request: Request): ExportAnalyticsEvent | null => {
  if (payload.type !== "download") return null;
  const format = cleanText(payload.format, 16);
  const scope = normalizeScope(payload.scope);
  const slug = cleanText(payload.slug, MAX_SLUG_LENGTH);
  const href = cleanText(payload.href, MAX_HREF_LENGTH);
  const path = cleanText(payload.path, MAX_PATH_LENGTH);
  return {
    type: "download",
    format,
    scope,
    slug,
    href,
    path,
    referrer: cleanText(request.headers.get("referer"), MAX_HREF_LENGTH),
    userAgent: cleanText(request.headers.get("user-agent"), MAX_TEXT_LENGTH),
    metadata: normalizeMetadata(payload.metadata),
  };
};

export const createExportAnalyticsEndpoint = (options: ExportAnalyticsEndpointOptions = {}) => {
  const onRecord = options.onRecord ?? recordExportEvent;

  return {
    POST: async ({ request }: { request: Request }) => {
      let payload: unknown = null;
      try {
        payload = await request.json();
      } catch (error) {
        payload = null;
      }

      if (!isRecord(payload)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid payload." }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      const event = normalizeEvent(payload, request);
      if (!event) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid export event." }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      try {
        await onRecord(event);
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: "Unable to store export event." }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },
  };
};
