import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { optionalArg, requireArg } from "./_lib";

type FrontmatterValue = string | string[] | number | boolean | null;

type Frontmatter = {
  data: Record<string, FrontmatterValue>;
  hasFrontmatter: boolean;
};

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

const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
const toolkitFiles = listContentFiles(join(bookRoot, "toolkit"));
const exampleFiles = listContentFiles(join(bookRoot, "examples"));

const mechanismSlugs = new Set<string>();

for (const file of mechanismFiles) {
  const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
  if (!hasFrontmatter) {
    errors.push(`Mechanism missing frontmatter: ${file}`);
    continue;
  }
  const slug = toStringValue(data.slug);
  if (!slug) errors.push(`Mechanism missing slug: ${file}`);
  if (!toStringValue(data.title)) errors.push(`Mechanism missing title: ${file}`);
  if (!toStringValue(data.definition)) warnings.push(`Mechanism missing definition: ${file}`);
  if (!arrayValue(data.is)) warnings.push(`Mechanism missing is list: ${file}`);
  if (!arrayValue(data.isNot)) warnings.push(`Mechanism missing isNot list: ${file}`);
  if (!arrayValue(data.predictions)) warnings.push(`Mechanism missing predictions list: ${file}`);
  if (!arrayValue(data.tests)) warnings.push(`Mechanism missing tests list: ${file}`);
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
  if (!toStringValue(data.name)) errors.push(`Tool missing name: ${file}`);
  if (!toStringValue(data.trigger)) warnings.push(`Tool missing trigger: ${file}`);
  if (!data.timeboxMinutes) warnings.push(`Tool missing timeboxMinutes: ${file}`);
  if (!arrayValue(data.steps)) warnings.push(`Tool missing steps list: ${file}`);
  if (!arrayValue(data.failureLooksLike)) warnings.push(`Tool missing failureLooksLike list: ${file}`);
  if (!arrayValue(data.legitimateDemand)) warnings.push(`Tool missing legitimateDemand list: ${file}`);
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
  if (!toStringValue(data.domain)) warnings.push(`Example missing domain: ${file}`);
  if (!toStringValue(data.title)) warnings.push(`Example missing title: ${file}`);
  const status = toStringValue(data.status);
  if (noDrafts && status === "draft") {
    errors.push(`Draft examples are forbidden in release mode: ${file}`);
  }
  if (mechanism && !mechanismSlugs.has(mechanism)) {
    errors.push(`Example references unknown mechanism "${mechanism}": ${file}`);
  }
}


const bookConfigPath = join(workspaceRoot, "apps", book, "src", "book.config.ts");
if (existsSync(bookConfigPath)) {
  const configSource = readFileSync(bookConfigPath, "utf8");
  const siteConfig = extractSiteConfig(configSource);
  const indexableFalse = siteConfig?.indexable === false;
  const siteUrl = siteConfig?.url?.trim();
  const localSiteUrl = !!siteUrl && /localhost|127\.0\.0\.1|\.local(?=[:/]|$)/i.test(siteUrl);

  const requireProdSeo = noDrafts && process.env.BOOKKIT_REQUIRE_INDEXABLE_PROD === "true";

  if (requireProdSeo && indexableFalse) {
    errors.push(
      `Release validation failed: apps/${book}/src/book.config.ts has site.indexable set to false. Set indexable: true for production.`
    );
  }

  if (requireProdSeo && (!siteUrl || localSiteUrl)) {
    errors.push(
      `Release validation failed: apps/${book}/src/book.config.ts must define a public site.url for production builds.`
    );
  }
}

function extractSiteConfig(source: string): SeoSiteConfig | null {
  const sourceFile = ts.createSourceFile("book.config.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const objectBindings = new Map<string, ts.ObjectLiteralExpression>();
  let bookConfigObject: ts.ObjectLiteralExpression | null = null;

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
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
  seen: Set<string>
): SeoSiteConfig | null {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
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
  seen: Set<string>
): SeoSiteConfig {
  const result: SeoSiteConfig = {};

  for (const property of objectNode.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadValue = evaluateSiteNode(property.expression, objectBindings, seen);
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

function readObjectProperty(node: ts.ObjectLiteralExpression, key: string): ts.Expression | null {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (getPropertyName(property.name) === key) return property.initializer;
  }
  return null;
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
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

report("warning", warnings);
report("error", errors);

const hasErrors = errors.length > 0;
const shouldFail = mode === "error" && hasErrors;

process.exit(shouldFail ? 1 : 0);

function report(label: "warning" | "error", items: string[]) {
  if (items.length === 0) return;
  console.log(`\n${label.toUpperCase()}S (${items.length})`);
  for (const item of items) console.log(`- ${item}`);
}

function listContentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listContentFiles(fullPath));
    } else if (entry.isFile() && isContentFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isContentFile(path: string): boolean {
  if (path.endsWith(".md") || path.endsWith(".mdx")) return true;
  return false;
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) {
    return { data: {}, hasFrontmatter: false };
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { data: {}, hasFrontmatter: false };
  const raw = content.slice(3, end).trim();
  const lines = raw.split(/\r?\n/);
  const data: Record<string, FrontmatterValue> = {};
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
        data[key] = coerceValue(valueRaw);
        currentKey = null;
      }
      continue;
    }
    const listMatch = /^-\s*(.*)$/.exec(trimmed);
    if (listMatch && currentKey) {
      const current = data[currentKey];
      if (Array.isArray(current)) current.push(coerceValue(listMatch[1]) as string);
    }
  }

  return { data, hasFrontmatter: true };
}

function coerceValue(value: string): FrontmatterValue {
  const cleaned = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (cleaned !== "" && !Number.isNaN(Number(cleaned))) return Number(cleaned);
  return cleaned;
}

function toStringValue(value: FrontmatterValue): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function arrayValue(value: FrontmatterValue): string[] {
  if (Array.isArray(value)) return value.filter((item) => item.length > 0);
  return [];
}
