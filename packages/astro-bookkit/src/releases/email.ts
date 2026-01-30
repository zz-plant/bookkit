import type { ReleaseNote } from "./notes";
import { recordReleaseEvent } from "./analytics";

export type ReleaseEmailTarget = {
  url: string;
  name?: string;
  secret?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  provider?: string;
};

export type ReleaseEmailPayload = {
  event: "release_email";
  release: ReleaseNote;
  book?: {
    slug?: string;
    title?: string;
  };
  at: string;
};

export type ReleaseEmailResult = {
  target: ReleaseEmailTarget;
  status: "success" | "failure";
  statusCode?: number;
  error?: string;
};

export const buildReleaseEmailPayload = ({
  release,
  book,
  at = new Date().toISOString(),
}: {
  release: ReleaseNote;
  book?: ReleaseEmailPayload["book"];
  at?: string;
}): ReleaseEmailPayload => ({
  event: "release_email",
  release,
  book,
  at,
});

export const parseReleaseEmailTargets = (raw?: string | null): ReleaseEmailTarget[] => {
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
          return [entry as ReleaseEmailTarget];
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

const buildHeaders = (target: ReleaseEmailTarget) => {
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

export const sendReleaseEmailHooks = async ({
  release,
  book,
  targets,
}: {
  release: ReleaseNote;
  book?: ReleaseEmailPayload["book"];
  targets: ReleaseEmailTarget[];
}): Promise<ReleaseEmailResult[]> => {
  const payload = buildReleaseEmailPayload({ release, book });
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
          event: "email_delivery",
          status,
          version: release.version,
          webhook: target.url,
          metadata: target.provider ? { provider: target.provider } : undefined,
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
          event: "email_delivery",
          status: "failure",
          version: release.version,
          webhook: target.url,
          metadata: { error: message, ...(target.provider ? { provider: target.provider } : {}) },
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
