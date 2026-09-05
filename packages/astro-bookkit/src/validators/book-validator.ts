import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultFrames } from "../frames/defaults";
import { mechanismSchema, toolkitSchema } from "../schemas";
import { validateFrameSteps } from "./frame";
import { extractFrameConfigFromSource } from "./frame-config";
import type { NormalizedErrorPayload } from "./normalized-error";

export type ValidateBookOptions = {
	workspaceRoot?: string;
	bookSlug: string;
	mode?: "warn" | "error";
	noDrafts?: boolean;
	/** Override the frame slug declared in book.config.ts (defaults to the config value). */
	frameSlug?: string;
};

export type ValidateBookResult = {
	ok: boolean;
	book: string;
	errors: NormalizedErrorPayload[];
	warnings: NormalizedErrorPayload[];
};

function listFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(full));
		} else if (
			entry.isFile() &&
			(entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
		) {
			files.push(full);
		}
	}
	return files;
}

function parseSimpleFrontmatter(content: string): {
	data: Record<string, unknown>;
	body: string;
} {
	if (!content.startsWith("---")) return { data: {}, body: content };
	const end = content.indexOf("\n---", 3);
	if (end === -1) return { data: {}, body: content };
	const raw = content.slice(3, end);
	const body = content.slice(end + 4).trim();
	const data: Record<string, unknown> = {};

	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (match) {
			const key = match[1];
			const val = match[2].replace(/^["']|["']$/g, "").trim();
			data[key] = val;
		}
	}
	return { data, body };
}

export function validateBookInMemory(
	options: ValidateBookOptions,
): ValidateBookResult {
	const root = options.workspaceRoot ?? process.cwd();
	const bookDir = join(
		root,
		"apps",
		options.bookSlug,
		"src",
		"content",
		"book",
	);
	const errors: NormalizedErrorPayload[] = [];
	const warnings: NormalizedErrorPayload[] = [];

	if (!existsSync(bookDir)) {
		errors.push({
			machineCode: "BOOK_DIRECTORY_NOT_FOUND",
			humanSummary: `Content directory not found for book "${options.bookSlug}".`,
			location: { module: "validators/book-validator", file: bookDir },
			failingRule:
				"book content directory must exist under apps/<book>/src/content/book",
			nextAction:
				"Scaffold the book using bun run new:book or verify the book slug.",
			severity: "error",
			gateLevel: "blocking",
		});
		return { ok: false, book: options.bookSlug, errors, warnings };
	}

	const mechanismFiles = listFiles(join(bookDir, "mechanisms"));
	const mechanismSlugs = new Set<string>();

	for (const file of mechanismFiles) {
		const { data } = parseSimpleFrontmatter(readFileSync(file, "utf8"));
		const slug = typeof data.slug === "string" ? data.slug : undefined;
		if (slug) mechanismSlugs.add(slug);

		const parsed = mechanismSchema.safeParse(data);
		if (!parsed.success) {
			warnings.push({
				machineCode: "MECHANISM_SCHEMA_INVALID",
				humanSummary: `Mechanism schema issues in ${file}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
				location: { module: "validators/book-validator", file },
				failingRule: "mechanisms must conform to mechanismSchema",
				nextAction:
					"Ensure all required mechanism fields are present and valid.",
				severity: "warning",
				gateLevel: "advisory",
			});
		}
	}

	const toolkitFiles = listFiles(join(bookDir, "toolkit"));
	for (const file of toolkitFiles) {
		const { data } = parseSimpleFrontmatter(readFileSync(file, "utf8"));
		const mechanism =
			typeof data.mechanism === "string" ? data.mechanism : undefined;
		if (mechanism && !mechanismSlugs.has(mechanism)) {
			errors.push({
				machineCode: "TOOL_UNKNOWN_MECHANISM",
				humanSummary: `Tool references unknown mechanism "${mechanism}" in ${file}.`,
				location: { module: "validators/book-validator", file },
				failingRule: "tools must bind to a declared mechanism slug",
				nextAction: `Define mechanism "${mechanism}" under content/book/mechanisms/ or update the tool reference.`,
				severity: "error",
				gateLevel: "blocking",
			});
		}

		const parsed = toolkitSchema.safeParse(data);
		if (!parsed.success) {
			warnings.push({
				machineCode: "TOOL_SCHEMA_INVALID",
				humanSummary: `Tool schema issues in ${file}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
				location: { module: "validators/book-validator", file },
				failingRule: "tools must conform to toolkitSchema",
				nextAction:
					"Ensure trigger, timeboxMinutes <= 10, and action steps are defined.",
				severity: "warning",
				gateLevel: "advisory",
			});
		}
	}

	// Frame check on overview chapter
	const overviewFile = join(bookDir, "chapters", "00-overview.mdx");
	if (existsSync(overviewFile)) {
		const content = readFileSync(overviewFile, "utf8");
		const headingMatches = Array.from(
			content.matchAll(/(?:^|\n)#{1,4}\s+([A-Za-z0-9_-]+)/g),
		).map((m) => m[1].toLowerCase());

		let configuredSlug = options.frameSlug;
		if (!configuredSlug) {
			const configPath = join(
				root,
				"apps",
				options.bookSlug,
				"src",
				"book.config.ts",
			);
			if (existsSync(configPath)) {
				configuredSlug =
					extractFrameConfigFromSource(readFileSync(configPath, "utf8"))
						?.slug ?? undefined;
			}
		}

		// Author decisions live in book.config.ts; validate against the configured
		// frame and fall back to the intervention frame when none is declared.
		const activeFrame =
			defaultFrames.find((f) => f.slug === configuredSlug) ??
			defaultFrames.find((f) => f.slug === "intervention");
		if (activeFrame) {
			const frameResult = validateFrameSteps(activeFrame, headingMatches);
			for (const err of frameResult.errors) {
				warnings.push(err);
			}
		}
	}

	const ok = errors.length === 0;
	return { ok, book: options.bookSlug, errors, warnings };
}
