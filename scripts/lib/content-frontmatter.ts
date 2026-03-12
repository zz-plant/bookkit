import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type FrontmatterValue = string | string[] | number | boolean | null;

export type Frontmatter = {
  data: Record<string, FrontmatterValue>;
  hasFrontmatter: boolean;
};

export function listContentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listContentFiles(fullPath));
    } else if (entry.isFile() && isContentFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function isContentFile(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx");
}

export function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) {
    return { data: {}, hasFrontmatter: false };
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { data: {}, hasFrontmatter: false };
  const raw = content.slice(3, end).trim();
  const lines = raw.split(/\r?\n/);
  const data: Record<string, FrontmatterValue> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const keyMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
    if (keyMatch) {
      const key = keyMatch[1];
      const valueRaw = keyMatch[2];
      currentKey = key;
      if (!valueRaw) {
        data[key] = [];
      } else {
        data[key] = coerceValue(valueRaw);
        currentKey = null;
      }
      continue;
    }
    const listMatch = /^-\s*(.*)$/.exec(trimmed);
    if (listMatch && currentKey) {
      const current = data[currentKey];
      if (Array.isArray(current)) current.push(coerceValue(listMatch[1]) as string);
    }
  }

  return { data, hasFrontmatter: true };
}

export function toStringValue(value: FrontmatterValue): string {
  if (typeof value === "string") return value.trim();
  return "";
}

export function arrayValue(value: FrontmatterValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
}

function coerceValue(value: string): FrontmatterValue {
  const cleaned = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (cleaned !== "" && !Number.isNaN(Number(cleaned))) return Number(cleaned);
  return cleaned;
}
