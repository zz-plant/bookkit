import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { optionalArg, requireArg } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";
import { listContentFiles } from "./lib/content-frontmatter";

type SeoSiteConfig = {
	url?: string;
	indexable?: boolean;
};

const book = requireArg("--book");
const mode = optionalArg("--mode") ?? "warn";
const noDrafts = process.argv.includes("--no-drafts");

const workspaceRoot = join(import.meta.dir, "..");
const bookRoot = join(workspaceRoot, "apps", book, "src", "content", "book");

const requiredDirs = [
	"chapters",
	"examples",
	"glossary",
	"mechanisms",
	"toolkit",
];

const findings: Finding[] = [];
const error = (message: string, code: string) =>
	findings.push({ level: "error", code, message });
const warning = (message: string, code: string) =>
	findings.push({ level: "warning", code, message });

for (const dir of requiredDirs) {
	const fullPath = join(bookRoot, dir);
	if (!existsSync(fullPath)) {
		error(`Missing required directory: ${fullPath}`, "DIRECTORY_MISSING");
	}
}

import {
	defaultFrames,
	validateFrameSteps,
} from "../packages/astro-bookkit/src";
import {
	type ContentSection,
	checkContentItem,
	mechanismSlugsFrom,
	type RetiredSlug,
	retiredSlugsFromCorpus,
	SECTION_DIRECTORIES,
} from "../packages/astro-bookkit/src/validators/content-check";
import { extractFrameConfigFromSource } from "../packages/astro-bookkit/src/validators/frame-config";

// Each file is checked against its section's contract (content-check.ts), the
// same checker agents call through MCP before writing a file.
const sourcesBySection = Object.fromEntries(
	(Object.keys(SECTION_DIRECTORIES) as ContentSection[]).map((section) => [
		section,
		listContentFiles(join(bookRoot, SECTION_DIRECTORIES[section])).map(
			(file) => ({ file, source: readFileSync(file, "utf8") }),
		),
	]),
) as Record<ContentSection, Array<{ file: string; source: string }>>;

const mechanismSlugs = mechanismSlugsFrom(
	sourcesBySection.mechanism.map(({ source }) => source),
);
// Merges recorded in corpus.json let a stale reference name its replacement.
const corpusPath = join(workspaceRoot, "corpus.json");
let retiredSlugs = new Map<string, RetiredSlug>();
try {
	if (existsSync(corpusPath)) {
		retiredSlugs = retiredSlugsFromCorpus(
			JSON.parse(readFileSync(corpusPath, "utf8")),
		);
	}
} catch {
	// check:corpus reports an unreadable corpus.json; validation goes on without it.
}

for (const section of [
	"mechanism",
	"tool",
	"example",
	"chapter",
	"glossary",
] as const) {
	for (const { file, source } of sourcesBySection[section]) {
		const result = checkContentItem(section, source, {
			mechanismSlugs,
			retiredSlugs,
			releaseMode: noDrafts,
		});
		for (const finding of result.findings) {
			findings.push({ ...finding, file: relative(workspaceRoot, file) });
		}
	}
}

// Frame step enforcement on overview chapter
const overviewChapter = join(bookRoot, "chapters", "00-overview.mdx");
if (existsSync(overviewChapter)) {
	const content = readFileSync(overviewChapter, "utf8");
	const headingMatches = Array.from(
		content.matchAll(/(?:^|\n)#{1,4}\s+([A-Za-z0-9_-]+)/g),
	).map((m) => m[1].toLowerCase());

	// Author decisions live in book.config.ts; validate against the configured
	// frame and fall back to the intervention frame when none is declared.
	const configPath = join(workspaceRoot, "apps", book, "src", "book.config.ts");
	const configuredSlug = existsSync(configPath)
		? extractFrameConfigFromSource(readFileSync(configPath, "utf8"))?.slug
		: undefined;
	const frame =
		defaultFrames.find((f) => f.slug === configuredSlug) ??
		defaultFrames.find((f) => f.slug === "intervention");
	if (frame) {
		const frameResult = validateFrameSteps(frame, headingMatches);
		if (frameResult.missingRequiredSteps.length > 0) {
			warning(
				`Framing chapter (00-overview.mdx) for frame "${frame.slug}" is missing required step(s): ${frameResult.missingRequiredSteps.join(", ")}`,
				"FRAME_STEP_MISSING",
			);
		}
	}
}

const bookConfigPath = join(
	workspaceRoot,
	"apps",
	book,
	"src",
	"book.config.ts",
);
if (existsSync(bookConfigPath)) {
	const configSource = readFileSync(bookConfigPath, "utf8");
	const siteConfig = extractSiteConfig(configSource);
	const indexableFalse = siteConfig?.indexable === false;
	const siteUrl = siteConfig?.url?.trim();
	const localSiteUrl =
		!!siteUrl && /localhost|127\.0\.0\.1|\.local(?=[:/]|$)/i.test(siteUrl);

	const requireProdSeo =
		noDrafts && process.env.BOOKKIT_REQUIRE_INDEXABLE_PROD === "true";

	if (requireProdSeo && indexableFalse) {
		error(
			`Release validation failed: apps/${book}/src/book.config.ts has site.indexable set to false. Set indexable: true for production.`,
			"RELEASE_NOT_INDEXABLE",
		);
	}

	if (requireProdSeo && (!siteUrl || localSiteUrl)) {
		error(
			`Release validation failed: apps/${book}/src/book.config.ts must define a public site.url for production builds.`,
			"RELEASE_SITE_URL",
		);
	}
}

function extractSiteConfig(source: string): SeoSiteConfig | null {
	const sourceFile = ts.createSourceFile(
		"book.config.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const objectBindings = new Map<string, ts.ObjectLiteralExpression>();
	let bookConfigObject: ts.ObjectLiteralExpression | null = null;

	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || !declaration.initializer)
				continue;
			if (ts.isObjectLiteralExpression(declaration.initializer)) {
				objectBindings.set(declaration.name.text, declaration.initializer);
			}
			if (
				declaration.name.text === "bookConfig" &&
				ts.isObjectLiteralExpression(declaration.initializer)
			) {
				bookConfigObject = declaration.initializer;
			}
		}
	}

	if (!bookConfigObject) return null;

	const siteNode = readObjectProperty(bookConfigObject, "site");
	if (!siteNode) return null;

	return evaluateSiteNode(siteNode, objectBindings, new Set());
}

