import { runbookStepLabel, toolkitDisplayName } from "../schemas/toolkit";
import {
	frontmatterText,
	frontmatterTextFields,
	parseFrontmatter as parseSharedFrontmatter,
} from "../utils/frontmatter";
import type { ExportEntry, ExportPart, ExportRawModules } from "./types";

/** Scalar frontmatter fields as text, and the body (see utils/frontmatter.ts). */
export const parseFrontmatter = (raw: string) => {
	const parsed = parseSharedFrontmatter(raw);
	return { data: frontmatterTextFields(parsed.data), body: parsed.body };
};

type ContentRecord = {
	slug: string;
	data: Record<string, unknown>;
	body: string;
	/** The module key it was read from. */
	source: string;
};

const fileSlug = (path: string) =>
	path
		.split("/")
		.pop()
		?.replace(/\.mdx?$/, "") ?? "";

const normalizeLocale = (value?: string) =>
	value?.trim().toLowerCase() || undefined;

/**
 * One section's records in file order, one per slug. Translations (a
 * `locale` other than the book's default) are left out: an export is the
 * book in its default language.
 */
const readRecords = (
	modules: Record<string, string> | undefined,
	defaultLocale: string,
): ContentRecord[] => {
	const seen = new Set<string>();
	const records: ContentRecord[] = [];
	for (const [path, raw] of Object.entries(modules ?? {}).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const { data, body } = parseSharedFrontmatter(raw);
		const locale = normalizeLocale(frontmatterText(data, "locale"));
		if (locale && locale !== defaultLocale) continue;
		const slug = frontmatterText(data, "slug") || fileSlug(path);
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		records.push({ slug, data, body, source: path });
	}
	return records;
};

