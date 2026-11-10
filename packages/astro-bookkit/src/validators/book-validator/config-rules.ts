/**
 * Rules about book.config.ts: slugs in mechanismsIndex.urgency and
 * mechanisms (UNKNOWN_MECHANISM, UNLISTED_MECHANISM), the mechanism count
 * target (MECHANISM_COUNT_TARGET), starter text (CONFIG_PLACEHOLDER), and the
 * site a release needs (RELEASE_NOT_INDEXABLE, RELEASE_SITE_URL).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isReleasedStatus } from "../../schemas/status";
import { nearest, type RetiredSlug } from "../content-check";
import {
	extractConfigMechanismSlugsFromSource,
	extractMechanismCountTargetFromSource,
	extractMechanismUrgencySlugsFromSource,
	extractSiteSettingsFromSource,
} from "../frame-config";
import type { BookFinding } from "./sources";

/**
 * Slugs in `mechanismsIndex.urgency` that name no mechanism of the book. The
 * index would ignore them, so a typo or a merged mechanism silently loses its
 * place: an error once release rules apply, a warning before.
 */
export const urgencyFindings = (
	configSource: string,
	configPath: string,
	mechanismSlugs: ReadonlySet<string>,
	retiredSlugs: ReadonlyMap<string, RetiredSlug>,
	releaseMode: boolean,
): BookFinding[] =>
	extractMechanismUrgencySlugsFromSource(configSource)
		.filter((slug) => !mechanismSlugs.has(slug))
		.map((slug) => {
			const retired = retiredSlugs.get(slug);
			const close = nearest(slug, [...mechanismSlugs]);
			return {
				level: releaseMode ? "error" : "warning",
				code: "UNKNOWN_MECHANISM",
				field: "mechanismsIndex.urgency",
				file: configPath,
				message: `mechanismsIndex.urgency names "${slug}", which is not a mechanism in this book, so the mechanisms index ignores it`,
				fix:
					retired && mechanismSlugs.has(retired.into)
						? `${slug} was merged into ${retired.into}${retired.date ? ` on ${retired.date}` : ""}: rename the key to "${retired.into}", or remove it.`
						: close.length > 0
							? `Did you mean ${close.map((candidate) => `"${candidate}"`).join(" or ")}? Rename the key to that mechanism's slug, or remove it.`
							: `Use the slug of one of this book's mechanisms (src/content/book/mechanisms/), or remove the key.`,
			};
		});

/**
 * Slugs in `book.config.ts` `mechanisms: [ { slug: "..." } ]` that name no
 * mechanism of the book, or mechanisms in the content folder that are omitted
 * from the declaration. An error in releaseMode, a warning in draft.
 */
export const configMechanismFindings = (
	configSource: string,
	configPath: string,
	mechanismSlugs: ReadonlySet<string>,
	retiredSlugs: ReadonlyMap<string, RetiredSlug>,
	releaseMode: boolean,
): BookFinding[] => {
	const declaredSlugs = extractConfigMechanismSlugsFromSource(configSource);
	if (!declaredSlugs) return [];
	const declaredSet = new Set(declaredSlugs);
	const findings: BookFinding[] = [];
	for (const slug of declaredSlugs) {
		if (!mechanismSlugs.has(slug)) {
			const retired = retiredSlugs.get(slug);
			const close = nearest(slug, [...mechanismSlugs]);
			findings.push({
				level: releaseMode ? "error" : "warning",
				code: "UNKNOWN_MECHANISM",
				field: "mechanisms",
				file: configPath,
				message: `book.config.ts mechanisms commits to "${slug}", which is not a mechanism in this book (src/content/book/mechanisms/)`,
				fix:
					retired && mechanismSlugs.has(retired.into)
						? `${slug} was merged into ${retired.into}${retired.date ? ` on ${retired.date}` : ""}: update the entry to "${retired.into}".`
						: close.length > 0
							? `Did you mean ${close.map((candidate) => `"${candidate}"`).join(" or ")}? Update the slug or add mechanisms/${slug}.mdx.`
							: `Add mechanisms/${slug}.mdx, or remove the entry from book.config.ts mechanisms.`,
			});
		}
	}
	if (declaredSlugs.length > 0) {
		for (const mechSlug of mechanismSlugs) {
			if (!declaredSet.has(mechSlug)) {
				findings.push({
					level: releaseMode ? "error" : "warning",
					code: "UNLISTED_MECHANISM",
					field: "mechanisms",
					file: configPath,
					message: `Mechanism "${mechSlug}" exists in src/content/book/mechanisms/ but is not declared in book.config.ts mechanisms`,
					fix: `Add an entry for "${mechSlug}" with its focus sentence to book.config.ts mechanisms, or remove mechanisms/${mechSlug}.mdx.`,
				});
			}
		}
	}
	return findings;
};

