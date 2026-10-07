import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { optionalArg, requireArg } from "./_lib";
import { groupFindingsByFile, toFindings } from "./lib/authoring";
import {
	arrayValue,
	listContentFiles,
	parseFrontmatter,
	toStringValue,
} from "./lib/content-frontmatter";

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

const errors: string[] = [];
const warnings: string[] = [];

for (const dir of requiredDirs) {
	const fullPath = join(bookRoot, dir);
	if (!existsSync(fullPath)) {
		errors.push(`Missing required directory: ${fullPath}`);
	}
}

import {
	defaultFrames,
	validateFrameSteps,
} from "../packages/astro-bookkit/src";
import {
	chapterSchema,
	exampleSchema,
	glossarySchema,
	mechanismSchema,
	toolkitSchema,
} from "../packages/astro-bookkit/src/schemas";
import { extractFrameConfigFromSource } from "../packages/astro-bookkit/src/validators/frame-config";

const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
const toolkitFiles = listContentFiles(join(bookRoot, "toolkit"));
const exampleFiles = listContentFiles(join(bookRoot, "examples"));
const chapterFiles = listContentFiles(join(bookRoot, "chapters"));
const glossaryFiles = listContentFiles(join(bookRoot, "glossary"));

const mechanismSlugs = new Set<string>();

for (const file of mechanismFiles) {
	const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
	if (!hasFrontmatter) {
		errors.push(`Mechanism missing frontmatter: ${file}`);
		continue;
	}
	const slug = toStringValue(data.slug);
	if (!slug) errors.push(`Mechanism missing slug: ${file}`);
	if (!toStringValue(data.title))
		errors.push(`Mechanism missing title: ${file}`);
	if (!toStringValue(data.definition))
		warnings.push(`Mechanism missing definition: ${file}`);
	if (!arrayValue(data.is).length)
		warnings.push(`Mechanism missing is list: ${file}`);
	if (!arrayValue(data.isNot).length)
		warnings.push(`Mechanism missing isNot list: ${file}`);
	if (!arrayValue(data.predictions).length)
		warnings.push(`Mechanism missing predictions list: ${file}`);
	if (!arrayValue(data.tests).length)
		warnings.push(`Mechanism missing tests list: ${file}`);

	const parsed = mechanismSchema.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			warnings.push(
				`Mechanism schema issue (${file}): ${issue.path.join(".")} - ${issue.message}`,
			);
		}
	}

	if (slug) mechanismSlugs.add(slug);
}

for (const file of toolkitFiles) {
	const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
	if (!hasFrontmatter) {
		errors.push(`Tool missing frontmatter: ${file}`);
		continue;
	}
	if (!toStringValue(data.slug)) errors.push(`Tool missing slug: ${file}`);
	const mechanism = toStringValue(data.mechanism);
	if (!mechanism) errors.push(`Tool missing mechanism: ${file}`);
	if (!toStringValue(data.name) && !toStringValue(data.title))
		errors.push(`Tool missing name: ${file}`);
	if (!toStringValue(data.trigger))
		warnings.push(`Tool missing trigger: ${file}`);
	if (!data.timeboxMinutes)
		warnings.push(`Tool missing timeboxMinutes: ${file}`);
	if (!arrayValue(data.steps).length)
		warnings.push(`Tool missing steps list: ${file}`);
	if (!arrayValue(data.failureLooksLike).length)
		warnings.push(`Tool missing failureLooksLike list: ${file}`);
	if (!arrayValue(data.legitimateDemand).length)
		warnings.push(`Tool missing legitimateDemand list: ${file}`);

	const parsed = toolkitSchema.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			if (issue.path[0] === "timeboxMinutes") {
				errors.push(
					`Action primitive timebox error (${file}): ${issue.message}`,
				);
			} else {
				warnings.push(
					`Tool schema issue (${file}): ${issue.path.join(".")} - ${issue.message}`,
				);
			}
		}
	}

	if (mechanism && !mechanismSlugs.has(mechanism)) {
		errors.push(`Tool references unknown mechanism "${mechanism}": ${file}`);
	}
}

for (const file of exampleFiles) {
	const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
	if (!hasFrontmatter) {
		errors.push(`Example missing frontmatter: ${file}`);
		continue;
	}
	const mechanism = toStringValue(data.mechanism);
	if (!mechanism) errors.push(`Example missing mechanism: ${file}`);
	if (!toStringValue(data.domain))
		warnings.push(`Example missing domain: ${file}`);
	if (!toStringValue(data.title))
		warnings.push(`Example missing title: ${file}`);
	const status = toStringValue(data.status);
	if (noDrafts && status === "draft") {
		errors.push(`Draft examples are forbidden in release mode: ${file}`);
	}

	const parsed = exampleSchema.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			warnings.push(
				`Example schema issue (${file}): ${issue.path.join(".")} - ${issue.message}`,
			);
		}
	}

	if (mechanism && !mechanismSlugs.has(mechanism)) {
		errors.push(`Example references unknown mechanism "${mechanism}": ${file}`);
	}
}

for (const file of chapterFiles) {
	const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
	if (!hasFrontmatter) {
		errors.push(`Chapter missing frontmatter: ${file}`);
		continue;
	}
	if (!toStringValue(data.slug)) errors.push(`Chapter missing slug: ${file}`);
	if (!toStringValue(data.title)) errors.push(`Chapter missing title: ${file}`);
	const parsed = chapterSchema.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			warnings.push(
				`Chapter schema issue (${file}): ${issue.path.join(".")} - ${issue.message}`,
			);
		}
	}
}

for (const file of glossaryFiles) {
	const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
	if (!hasFrontmatter) {
		errors.push(`Glossary missing frontmatter: ${file}`);
		continue;
	}
	const parsed = glossarySchema.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			warnings.push(
				`Glossary schema issue (${file}): ${issue.path.join(".")} - ${issue.message}`,
			);
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
			warnings.push(
				`Framing chapter (00-overview.mdx) for frame "${frame.slug}" is missing required step(s): ${frameResult.missingRequiredSteps.join(", ")}`,
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
		errors.push(
			`Release validation failed: apps/${book}/src/book.config.ts has site.indexable set to false. Set indexable: true for production.`,
		);
	}

	if (requireProdSeo && (!siteUrl || localSiteUrl)) {
		errors.push(
			`Release validation failed: apps/${book}/src/book.config.ts must define a public site.url for production builds.`,
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

if (process.argv.includes("--json")) {
	// One object per finding; `file` is repo-relative when the finding names one.
	console.log(
		JSON.stringify(
			{
				book,
				ok: errors.length === 0,
				findings: [
					...toFindings("error", errors),
					...toFindings("warning", warnings),
				],
			},
			null,
			2,
		),
	);
} else {
	report("warning", warnings);
	report("error", errors);
}

const hasErrors = errors.length > 0;
const shouldFail = mode === "error" && hasErrors;

process.exit(shouldFail ? 1 : 0);

function report(label: "warning" | "error", items: string[]) {
	if (items.length === 0) return;
	console.log(`\n${label.toUpperCase()}S (${items.length})`);
	// One line per file, so a tool missing five fields reads as one gap.
	for (const item of groupFindingsByFile(items)) console.log(`- ${item}`);
}
