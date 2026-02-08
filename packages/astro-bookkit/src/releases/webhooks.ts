import type { ReleaseNote } from "./notes";
import { recordReleaseEvent } from "./analytics";

export type ReleaseWebhookTarget = {
  url: string;
  name?: string;
  secret?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type ReleaseWebhookPayload = {
  event: "release_published";
  release: ReleaseNote;
  book?: {
    slug?: string;
    title?: string;
  };
  at: string;
};

export type ReleaseWebhookResult = {
  target: ReleaseWebhookTarget;
  status: "success" | "failure";
  statusCode?: number;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readStringField = (value: Record<string, unknown>, key: string): string | undefined => {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
};

const readHeadersField = (value: Record<string, unknown>): Record<string, string> | undefined => {
  const headers = value.headers;
  if (!isRecord(headers)) return undefined;
  const normalized = Object.entries(headers).flatMap(([headerKey, headerValue]) =>
    typeof headerValue === "string" ? [[headerKey, headerValue]] : []
  );
  return normalized.length ? Object.fromEntries(normalized) : undefined;
};

const normalizeTarget = (entry: unknown): ReleaseWebhookTarget | null => {
  if (typeof entry === "string") {
    return entry.trim() ? { url: entry.trim() } : null;
  }

  if (!isRecord(entry)) return null;

  const url = readStringField(entry, "url");
  if (!url) return null;

  return {
    url,
    name: readStringField(entry, "name"),
    secret: readStringField(entry, "secret"),
    headers: readHeadersField(entry),
    enabled: typeof entry.enabled === "boolean" ? entry.enabled : undefined,
  };
};

export const buildReleaseWebhookPayload = ({
  release,
  book,
  at = new Date().toISOString(),
}: {
  release: ReleaseNote;
  book?: ReleaseWebhookPayload["book"];
  at?: string;
}): ReleaseWebhookPayload => ({
  event: "release_published",
  release,
  book,
  at,
});

export const parseReleaseWebhookTargets = (raw?: string | null): ReleaseWebhookTarget[] => {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry) => {
        const target = normalizeTarget(entry);
        return target ? [target] : [];
      });
    }
  } catch (error) {
    // Fall through to CSV parsing.
  }
  return trimmed
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((url) => ({ url }));
};

const buildHeaders = (target: ReleaseWebhookTarget) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "astro-bookkit",
    ...target.headers,
  };
  if (target.secret) {
    headers["X-Bookkit-Webhook-Token"] = target.secret;
  }
  return headers;
};

export const sendReleaseWebhooks = async ({
  release,
  book,
  targets,
}: {
  release: ReleaseNote;
  book?: ReleaseWebhookPayload["book"];
  targets: ReleaseWebhookTarget[];
}): Promise<ReleaseWebhookResult[]> => {
  const payload = buildReleaseWebhookPayload({ release, book });
  const activeTargets = targets.filter((target) => target.enabled !== false);

  const results = await Promise.all(
    activeTargets.map(async (target): Promise<ReleaseWebhookResult> => {
      try {
        const response = await fetch(target.url, {
          method: "POST",
          headers: buildHeaders(target),
          body: JSON.stringify(payload),
        });
        const status: ReleaseWebhookResult["status"] = response.ok ? "success" : "failure";
        await recordReleaseEvent({
          event: "webhook_delivery",
          status,
          version: release.version,
          webhook: target.url,
        });
        return {
          target,
          status,
          statusCode: response.status,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await recordReleaseEvent({
          event: "webhook_delivery",
          status: "failure",
          version: release.version,
          webhook: target.url,
          metadata: { error: message },
        });
        return {
          target,
          status: "failure",
          error: message,
        };
      }
    })
  );

  if (!activeTargets.length) {
    return [];
  }

  return results;
};
