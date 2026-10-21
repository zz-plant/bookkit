import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { listBookDirs, listPackageDirs, repoRoot } from "./_lib";
import { exitOnHelp } from "./lib/cli";
import type { GovernanceResult } from "./lib/governance-output";

/**
 * Architecture documentation gate.
 *
 * `docs/architecture.md` is the canonical description of how this workspace is
 * put together. Prose drifts silently; this check makes the drift fail CI.
 *
 * It verifies five claims the document makes:
 *   1. the engine module map lists every module directory, and only real ones
 *   2. no engine module directory is empty (a phantom module is a doc lie)
 *   3. imports only ever point down a tier, so the documented layering is real
 *   4. the declared import cycles match the cycles that actually exist
 *   5. the workspace layout and content sections match the tree on disk
 */

exitOnHelp({
	summary:
		"Checks docs/architecture.md against the code: the engine module map,\nthat imports only point down a tier, the declared import cycles, and\nthe workspace layout.",
	usage: ["bun run check:architecture [--json]"],
	options: [["--json", "The result as JSON"]],
	examples: ["bun run check:architecture"],
});

const jsonMode = process.argv.includes("--json");
const root = repoRoot();
const docPath = join(root, "docs", "architecture.md");
const engineSrc = join(root, "packages", "astro-bookkit", "src");

const errors: string[] = [];
const warnings: string[] = [];

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

/** Reads a `<!-- architecture:<name>:start -->` … `:end` region from the doc. */
const readRegion = (source: string, name: string): string | null => {
	const start = `<!-- architecture:${name}:start -->`;
	const end = `<!-- architecture:${name}:end -->`;
	const from = source.indexOf(start);
	const to = source.indexOf(end);
	if (from === -1 || to === -1 || to < from) return null;
	return source.slice(from + start.length, to);
};