function evaluateSiteNode(
	node: ts.Expression,
	objectBindings: Map<string, ts.ObjectLiteralExpression>,
	seen: Set<string>,
): SeoSiteConfig | null {
	if (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node)
	) {
		return evaluateSiteNode(node.expression, objectBindings, seen);
	}

	if (ts.isObjectLiteralExpression(node)) {
		return evaluateSiteObject(node, objectBindings, seen);
	}

	if (ts.isIdentifier(node)) {
		if (seen.has(node.text)) return null;
		const boundObject = objectBindings.get(node.text);
		if (!boundObject) return null;
		seen.add(node.text);
		const evaluated = evaluateSiteObject(boundObject, objectBindings, seen);
		seen.delete(node.text);
		return evaluated;
	}

	return null;
}

function evaluateSiteObject(
	objectNode: ts.ObjectLiteralExpression,
	objectBindings: Map<string, ts.ObjectLiteralExpression>,
	seen: Set<string>,
): SeoSiteConfig {
	const result: SeoSiteConfig = {};

	for (const property of objectNode.properties) {
		if (ts.isSpreadAssignment(property)) {
			const spreadValue = evaluateSiteNode(
				property.expression,
				objectBindings,
				seen,
			);
			if (spreadValue) Object.assign(result, spreadValue);
			continue;
		}

		if (!ts.isPropertyAssignment(property)) continue;
		const key = getPropertyName(property.name);
		if (!key) continue;
		if (key === "url") {
			const value = readStringLiteral(property.initializer);
			if (value) result.url = value;
		}
		if (key === "indexable") {
			const value = readBooleanLiteral(property.initializer);
			if (value !== null) result.indexable = value;
		}
	}

	return result;
}

function readObjectProperty(
	node: ts.ObjectLiteralExpression,
	key: string,
): ts.Expression | null {
	for (const property of node.properties) {
		if (!ts.isPropertyAssignment(property)) continue;
		if (getPropertyName(property.name) === key) return property.initializer;
	}
	return null;
}

function getPropertyName(name: ts.PropertyName): string | null {
	if (
		ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNoSubstitutionTemplateLiteral(name)
	) {
		return name.text;
	}
	return null;
}

function readStringLiteral(node: ts.Expression): string | null {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return node.text;
	}
	return null;
}

function readBooleanLiteral(node: ts.Expression): boolean | null {
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	return null;
}

const errors = findings.filter((finding) => finding.level === "error");
const warnings = findings.filter((finding) => finding.level === "warning");

if (process.argv.includes("--json")) {
	// One object per finding: `code` is stable, `file` is repo-relative, and
	// content findings carry the `field` and a `fix`.
	console.log(
		JSON.stringify(
			{ book, ok: errors.length === 0, findings: [...errors, ...warnings] },
			null,
			2,
		),
	);
} else {
	report("warning", warnings);
	report("error", errors);
}

const shouldFail = mode === "error" && errors.length > 0;

process.exit(shouldFail ? 1 : 0);

function report(label: "warning" | "error", items: Finding[]) {
	if (items.length === 0) return;
	console.log(`\n${label.toUpperCase()}S (${items.length})`);
	// One line per file, so a tool missing five fields reads as one gap.
	const lines = items.map((item) =>
		item.file
			? `${item.message}: ${join(workspaceRoot, item.file)}`
			: item.message,
	);
	for (const line of groupFindingsByFile(lines)) console.log(`- ${line}`);
}
