import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { checkBookContent } from "../packages/astro-bookkit/src/validators/book-validator";
import { optionalArg, requireArg } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";

type SeoSiteConfig = {
	url?: string;
	indexable?: boolean;
};

const book = requireArg("--book");
const mode = optionalArg("--mode") ?? "warn";
const noDrafts = process.argv.includes("--no-drafts");

const workspaceRoot = join(import.meta.dir, "..");

const findings: Finding[] = [];
const error = (message: string, code: string) =>
	findings.push({ level: "error", code, message });

// Content and frame findings come from the engine (validators/book-validator.ts),
// the same function MCP and generated projects call.
for (const finding of checkBookContent({
	workspaceRoot,
	bookSlug: book,
	releaseMode: noDrafts,
}).findings) {
	findings.push({
		...finding,
		file: finding.file ? relative(workspaceRoot, finding.file) : undefined,
	});
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
