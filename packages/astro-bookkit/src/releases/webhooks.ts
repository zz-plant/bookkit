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
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry) => {
        if (typeof entry === "string") {
          return entry.trim() ? [{ url: entry.trim() }] : [];
        }
        if (entry && typeof entry.url === "string") {
          return [entry];
        }
        return [];
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
    activeTargets.map(async (target) => {
      try {
        const response = await fetch(target.url, {
          method: "POST",
          headers: buildHeaders(target),
          body: JSON.stringify(payload),
        });
        const status = response.ok ? "success" : "failure";
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
