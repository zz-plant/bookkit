import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { optionalArg, readText, requireArg } from "./_lib";
import { recordReleaseEvent } from "@bookkit/astro-bookkit";

type ReleaseNote = {
  title: string;
  version: string;
  date: string;
  summary: string;
  highlights: string[];
  slug: string;
};

type Frontmatter = Record<string, string | string[]>;

const book = requireArg("--book");
const webhookUrl = requireArg("--webhook");
const emailWebhookUrl = optionalArg("--email-webhook");
const targetVersion = optionalArg("--version");

const releaseDir = join(process.cwd(), "apps", book, "src", "content", "book", "releases");

if (!existsSync(releaseDir)) {
  console.error(`Missing release notes directory: ${releaseDir}`);
  process.exit(1);
}

const releases = listReleaseNotes(releaseDir);
if (releases.length === 0) {
  console.error("No release notes found.");
  process.exit(1);
}

const release = targetVersion
  ? releases.find((item) => item.version === targetVersion)
  : releases[0];

if (!release) {
  console.error(`No release found for version ${targetVersion}`);
  process.exit(1);
}

const payload = {
  event: "release.published",
  book,
  version: release.version,
  title: release.title,
  date: release.date,
  summary: release.summary,
  highlights: release.highlights,
  slug: release.slug,
};

await deliverWebhook(webhookUrl, payload);

if (emailWebhookUrl) {
  await deliverWebhook(emailWebhookUrl, { ...payload, event: "release.email" });
}

async function deliverWebhook(url: string, body: typeof payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const status = response.ok ? "success" : "failure";
    await recordReleaseEvent({
      event: "webhook_delivery",
      status,
      version: body.version,
      webhook: url,
    });

    if (!response.ok) {
      console.error(`Webhook failed (${response.status}) for ${url}`);
    } else {
      console.log(`Webhook delivered (${response.status}) to ${url}`);
    }
  } catch (error) {
    await recordReleaseEvent({
      event: "webhook_delivery",
      status: "failure",
      version: body.version,
      webhook: url,
      metadata: { error: String(error) },
    });
    console.error(`Webhook delivery error for ${url}`, error);
  }
}

function listReleaseNotes(dir: string): ReleaseNote[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const notes: ReleaseNote[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".mdx")) continue;
    const fullPath = join(dir, entry.name);
    const content = readText(fullPath);
    const frontmatter = parseFrontmatter(content);
    const slug = entry.name.replace(/\.mdx$/, "");

    notes.push({
      slug,
      title: toString(frontmatter.title),
      version: toString(frontmatter.version),
      date: toString(frontmatter.date),
      summary: toString(frontmatter.summary),
      highlights: toList(frontmatter.highlights),
    });
  }

  return notes
    .filter((note) => note.version && note.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};
  const raw = content.slice(3, end).trim();
  const lines = raw.split(/\r?\n/);
  const data: Frontmatter = {};
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
        data[key] = stripQuotes(valueRaw);
        currentKey = null;
      }
      continue;
    }
    const listMatch = /^-\s*(.*)$/.exec(trimmed);
    if (listMatch && currentKey) {
      const current = data[currentKey];
      if (Array.isArray(current)) current.push(stripQuotes(listMatch[1]));
    }
  }

  return data;
}

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
}

function toString(value?: string | string[]): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function toList(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value.filter((item) => item.length > 0);
  return [];
}
