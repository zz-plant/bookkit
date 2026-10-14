import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkBookContent } from "../packages/astro-bookkit/src/validators/book-validator";
import { optionalArg, requireArg } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";
import { extractSiteConfig } from "./lib/site-config";

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