/** Every `` `token` `` on a line, without the backticks. */
const backtickedTokens = (line: string): string[] =>
	[...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

if (!existsSync(docPath)) {
	console.error(
		`Missing canonical architecture document: ${relative(root, docPath)}\n` +
			"Create it, or drop `bun run check:architecture` from package.json and CI.",
	);
	process.exit(1);
}

const doc = readFileSync(docPath, "utf8");

const requiredRegions = ["modules", "cycles", "workspace", "content"] as const;
for (const region of requiredRegions) {
	if (readRegion(doc, region) === null) {
		errors.push(
			`docs/architecture.md is missing the machine-checked region "${region}".\n` +
				`Wrap the section in <!-- architecture:${region}:start --> … <!-- architecture:${region}:end --> so this gate can verify it.`,
		);
	}
}

if (errors.length > 0) {
	report();
}

// ---------------------------------------------------------------------------
// Claim 1 + 2 — engine module map
// ---------------------------------------------------------------------------

const sourceExtensions = new Set([".ts", ".tsx", ".astro", ".css"]);

const listFilesDeep = (dir: string): string[] => {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFilesDeep(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
};

const actualModules = readdirSync(engineSrc, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

const moduleRegion = readRegion(doc, "modules") ?? "";
const documentedModules = new Set<string>();
const documentedTiers = new Map<string, number>();
for (const line of moduleRegion.split(/\r?\n/)) {
	if (!line.trimStart().startsWith("|")) continue;
	const [first] = backtickedTokens(line);
	if (!first?.endsWith("/")) continue;
	const moduleName = first.slice(0, -1);
	documentedModules.add(moduleName);

	const cells = line
		.split("|")
		.map((cell) => cell.trim())
		.filter(Boolean);
	const tier = Number(cells[1]);
	if (Number.isInteger(tier)) {
		documentedTiers.set(moduleName, tier);
	} else {
		errors.push(
			`Module map row for "${moduleName}/" has no integer tier in its second column.\n` +
				"Every module needs a tier so the import-direction rule can be checked.",
		);
	}
}

for (const moduleName of actualModules) {
	if (!documentedModules.has(moduleName)) {
		errors.push(
			`Engine module "packages/astro-bookkit/src/${moduleName}/" is not in the module map.\n` +
				"Add a row to the module map in docs/architecture.md describing what it owns.",
		);
	}
}

for (const moduleName of [...documentedModules].sort()) {
	if (!actualModules.includes(moduleName)) {
		errors.push(
			`Module map documents "packages/astro-bookkit/src/${moduleName}/", which does not exist.\n` +
				"Remove the row, or restore the module.",
		);
	}
}

for (const moduleName of actualModules) {
	const files = listFilesDeep(join(engineSrc, moduleName));
	const hasSource = files.some((file) => sourceExtensions.has(extname(file)));
	if (!hasSource) {
		warnings.push(
			`Engine module "packages/astro-bookkit/src/${moduleName}/" contains no source files. ` +
				"An empty module directory is a placeholder the map has to carry — delete it, or implement it.",
		);
	}
}

// ---------------------------------------------------------------------------
// Claim 3 — import cycles between engine modules
// ---------------------------------------------------------------------------

/**
 * Value-level imports only. Type-only edges are erased at build time and do not
 * constrain module layering, so they are excluded from the cycle graph.
 */
const isTypeOnlyImport = (statement: string): boolean => {
	if (/^\s*(?:import|export)\s+type\b/.test(statement)) return true;
	const braces = statement.match(/\{([^}]*)\}/);
	if (!braces) return false;
	const specifiers = braces[1]
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	if (specifiers.length === 0) return false;
	// A default or namespace import alongside braces is still a value import.
	if (
		/(?:import|export)\s+(?:\w+\s*,|\*\s+as\s+\w+\s*,)\s*\{/.test(statement)
	) {
		return false;
	}
	return specifiers.every((specifier) => /^type\s+/.test(specifier));
};

const moduleOfFile = (file: string): string | null => {
	const rel = relative(engineSrc, file);
	if (rel.startsWith("..")) return null;
	const [head, ...rest] = rel.split(sep);
	return rest.length > 0 ? head : null;
};

const resolveSpecifierToModule = (
	fromFile: string,
	specifier: string,
): string | null => {
	if (!specifier.startsWith(".")) return null;
	const resolved = resolve(dirname(fromFile), specifier);
	const rel = relative(engineSrc, resolved);
	if (rel.startsWith("..") || rel === "") return null;
	const [head] = rel.split(sep);
	return actualModules.includes(head) ? head : null;
};

const importEdges = new Map<string, Set<string>>();
for (const moduleName of actualModules) importEdges.set(moduleName, new Set());

const importPattern =
	/(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*["']([^"']+)["']/g;

for (const moduleName of actualModules) {
	for (const file of listFilesDeep(join(engineSrc, moduleName))) {
		const ext = extname(file);
		if (ext !== ".ts" && ext !== ".tsx" && ext !== ".astro") continue;
		if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;

		const source = readFileSync(file, "utf8");
		const owner = moduleOfFile(file) ?? moduleName;

		for (const match of source.matchAll(importPattern)) {
			const statement = match[0];
			if (isTypeOnlyImport(statement)) continue;
			const target = resolveSpecifierToModule(file, match[1]);
			if (!target || target === owner) continue;
			importEdges.get(owner)?.add(target);
		}
	}
}

/** Tarjan strongly-connected components; groups of 2+ are import cycles. */
const findCycleGroups = (): string[][] => {
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const groups: string[][] = [];
	let counter = 0;

	const strongConnect = (node: string) => {
		index.set(node, counter);
		low.set(node, counter);
		counter += 1;
		stack.push(node);
		onStack.add(node);

		for (const next of importEdges.get(node) ?? []) {
			if (!index.has(next)) {
				strongConnect(next);
				low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
			} else if (onStack.has(next)) {
				low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
			}
		}

		if (low.get(node) === index.get(node)) {
			const group: string[] = [];
			let member: string | undefined;
			do {
				member = stack.pop();
				if (member === undefined) break;
				onStack.delete(member);
				group.push(member);
			} while (member !== node);
			if (group.length > 1) groups.push(group.sort());
		}
	};

	for (const node of actualModules) {
		if (!index.has(node)) strongConnect(node);
	}

	return groups.sort((a, b) => a.join().localeCompare(b.join()));
};

const groupKey = (group: string[]): string => [...group].sort().join(" + ");

const actualCycles = findCycleGroups();
const actualCycleKeys = new Set(actualCycles.map(groupKey));

const cycleRegion = readRegion(doc, "cycles") ?? "";
const declaredCycleKeys = new Set<string>();
for (const line of cycleRegion.split(/\r?\n/)) {
	if (!line.trimStart().startsWith("-")) continue;
	const tokens = backtickedTokens(line).filter((token) =>
		actualModules.includes(token),
	);
	if (tokens.length > 1) declaredCycleKeys.add(groupKey(tokens));
}

for (const key of actualCycleKeys) {
	if (!declaredCycleKeys.has(key)) {
		errors.push(
			`Undeclared engine import cycle: ${key}.\n` +
				"Break the cycle, or document it in the declared-cycles list in docs/architecture.md with the reason it is tolerated.",
		);
	}
}

for (const key of declaredCycleKeys) {
	if (!actualCycleKeys.has(key)) {
		warnings.push(
			`Declared import cycle "${key}" no longer exists. Remove it from docs/architecture.md.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Claim 3 — imports point down a tier
// ---------------------------------------------------------------------------

/**
 * Tiers make the layering falsifiable: a module may only import from a strictly
 * lower tier. Same-tier imports are legal only between modules that share a
 * declared cycle, because a cycle has no internal ordering to respect.
 */
const cycleGroupOf = new Map<string, string>();
for (const group of actualCycles) {
	for (const member of group) cycleGroupOf.set(member, groupKey(group));
}

for (const [from, targets] of importEdges) {
	const fromTier = documentedTiers.get(from);
	if (fromTier === undefined) continue;

	for (const to of targets) {
		const toTier = documentedTiers.get(to);
		if (toTier === undefined) continue;

		const sharedCycle =
			cycleGroupOf.has(from) && cycleGroupOf.get(from) === cycleGroupOf.get(to);
		if (sharedCycle) {
			if (fromTier !== toTier) {
				errors.push(
					`Modules "${from}/" and "${to}/" are in the same import cycle but sit on different tiers (${fromTier} vs ${toTier}).\n` +
						"Members of a cycle share one tier. Fix the tiers in docs/architecture.md.",
				);
			}
			continue;
		}

		if (fromTier <= toTier) {
			errors.push(
				`Import direction violation: "${from}/" (tier ${fromTier}) imports "${to}/" (tier ${toTier}).\n` +
					"A module may only import strictly lower tiers. Move the shared code down a tier, invert the dependency, or correct the tiers in docs/architecture.md.",
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Claim 4 — workspace layout and content sections
// ---------------------------------------------------------------------------

const workspaceRegion = readRegion(doc, "workspace") ?? "";
const documentedPaths = new Set<string>();
for (const line of workspaceRegion.split(/\r?\n/)) {
	for (const token of backtickedTokens(line)) {
		if (!token.includes("/")) continue;
		if (token.includes("<") || token.includes("*")) continue;
		documentedPaths.add(token.replace(/\/$/, ""));
	}
}

for (const documented of [...documentedPaths].sort()) {
	const target = join(root, documented);
	if (!existsSync(target)) {
		errors.push(
			`docs/architecture.md documents workspace path "${documented}", which does not exist.`,
		);
	}
}

for (const packageDir of listPackageDirs()) {
	if (!documentedPaths.has(`packages/${packageDir}`)) {
		errors.push(
			`Workspace package "packages/${packageDir}" is not described in docs/architecture.md.`,
		);
	}
}

const contentRegion = readRegion(doc, "content") ?? "";
const documentedSections = new Set<string>();
for (const line of contentRegion.split(/\r?\n/)) {
	if (!line.trimStart().startsWith("|")) continue;
	const [first] = backtickedTokens(line);
	if (!first?.endsWith("/")) continue;
	documentedSections.add(first.slice(0, -1));
}

for (const book of listBookDirs()) {
	const contentRoot = join(root, "apps", book, "src", "content", "book");
	if (!existsSync(contentRoot)) continue;

	const sections = readdirSync(contentRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	for (const section of sections) {
		if (!documentedSections.has(section)) {
			errors.push(
				`Book "${book}" has content section "${section}/" that docs/architecture.md does not describe.\n` +
					"Add it to the content-section table, or move the directory out of the content bindings layer.",
			);
		}
	}

	for (const section of documentedSections) {
		const sectionPath = join(contentRoot, section);
		if (!existsSync(sectionPath) || !statSync(sectionPath).isDirectory()) {
			warnings.push(
				`Book "${book}" is missing documented content section "${section}/".`,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

report();

function report(): never {
	if (jsonMode) {
		// Every finding here is about the doc/tree relationship rather than one
		// source line, so the location is always the canonical document itself.
		const rule = "docs/architecture.md must describe the workspace as it is";
		const toFindings = (messages: string[]) =>
			messages.map((message) => ({
				message,
				location: { file: "docs/architecture.md" },
				rule,
			}));

		const result: GovernanceResult = {
			ok: errors.length === 0,
			exitCode: errors.length === 0 ? 0 : 1,
			summary:
				errors.length === 0
					? `${warnings.length} warning(s)`
					: `${errors.length} error(s), ${warnings.length} warning(s)`,
			errors: toFindings(errors),
			warnings: toFindings(warnings),
		};

		console.log(JSON.stringify(result, null, 2));
		process.exit(result.exitCode);
	}

	if (warnings.length > 0) {
		console.log(`\nARCHITECTURE DOC WARNINGS (${warnings.length})`);
		for (const warning of warnings) console.log(`- ${warning}`);
	}

	if (errors.length > 0) {
		console.error(`\nARCHITECTURE DOC DRIFT (${errors.length})`);
		for (const error of errors) console.error(`- ${error}`);
		console.error(
			"\ndocs/architecture.md is canonical. Fix the document or the code so they agree.",
		);
		process.exit(1);
	}

	console.log(
		`Architecture doc check passed (${actualModules.length} engine modules, ` +
			`${actualCycles.length} declared import cycle(s), ${documentedSections.size} content sections verified).`,
	);
	process.exit(0);
}
