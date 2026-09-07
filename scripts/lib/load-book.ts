import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ChapterRecord,
	ExampleRecord,
	MechanismRecord,
	ToolRecord,
} from "../../packages/astro-bookkit/src/suggestions";
import { extractFrameConfigFromSource } from "../../packages/astro-bookkit/src/validators/frame-config";
import { repoRoot } from "../_lib";
import {
	arrayValue,
	listContentFiles,
	parseFrontmatter,
	toStringValue,
} from "./content-frontmatter";

export type LoadedBookContent = {
	book: string;
	bookRoot: string;
	contentRoot: string;
	mechanisms: MechanismRecord[];
	tools: ToolRecord[];
	frame?: string;
	chapters: ChapterRecord[];
	chapterBodies: Array<{ file: string; body: string }>;
	examples: ExampleRecord[];
	glossaryTerms: string[];
	toolkitNames: string[];
	vocabulary: string[];
	hasBookConfig: boolean;
};

const read = (file: string): string => readFileSync(file, "utf8");

/**
 * Parses one book's content tree into the records the analyzers, validators,
 * and proposal pipeline share. Keeps record parsing in one place so the
 * suggestion, runbook, and proposal CLIs cannot drift apart.
 */
export const loadBookContent = (book: string): LoadedBookContent => {
	const bookRoot = join(repoRoot(), "apps", book, "src", "content", "book");
	if (!existsSync(bookRoot)) {
		return {
			book,
			bookRoot,
			contentRoot: join(bookRoot, "book"),
			mechanisms: [],
			tools: [],
			frame: undefined,
			chapters: [],
			chapterBodies: [],
			examples: [],
			glossaryTerms: [],
			toolkitNames: [],
			vocabulary: [],
			hasBookConfig: false,
		};
	}

	const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
	const chapterFiles = listContentFiles(join(bookRoot, "chapters"));
	const exampleFiles = listContentFiles(join(bookRoot, "examples"));
	const glossaryFiles = listContentFiles(join(bookRoot, "glossary"));
	const toolkitFiles = listContentFiles(join(bookRoot, "toolkit"));

	const mechanisms: MechanismRecord[] = mechanismFiles.map((file) => {
		const { data } = parseFrontmatter(read(file));
		return {
			slug: toStringValue(data.slug),
			title: toStringValue(data.title) || toStringValue(data.slug),
			definition: toStringValue(data.definition),
			is: arrayValue(data.is),
			isNot: arrayValue(data.isNot),
			predictions: arrayValue(data.predictions),
			tests: arrayValue(data.tests),
			satisfies: arrayValue(data.satisfies),
			file,
		};
	});

	const tools: ToolRecord[] = toolkitFiles.map((file) => {
		const { data } = parseFrontmatter(read(file));
		const escalationRaw = Array.isArray(data.escalation)
			? undefined
			: (data.escalation as unknown as Record<string, unknown> | undefined);
		const escalationTo =
			typeof escalationRaw?.to === "string" ? escalationRaw.to : undefined;
		const escalationWhen =
			typeof escalationRaw?.when === "string" ? escalationRaw.when : undefined;
		return {
			slug: toStringValue(data.slug),
			mechanism: toStringValue(data.mechanism),
			name: toStringValue(data.name),
			owner: toStringValue(data.owner),
			drills: arrayValue(data.drills),
			satisfies: arrayValue(data.satisfies),
			escalation:
				escalationRaw && escalationTo && escalationWhen
					? {
							to: escalationTo,
							when: escalationWhen,
							withinHours:
								typeof escalationRaw.withinHours === "number"
									? escalationRaw.withinHours
									: undefined,
						}
					: undefined,
			file,
		};
	});

	const bookConfigPath = join(
		repoRoot(),
		"apps",
		book,
		"src",
		"book.config.ts",
	);
	const hasBookConfig = existsSync(bookConfigPath);
	const frame = hasBookConfig
		? extractFrameConfigFromSource(read(bookConfigPath))?.slug
		: undefined;

	const chapterParsed = chapterFiles.map((file) => {
		const { data, body } = parseFrontmatter(read(file));
		return {
			slug: toStringValue(data.slug) || file,
			title: toStringValue(data.title) || toStringValue(data.slug) || file,
			mechanisms: arrayValue(data.mechanisms),
			prerequisites: arrayValue(data.prerequisites),
			file,
			body,
		};
	});

	const chapters: ChapterRecord[] = chapterParsed.map(
		({ body, ...chapter }) => ({
			...chapter,
			body,
		}),
	);
	const chapterBodies = chapterParsed.map((c) => ({
		file: c.file ?? c.slug,
		body: c.body,
	}));

	const examples: ExampleRecord[] = exampleFiles.map((file) => {
		const { data, body } = parseFrontmatter(read(file));
		return {
			mechanism: toStringValue(data.mechanism),
			domain: toStringValue(data.domain),
			title: toStringValue(data.title) || file,
			body,
			file,
			frontmatterKeys: Object.keys(data),
		};
	});

	const glossaryTerms = glossaryFiles.map((file) =>
		toStringValue(parseFrontmatter(read(file)).data.term),
	);
	const toolkitNames = toolkitFiles.map((file) =>
		toStringValue(parseFrontmatter(read(file)).data.name),
	);
	const vocabulary = [
		...mechanisms.map((m) => m.slug),
		...mechanisms.map((m) => m.title),
		...glossaryTerms,
		...toolkitNames,
	].filter(Boolean);

	return {
		book,
		bookRoot,
		contentRoot: join(bookRoot, "book"),
		mechanisms,
		tools,
		frame,
		chapters,
		chapterBodies,
		examples,
		glossaryTerms,
		toolkitNames,
		vocabulary,
		hasBookConfig,
	};
};
