import { promises as fs } from "node:fs";
import path from "node:path";

import { jsonResponse, parseJsonBody } from "../utils/http";

export type FeedbackEvent = {
  id: string;
  eventType: "impression" | "feedback";
  timestamp: number;
  slug: string;
  title?: string | null;
  contentType?: string | null;
  version?: string | null;
  responseType?: string | null;
  emoji?: string | null;
  comment?: string | null;
};

export type FeedbackEndpointOptions = {
  storagePath?: string;
  maxEvents?: number;
};

const defaultStoragePath = path.join(process.cwd(), ".bookkit", "feedback-events.json");
const MAX_COMMENT_LENGTH = 240;
const MAX_TITLE_LENGTH = 160;
const MAX_SLUG_LENGTH = 200;
const MAX_EMOJI_LENGTH = 16;
const MAX_EVENT_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
};

const sanitizeComment = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
};

const normalizeTimestamp = (value: unknown) => {
  const numeric = typeof value === "number" ? value : undefined;
  const now = Date.now();
  if (!numeric) return now;
  if (Math.abs(now - numeric) > MAX_EVENT_AGE_MS) return now;
  return numeric;
};

const normalizeEvent = (payload: Record<string, unknown>): FeedbackEvent | null => {
  const eventType = payload.eventType === "feedback" || payload.eventType === "impression"
    ? payload.eventType
    : null;
  const slug = cleanText(payload.slug, MAX_SLUG_LENGTH);
  if (!eventType || !slug) return null;

  return {
    id: cleanText(payload.id, 80) ?? `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventType,
    timestamp: normalizeTimestamp(payload.timestamp),
    slug,
    title: cleanText(payload.title, MAX_TITLE_LENGTH) ?? null,
    contentType: cleanText(payload.contentType, 80) ?? null,
    version: cleanText(payload.version, 40) ?? null,
    responseType: cleanText(payload.responseType, 40) ?? null,
    emoji: cleanText(payload.emoji, MAX_EMOJI_LENGTH) ?? null,
    comment: sanitizeComment(payload.comment) ?? null,
  };
};

const parsePayload = (payload: unknown): FeedbackEvent[] => {
  if (!payload) return [];
  if (isRecord(payload)) {
    if (Array.isArray(payload.events)) {
      return payload.events
        .map((event) => (isRecord(event) ? normalizeEvent(event) : null))
        .filter((event): event is FeedbackEvent => Boolean(event));
    }
    const normalized = normalizeEvent(payload);
    return normalized ? [normalized] : [];
  }
  return [];
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseNumber = (value: string | null) => {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const loadEvents = async (storagePath: string): Promise<FeedbackEvent[]> => {
  try {
    const stored = await fs.readFile(storagePath, "utf8");
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as FeedbackEvent[]) : [];
  } catch (error) {
    return [];
  }
};

const persistEvents = async (storagePath: string, events: FeedbackEvent[], maxEvents: number) => {
  const directory = path.dirname(storagePath);
  await fs.mkdir(directory, { recursive: true });

  const existing = await loadEvents(storagePath);
  const merged = [...existing, ...events].slice(-maxEvents);
  await fs.writeFile(storagePath, JSON.stringify(merged, null, 2));
};

export const createFeedbackEndpoint = (options: FeedbackEndpointOptions = {}) => {
  const storagePath = options.storagePath ?? defaultStoragePath;
  const maxEvents = options.maxEvents ?? 2000;

  return {
    GET: async ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const limitParam = parseNumber(url.searchParams.get("limit"));
      const sinceParam = parseNumber(url.searchParams.get("since"));
      const untilParam = parseNumber(url.searchParams.get("until"));
      const slugParam = cleanText(url.searchParams.get("slug"), MAX_SLUG_LENGTH);

      const limit = clampNumber(limitParam ?? maxEvents, 1, maxEvents);
      const since = sinceParam ?? 0;
      const until = untilParam ?? Date.now();

      const storedEvents = await loadEvents(storagePath);
      const filtered = storedEvents.filter((event) => {
        if (event.timestamp < since || event.timestamp > until) return false;
        if (slugParam && event.slug !== slugParam) return false;
        return true;
      });

      return jsonResponse({ ok: true, events: filtered.slice(-limit) });
    },
    POST: async ({ request }: { request: Request }) => {
      const payload = await parseJsonBody(request);

      const events = parsePayload(payload);
      if (!events.length) {
        return jsonResponse({ ok: false, error: "Invalid feedback payload." }, 400);
      }

      try {
        await persistEvents(storagePath, events, maxEvents);
      } catch (error) {
        return jsonResponse({ ok: false, error: "Unable to store feedback." }, 500);
      }

      return jsonResponse({ ok: true, stored: events.length });
    },
  };
};
