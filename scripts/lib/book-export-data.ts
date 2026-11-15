import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../_lib";
import { loadBookConfig } from "./authoring";
import {
	arrayValue,
	listContentFiles,
	parseFrontmatter,
	toStringValue,
} from "./content-frontmatter";
import { loadBookContent } from "./load-book";

export type ExportBookMeta = {
	slug: string;
	title: string;
	subtitle?: string;
	author?: string;
	status: string;
	frame?: {
		slug: string;
		intent?: string;
		steps?: string[];
	};
	causalStance?: string;
	objectives: string[];
	url?: string;
};

export type ExportGlossaryEntry = {
	slug: string;
	term: string;
	definition: string;
	mechanism?: string;
	aliases: string[];
	body: string;
};

export type ExportMechanismEntry = {
	slug: string;
	title: string;
	definition: string;
	is: string[];
	isNot: string[];
	predictions: string[];
	tests: string[];
	body: string;
};

export type ExportToolEntry = {
	slug: string;
	name: string;
	mechanism: string;
	trigger?: string;
	timeboxMinutes: number;
	steps: string[];
	failureLooksLike: string[];
	legitimateDemand: string[];
	owner?: string;
	reviewEveryDays?: number;
	drills: string[];
	escalation?: { to: string; when: string; withinHours?: number };
	body: string;
};

export type ExportChapterEntry = {
	slug: string;
	title: string;
	summary?: string;
	mechanisms: string[];
	prerequisites: string[];
	body: string;
};

export type ExportExampleEntry = {
	slug: string;
	title: string;
	mechanism: string;
	domain: string;
	body: string;
};

export type BookExportData = {
	meta: ExportBookMeta;
	chapters: ExportChapterEntry[];
	mechanisms: ExportMechanismEntry[];
	tools: ExportToolEntry[];
	examples: ExportExampleEntry[];
	glossary: ExportGlossaryEntry[];
};

const readBodyAndField = (file: string) => {
	const parsed = parseFrontmatter(readFileSync(file, "utf8"));
	return { data: parsed.data, body: parsed.body.trim() };
};

const fileSlug = (file: string, declared: string): string =>
	declared ||
	(file.split("/").pop() ?? file).replace(/\.mdx?$/i, "").replace(/^\d+-/, "");

const str = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const strList = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.filter((v): v is string => typeof v === "string")
				.map((v) => v.trim())
				.filter(Boolean)
		: [];

/** Loads one book's normalized config and records for JSON and Agent Skill exports. */
export async function loadBookExportData(
	book: string,
): Promise<BookExportData> {
	const content = loadBookContent(book);
	const config = (await loadBookConfig(book)) ?? {};
	const frameObj = config.frame as
		| { slug?: unknown; intent?: unknown; steps?: unknown }
		| undefined;
	const siteObj = config.site as { url?: unknown } | undefined;

	const meta: ExportBookMeta = {
		slug: book,
		title: str(config.title) || book,
		subtitle: str(config.subtitle) || undefined,
		author: str(config.author) || undefined,
		status: str(config.status) || "draft",
		frame:
			frameObj && str(frameObj.slug)
				? {
						slug: str(frameObj.slug),
						intent: str(frameObj.intent) || undefined,
						steps: strList(frameObj.steps),
					}
				: content.frame
					? { slug: content.frame }
					: undefined,
		causalStance: str(config.causalStance) || undefined,
		objectives: strList(config.objectives),
		url: siteObj ? str(siteObj.url) || undefined : undefined,
	};

	const chapterSummaryByFile = new Map<string, string>();
	for (const ch of content.chapters) {
		if (!ch.file) continue;
		const { data } = readBodyAndField(ch.file);
		const summary = toStringValue(data.summary);
		if (summary) chapterSummaryByFile.set(ch.file, summary);
	}

	const chapters: ExportChapterEntry[] = content.chapters.map((ch) => ({
		slug: ch.slug,
		title: ch.title,
		summary: ch.file ? chapterSummaryByFile.get(ch.file) : undefined,
		mechanisms: ch.mechanisms,
		prerequisites: ch.prerequisites,
		body: (ch.body ?? "").trim(),
	}));

	const mechanisms: ExportMechanismEntry[] = content.mechanisms.map((m) => ({
		slug: m.slug,
		title: m.title,
		definition: m.definition,
		is: m.is,
		isNot: m.isNot,
		predictions: m.predictions,
		tests: m.tests,
		body: m.file ? readBodyAndField(m.file).body : "",
	}));

	const tools: ExportToolEntry[] = content.tools.map((t) => ({
		slug: t.slug,
		name: t.name || t.title || t.slug,
		mechanism: t.mechanism,
		trigger: t.trigger || undefined,
		timeboxMinutes: t.timeboxMinutes ?? 10,
		steps: t.steps ?? [],
		failureLooksLike: t.failureLooksLike ?? [],
		legitimateDemand: t.legitimateDemand ?? [],
		owner: t.owner || undefined,
		reviewEveryDays: t.reviewEveryDays,
		drills: t.drills ?? [],
		escalation: t.escalation,
		body: t.file ? readBodyAndField(t.file).body : "",
	}));

	const examples: ExportExampleEntry[] = content.examples.map((ex) => {
		const slug = ex.file ? fileSlug(ex.file, "") : ex.title;
		return {
			slug,
			title: ex.title,
			mechanism: ex.mechanism,
			domain: ex.domain,
			body: (ex.body ?? "").trim(),
		};
	});

	const glossaryDir = join(
		repoRoot(),
		"apps",
		book,
		"src",
		"content",
		"book",
		"glossary",
	);
	const glossary: ExportGlossaryEntry[] = listContentFiles(glossaryDir).map(
		(file) => {
			const { data, body } = readBodyAndField(file);
			const term = toStringValue(data.term);
			return {
				slug: fileSlug(file, toStringValue(data.slug)),
				term,
				definition: toStringValue(data.definition),
				mechanism: toStringValue(data.mechanism) || undefined,
				aliases: arrayValue(data.aliases),
				body,
			};
		},
	);

	return { meta, chapters, mechanisms, tools, examples, glossary };
}
