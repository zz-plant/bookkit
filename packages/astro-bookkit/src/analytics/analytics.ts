import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ReaderAnalyticsEvent = {
  type: "pageview" | "engagement";
  timestamp: number;
  sessionId: string | null;
  path: string | null;
  chapterSlug: string | null;
  version: string | null;
  title?: string | null;
  durationSeconds?: number | null;
  scrollDepth?: number | null;
  referrer?: string | null;
  userAgent?: string | null;
};

const logPath = join(tmpdir(), "bookkit-reader-analytics.jsonl");

export const getReaderAnalyticsLogPath = (): string => logPath;

export const recordReaderAnalyticsEvent = async (
  payload: ReaderAnalyticsEvent
): Promise<void> => {
  const entry = { ...payload, recordedAt: new Date().toISOString() };
  try {
    await appendFile(logPath, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn("Reader analytics log failed", error);
  }
};
