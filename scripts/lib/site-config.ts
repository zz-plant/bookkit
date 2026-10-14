import ts from "typescript";

export type SeoSiteConfig = {
	url?: string;
	indexable?: boolean;
};

/**
 * Reads `bookConfig.site.url` and `bookConfig.site.indexable` from a
 * book.config.ts source without running it. Follows the shapes authors write:
 * `{ ... } as const`, `site: sharedSite`, `{ site }`, and spreads. Values that
 * are not literals (`indexable: isProduction`) are left unset.
 */
export function extractSiteConfig(source: string): SeoSiteConfig | null {
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
			const initializer = unwrapExpression(declaration.initializer);
			if (!ts.isObjectLiteralExpression(initializer)) continue;
			objectBindings.set(declaration.name.text, initializer);
			if (declaration.name.text === "bookConfig") {
				bookConfigObject = initializer;
			}
		}
	}

	if (!bookConfigObject) return null;

	const siteNode = readObjectProperty(bookConfigObject, "site");
	if (!siteNode) return null;

	return evaluateSiteNode(siteNode, objectBindings, new Set());
}

/** Strips `( )`, `as`, and `satisfies`, none of which change the value. */
function unwrapExpression(node: ts.Expression): ts.Expression {
	let current = node;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

function evaluateSiteNode(
	input: ts.Expression,
	objectBindings: Map<string, ts.ObjectLiteralExpression>,
	seen: Set<string>,
): SeoSiteConfig | null {
	const node = unwrapExpression(input);

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
		// `{ site }` names a binding; evaluateSiteNode resolves the identifier.
		if (ts.isShorthandPropertyAssignment(property)) {
			if (property.name.text === key) return property.name;
			continue;
		}
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