const text = (data: Record<string, unknown>, field: string) =>
	frontmatterText(data, field) || undefined;

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const list = (data: Record<string, unknown>, field: string): string[] => {
	const value = data[field];
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map(oneLine)
		.filter(Boolean);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const bullets = (items: string[]) =>
	items.map((item) => `- ${item}`).join("\n");

const numbered = (items: string[]) =>
	items.map((item, index) => `${index + 1}. ${item}`).join("\n");

const section = (heading: string, content: string) =>
	content ? `## ${heading}\n\n${content}` : "";

const joinBlocks = (...blocks: Array<string | undefined>) =>
	blocks.filter(Boolean).join("\n\n");

/** What a record's fields add around its body, or nothing when they add nothing. */
const fieldsOf = (before: string, after = ""): Pick<ExportEntry, "fields"> =>
	before || after
		? {
				fields: {
					...(before ? { before } : {}),
					...(after ? { after } : {}),
				},
			}
		: {};

/** An entry's Markdown as one document: its fields' Markdown around its body. */
export const entryMarkdown = (entry: ExportEntry): string =>
	joinBlocks(entry.fields?.before, entry.body, entry.fields?.after);

const plural = (count: number, unit: string) =>
	`${count} ${unit}${count === 1 ? "" : "s"}`;

const orderOf = (data: Record<string, unknown>) =>
	typeof data.order === "number" ? data.order : Number.POSITIVE_INFINITY;

const byTitle = (a: { title: string }, b: { title: string }) =>
	a.title.localeCompare(b.title);

/** Chapters in reading order: an explicit `order`, else file order (as the read UI pages them). */
export const buildExportChapters = (
	modules: Record<string, string> | undefined,
	defaultLocale = "en",
): ExportEntry[] =>
	readRecords(modules, defaultLocale)
		.sort((a, b) => {
			const orderA = orderOf(a.data);
			const orderB = orderOf(b.data);
			return orderA === orderB ? 0 : orderA - orderB;
		})
		.map(({ slug, data, body, source }) => ({
			kind: "chapter",
			slug,
			title: text(data, "title") ?? slug,
			body,
			description: text(data, "summary") ?? text(data, "description"),
			locale: text(data, "locale"),
			source,
		}));

const mechanismEntry = (
	{ slug, data, body, source }: ContentRecord,
	actions: ExportEntry[],
): ExportEntry => {
	const definition = text(data, "definition");
	const recognize = (
		[
			["This is", list(data, "is")],
			["This is not", list(data, "isNot")],
			["Predictions", list(data, "predictions")],
			["Quick tests", list(data, "tests")],
		] as const
	)
		.filter(([, items]) => items.length > 0)
		.map(([label, items]) => `### ${label}\n\n${bullets(items)}`)
		.join("\n\n");
	return {
		kind: "mechanism",
		slug,
		title: text(data, "title") ?? slug,
		body,
		...fieldsOf(definition ?? "", section("How to recognize it", recognize)),
		description: definition,
		locale: text(data, "locale"),
		source,
		...(actions.length > 0 ? { children: actions } : {}),
	};
};

type ActionEntry = { entry: ExportEntry; mechanism?: string; minutes: number };

/**
 * A toolkit action with its procedure written out in the runbook frame's
 * order: owner, trigger, steps, escalation, then the drills that verify it.
 */
const actionEntry = ({
	slug,
	data,
	body,
	source,
}: ContentRecord): ActionEntry => {
	const minutes =
		typeof data.timeboxMinutes === "number" ? data.timeboxMinutes : 10;
	const owner = text(data, "owner");
	const reviewDays =
		typeof data.reviewEveryDays === "number" ? data.reviewEveryDays : undefined;
	const lede = [
		plural(minutes, "minute"),
		owner && `Owner: ${owner}`,
		reviewDays && `Review every ${plural(reviewDays, "day")}`,
	]
		.filter(Boolean)
		.join(" · ");
	const branches = (Array.isArray(data.runbookSteps) ? data.runbookSteps : [])
		.filter(isRecord)
		.flatMap((step) => {
			const action =
				typeof step.action === "string" ? oneLine(step.action) : "";
			const when = typeof step.when === "string" ? oneLine(step.when) : "";
			if (!action) return [];
			return [`**${runbookStepLabel(when)}:** ${action}`];
		});
	const escalation = isRecord(data.escalation) ? data.escalation : {};
	const escalationLines = [
		typeof escalation.to === "string" && `**To:** ${oneLine(escalation.to)}`,
		typeof escalation.when === "string" &&
			`**When:** ${oneLine(escalation.when)}`,
		typeof escalation.withinHours === "number" &&
			`**Within:** ${plural(escalation.withinHours, "hour")}`,
	].filter((line): line is string => Boolean(line));
	const trigger = text(data, "trigger");
	return {
		mechanism: text(data, "mechanism"),
		minutes,
		entry: {
			kind: "tool",
			slug,
			title: toolkitDisplayName({
				name: text(data, "name"),
				title: text(data, "title"),
				slug,
			}),
			body,
			...fieldsOf(
				joinBlocks(
					lede,
					section("When to use this", trigger ? oneLine(trigger) : ""),
					section("Steps", numbered(list(data, "steps"))),
					section("Steps by situation", bullets(branches)),
					section("Escalation", bullets(escalationLines)),
					section("Drills", bullets(list(data, "drills"))),
					section(
						"Failure looks like",
						bullets(list(data, "failureLooksLike")),
					),
					section("Legitimate demand", bullets(list(data, "legitimateDemand"))),
				),
			),
			description: trigger,
			locale: text(data, "locale"),
			source,
		},
	};
};

export type ExportReadingOrderOptions = {
	/** The book's default locale; records in other locales are translations and left out. */
	defaultLocale?: string;
	/** Mechanism slugs in the author's order (book.config `mechanisms`); the rest follow by title. */
	mechanismOrder?: readonly string[];
};

/**
 * Every record type in reading order, following the read hub: chapters to
 * start; then each mechanism with its toolkit actions right after it, so a
 * procedure sits next to the pattern it answers; then the glossary and the
 * examples to look things up.
 */
export const buildExportParts = (
	modules: ExportRawModules,
	options: ExportReadingOrderOptions = {},
): ExportPart[] => {
	const locale = normalizeLocale(options.defaultLocale) ?? "en";
	const authorOrder = options.mechanismOrder ?? [];
	const rank = (slug: string) => {
		const index = authorOrder.indexOf(slug);
		return index === -1 ? Number.POSITIVE_INFINITY : index;
	};

	const mechanismRecords = readRecords(modules.mechanisms, locale)
		.map((record) => ({
			record,
			title: text(record.data, "title") ?? record.slug,
		}))
		.sort((a, b) => {
			const rankA = rank(a.record.slug);
			const rankB = rank(b.record.slug);
			return rankA === rankB ? byTitle(a, b) : rankA - rankB;
		});
	const mechanismTitles = new Map(
		mechanismRecords.map(({ record, title }) => [record.slug, title]),
	);
	const mechanismPosition = new Map(
		mechanismRecords.map(({ record }, index) => [record.slug, index]),
	);

	// Shortest first, as the mechanism page lists them.
	const actions = readRecords(modules.toolkit, locale)
		.map(actionEntry)
		.sort((a, b) => a.minutes - b.minutes || byTitle(a.entry, b.entry));
	const mechanisms = mechanismRecords.map(({ record }) =>
		mechanismEntry(
			record,
			actions
				.filter((action) => action.mechanism === record.slug)
				.map((action) => action.entry),
		),
	);
	const otherActions = actions
		.filter(
			(action) => !action.mechanism || !mechanismTitles.has(action.mechanism),
		)
		.map((action) => action.entry);

	const glossary = readRecords(modules.glossary, locale)
		.map(
			({ slug, data, body, source }): ExportEntry => ({
				kind: "glossary",
				slug,
				title: text(data, "term") ?? slug,
				body,
				...fieldsOf(text(data, "definition") ?? ""),
				description: text(data, "definition"),
				locale: text(data, "locale"),
				source,
			}),
		)
		.sort(byTitle);

	const examples = readRecords(modules.examples, locale)
		.map(({ slug, data, body, source }) => {
			const mechanism = text(data, "mechanism") ?? "";
			const domain = text(data, "domain");
			const lede = [mechanismTitles.get(mechanism) ?? mechanism, domain]
				.filter(Boolean)
				.join(" · ");
			const entry: ExportEntry = {
				kind: "example",
				slug,
				title: text(data, "title") ?? slug,
				body,
				...fieldsOf(lede),
				description: text(data, "summary"),
				locale: text(data, "locale"),
				source,
			};
			const position =
				mechanismPosition.get(mechanism) ?? Number.POSITIVE_INFINITY;
			return { entry, position, mechanism };
		})
		// Grouped by mechanism, in the order the mechanisms appear.
		.sort(
			(a, b) =>
				(a.position === b.position ? 0 : a.position - b.position) ||
				a.mechanism.localeCompare(b.mechanism) ||
				byTitle(a.entry, b.entry),
		)
		.map(({ entry }) => entry);

	const parts: ExportPart[] = [
		{
			title: "Chapters",
			entries: buildExportChapters(modules.chapters, locale),
		},
		{
			title: mechanisms.some((entry) => entry.children)
				? "Mechanisms and actions"
				: "Mechanisms",
			entries: mechanisms,
		},
		{
			title: mechanisms.length > 0 ? "Other actions" : "Actions",
			entries: otherActions,
		},
		{ title: "Glossary", entries: glossary },
		{ title: "Examples", entries: examples },
	];
	return parts.filter((part) => part.entries.length > 0);
};