/**
 * Checks constraints.mechanismCountTarget: [min, max] if declared in book.config.ts.
 */
export const constraintTargetFindings = (
	configSource: string,
	configPath: string,
	mechanismCount: number,
): BookFinding[] => {
	const target = extractMechanismCountTargetFromSource(configSource);
	if (!target) return [];
	const [min, max] = target;
	if (mechanismCount < min || mechanismCount > max) {
		return [
			{
				level: "warning",
				code: "MECHANISM_COUNT_TARGET",
				field: "constraints.mechanismCountTarget",
				file: configPath,
				message: `Book has ${mechanismCount} mechanism(s), outside constraints.mechanismCountTarget [${min}, ${max}]`,
				fix: `Add or consolidate mechanisms, or adjust constraints.mechanismCountTarget in book.config.ts.`,
			},
		];
	}
	return [];
};

/**
 * The placeholder prose a new book's book.config.ts starts with, read from
 * the engine's starter template, so an edited template needs no change here.
 * Not site.url: https://<slug>.book may be the domain the author means to buy,
 * and deploy already says when the Worker does not serve it.
 */
const STARTER_FIELDS = [
	{
		field: "objectives.readerStart",
		key: "readerStart",
		shown: "shows on the About this book page (/read/overview)",
		meaning: "who the reader is before the first page",
	},
	{
		field: "objectives.readerEnd",
		key: "readerEnd",
		shown: "shows on the About this book page (/read/overview)",
		meaning: "what the reader can do after the last page",
	},
	{
		field: "objectives.transformation",
		key: "transformation",
		shown: "shows on the About this book page (/read/overview)",
		meaning: "the change between the two, in one sentence",
	},
	{
		field: "frame.intent",
		key: "intent",
		meaning: "what the book moves the reader through",
	},
	{
		field: "causalStance",
		key: "causalStance",
		shown: "shows on the About this book page (/read/overview)",
		meaning: "the book's core claim about what causes the problem it covers",
	},
] as const;

const starterPlaceholders = (workspaceRoot: string) => {
	const template = join(
		workspaceRoot,
		"packages",
		"astro-bookkit",
		"templates",
		"starter",
		"src",
		"book.config.ts",
	);
	if (!existsSync(template)) return [];
	const source = readFileSync(template, "utf8");
	return STARTER_FIELDS.flatMap((field) => {
		const value = source.match(
			new RegExp(`\\b${field.key}:\\s*("(?:[^"\\\\]|\\\\.)*")`),
		)?.[1];
		return value ? [{ ...field, text: value }] : [];
	});
};

/**
 * What book.config.ts shows readers that is not the author's: starter text
 * (a warning in a draft, an error under release rules) and, under release
 * rules, a site kept out of search or without its public address.
 */
export const configFindings = (
	workspaceRoot: string,
	configSource: string,
	configPath: string,
	status: string | undefined,
	releaseMode: boolean,
): BookFinding[] => {
	const findings: BookFinding[] = [];
	for (const placeholder of starterPlaceholders(workspaceRoot)) {
		if (!configSource.includes(placeholder.text)) continue;
		findings.push({
			level: releaseMode ? "error" : "warning",
			code: "CONFIG_PLACEHOLDER",
			field: placeholder.field,
			file: configPath,
			message: `book.config.ts still has the starter text for ${placeholder.field}${"shown" in placeholder ? `, which ${placeholder.shown}` : ""}`,
			fix: `Replace it with ${placeholder.meaning}.`,
		});
	}
	if (!releaseMode) return findings;
	const released = isReleasedStatus(status) ? status : "published";
	const site = extractSiteSettingsFromSource(configSource);
	if (site?.indexable === false) {
		findings.push({
			level: "error",
			code: "RELEASE_NOT_INDEXABLE",
			field: "site.indexable",
			file: configPath,
			message: `site.indexable is false, but a ${released} book is meant to be found`,
			fix: 'Remove indexable: false (or set it to true), or set status: "draft" until the book should be found.',
		});
	}
	const url = site?.url?.trim();
	if (!url || /localhost|127\.0\.0\.1|\.local(?=[:/]|$)/i.test(url)) {
		findings.push({
			level: "error",
			code: "RELEASE_SITE_URL",
			field: "site.url",
			file: configPath,
			message: `${url ? `site.url is a local address (${url})` : "There is no site.url written as a string"}, so canonical links, the sitemap, and link previews would not point at the published site`,
			fix: 'Set site.url to the public address readers will use, as a string inside site: { ... }, e.g. url: "https://example.com".',
		});
	}
	return findings;
};
