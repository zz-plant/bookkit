import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { listFilesRecursive } from "../../../scripts/_lib";
import {
	listShimPaths,
	shimTemplateRootIn,
} from "../../../scripts/_shim-templates";
import { PROJECT_STAMP } from "../../../scripts/lib/project";
import {
	scaffoldBook,
	starterAppFiles,
	starterTemplateRootIn,
	titleFromSlug,
} from "../../../scripts/lib/scaffold-book";
import { EXTRA_SCRIPT_FILES, vendoredScripts } from "./copied-scripts";

/**
 * What a standalone project is made of, and which parts belong to the
 * scaffolder. The engine (packages/astro-bookkit/), the vendored scripts, the
 * wrappers every book shares, tsconfig.base.json, bookkit.json, and the
 * script and dependency entries in package.json are the scaffolder's:
 * `--upgrade` replaces them. Everything else (content, book.config.ts, the
 * pages a book owns, README.md) is the author's and is never written twice.
 */

export const ENGINE_DIR = "packages/astro-bookkit";

/** The repo's package.json scripts a project gets: those that run a vendored script. */
export const PROJECT_SCRIPT_NAMES = [
	"bookkit",
	"dev",
	"build",
	"build:all",
	"deploy",
	"verify",
	"qa",
	"check",
	"check:build",
	"check:types",
	"check:separation",
	"check:shims",
	"sync:shims",
	"check:todos",
	"check:corpus",
	"check:concepts",
	"audit:unused",
	"check:runbooks",
	"validate",
	"validate:book",
	"validate:release",
	"new:book",
	"new:mechanism",
	"new:tool",
	"new:example",
	"remove:book",
	"propose",
	"compile:book",
	"export:gitbook",
	"list:books",
	"mcp",
] as const;

/** Short names earlier projects had; kept so their docs still work. */
const PROJECT_SCRIPT_ALIASES: Record<string, string> = {
	suggest: "bun run scripts/check-suggestions.ts",
	runbooks: "bun run scripts/check-runbooks.ts",
	import: "bun run scripts/import-book-from-markdown.ts",
};

/** The repo's dev dependencies a project needs: types, the TypeScript checks, and wrangler. */
const PROJECT_DEV_DEPENDENCIES = [
	"@astrojs/check",
	"@types/bun",
	"@types/node",
	"typescript",
	"typescript-native",
	"wrangler",
];

/**
 * Packages the project's root installs as well as the apps: scripts and
 * `bunx astro` resolve from the root, which Bun's isolated installs do not
 * share with the workspaces below it.
 */
const PROJECT_ROOT_PACKAGES = ["astro", "@astrojs/mdx"];

export type ProjectStamp = {
	$comment: string;
	engine: { version: string; commit?: string };
	/** Vendored scripts, relative to scripts/. */
	scripts: string[];
};

export type Source = {
	repoRoot: string;
	engineVersion: string;
	commit?: string;
	/** Exact version of each package in the repo's bun.lock. */
	versions: Map<string, string>;
	scripts: string[];
	scriptPackages: string[];
	packageManager?: string;
	rootScripts: Record<string, string>;
	rootDevDependencies: Record<string, string>;
	rootOptionalDependencies: Record<string, string>;
};

/** Reads bun.lock (JSON with trailing commas) into package → exact version. */
export const lockedVersions = (lockText: string): Map<string, string> => {
	const lock = JSON.parse(lockText.replace(/,(\s*[}\]])/g, "$1")) as {
		packages?: Record<string, [string, ...unknown[]]>;
	};
	const versions = new Map<string, string>();
	for (const [name, entry] of Object.entries(lock.packages ?? {})) {
		if (name.includes("/") && !name.startsWith("@")) continue;
		if (name.split("/").length > 2) continue;
		const resolved = entry[0];
		const at = resolved.lastIndexOf("@");
		if (at <= 0) continue;
		const realName = resolved.slice(0, at);
		const version = resolved.slice(at + 1);
		if (version.startsWith("workspace:")) continue;
		versions.set(
			name,
			realName === name ? version : `npm:${realName}@${version}`,
		);
	}
	return versions;
};

const readJson = <T>(path: string): T =>
	JSON.parse(readFileSync(path, "utf8")) as T;

/** Everything the scaffolder copies from the bookkit repository it runs from. */
export const readSource = (repoRoot: string): Source => {
	const versions = lockedVersions(
		readFileSync(join(repoRoot, "bun.lock"), "utf8"),
	);
	const repoPackage = readJson<{
		packageManager?: string;
		scripts: Record<string, string>;
		devDependencies: Record<string, string>;
	}>(join(repoRoot, "package.json"));
	const engine = readJson<{
		version: string;
		optionalDependencies?: Record<string, string>;
	}>(join(repoRoot, ENGINE_DIR, "package.json"));
	const vendored = vendoredScripts(repoRoot);
	if (vendored.unresolved.length > 0) {
		throw new Error(
			`Scripts import files a project would not have:\n  ${vendored.unresolved.join("\n  ")}`,
		);
	}
	const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	const pin = (name: string) => {
		const version = versions.get(name);
		if (!version) {
			throw new Error(
				`${name} is not in ${join(repoRoot, "bun.lock")}. Run bun install in the bookkit repository first.`,
			);
		}
		return version;
	};
	const rootScripts: Record<string, string> = {};
	for (const name of PROJECT_SCRIPT_NAMES) {
		const command = repoPackage.scripts[name];
		if (!command) {
			throw new Error(
				`The repository's package.json has no "${name}" script for the project to copy.`,
			);
		}
		rootScripts[name] = command;
	}
	Object.assign(rootScripts, PROJECT_SCRIPT_ALIASES);
	// A package a script imports must resolve from the project's root, so the
	// root declares each one at the version in the repository's lockfile, even
	// when the repository reaches it only through another package.
	const optional = vendored.packages.filter(
		(name) => engine.optionalDependencies?.[name],
	);
	const unlocked = vendored.packages.filter((name) => !versions.has(name));
	if (unlocked.length > 0) {
		throw new Error(
			`Scripts import ${unlocked.join(", ")}, which ${join(repoRoot, "bun.lock")} does not have. Add each to the repository's devDependencies and run bun install.`,
		);
	}
	const pinned = (names: string[]) =>
		Object.fromEntries(
			[...new Set(names)].sort().map((name) => [name, pin(name)]),
		);
	const rootDevDependencies = pinned([
		...PROJECT_DEV_DEPENDENCIES,
		...PROJECT_ROOT_PACKAGES,
		...vendored.packages.filter((name) => !optional.includes(name)),
	]);
	return {
		repoRoot,
		engineVersion: engine.version,
		commit: git.status === 0 ? git.stdout.trim() : undefined,
		versions,
		scripts: [...vendored.files, ...EXTRA_SCRIPT_FILES].sort(),
		scriptPackages: vendored.packages,
		packageManager: repoPackage.packageManager,
		rootScripts,
		rootDevDependencies,
		rootOptionalDependencies: pinned(optional),
	};
};

/** A project made by create-bookkit, or one laid out like it (from before bookkit.json). */
export const isBookkitProject = (dir: string): boolean => {
	const engine = join(dir, ENGINE_DIR, "package.json");
	if (!existsSync(engine) || !existsSync(join(dir, "apps"))) return false;
	try {
		return (
			readJson<{ name?: string }>(engine).name === "@bookkit/astro-bookkit"
		);
	} catch {
		return false;
	}
};

/** The bookkit repository itself, which --upgrade must never rewrite. */
export const isBookkitRepository = (dir: string): boolean =>
	existsSync(join(dir, "packages", "create-bookkit", "package.json"));

export const readStamp = (dir: string): ProjectStamp | undefined => {
	const path = join(dir, PROJECT_STAMP);
	if (!existsSync(path)) return undefined;
	try {
		return readJson<ProjectStamp>(path);
	} catch {
		return undefined;
	}
};

const engineLabel = (stamp: ProjectStamp["engine"] | undefined) =>
	stamp
		? `${stamp.version}${stamp.commit ? ` (${stamp.commit})` : ""}`
		: "unknown";

/** Installed packages and tool output, never part of the vendored engine. */
const GENERATED = /(^|\/)(node_modules|dist|\.astro)\//;

/** Engine files a project gets: no tests, no build output. */
const engineFiles = (repoRoot: string): string[] =>
	listFilesRecursive(join(repoRoot, ENGINE_DIR)).filter(
		(file) => !GENERATED.test(file) && !file.endsWith(".test.ts"),
	);

/** The app folders under apps/ that are books. */
export const projectBooks = (dir: string): string[] =>
	existsSync(join(dir, "apps"))
		? readdirSync(join(dir, "apps"), { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() &&
						existsSync(join(dir, "apps", entry.name, "src", "book.config.ts")),
				)
				.map((entry) => entry.name)
				.sort()
		: [];

/** A change the scaffolder made, for the summary it prints. */
export type Change = {
	path: string;
	action: "added" | "replaced" | "removed" | "unchanged";
	/** Where the author's edited copy of a replaced file was saved. */
	savedAs?: string;
};

/** Writes `content` to `root/rel`, reporting whether it was new or differed. */
const put = (
	root: string,
	rel: string,
	content: string | Buffer,
	changes: Change[],
) => {
	const path = join(root, rel);
	const before = existsSync(path) ? readFileSync(path) : undefined;
	const after = typeof content === "string" ? Buffer.from(content) : content;
	if (before?.equals(after)) {
		changes.push({ path: rel, action: "unchanged" });
		return;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, after);
	changes.push({ path: rel, action: before ? "replaced" : "added" });
};

/** The vendored engine's package.json: every dependency pinned to the repo's lockfile. */
const pinnedEnginePackage = (source: Source): string => {
	const pkg = readJson<Record<string, unknown>>(
		join(source.repoRoot, ENGINE_DIR, "package.json"),
	);
	for (const field of ["dependencies", "optionalDependencies"]) {
		const deps = pkg[field] as Record<string, string> | undefined;
		if (!deps) continue;
		for (const name of Object.keys(deps)) {
			deps[name] = source.versions.get(name) ?? deps[name];
		}
	}
	return `${JSON.stringify(pkg, null, "\t")}\n`;
};

/** Replaces the vendored engine, keeping installed packages; removes files it no longer has. */
export const writeEngine = (source: Source, dir: string): Change[] => {
	const changes: Change[] = [];
	const files = engineFiles(source.repoRoot);
	const wanted = new Set(files);
	const target = join(dir, ENGINE_DIR);
	if (existsSync(target)) {
		for (const file of listFilesRecursive(target)) {
			if (GENERATED.test(file) || wanted.has(file)) continue;
			rmSync(join(target, file));
			changes.push({ path: `${ENGINE_DIR}/${file}`, action: "removed" });
		}
	}
	for (const file of files) {
		put(
			dir,
			`${ENGINE_DIR}/${file}`,
			file === "package.json"
				? pinnedEnginePackage(source)
				: readFileSync(join(source.repoRoot, ENGINE_DIR, file)),
			changes,
		);
	}
	return changes;
};

/** Writes the vendored scripts; removes ones an earlier version vendored and this one does not. */
export const writeScripts = (
	source: Source,
	dir: string,
	previous: string[] = [],
): Change[] => {
	const changes: Change[] = [];
	for (const file of previous) {
		if (
			source.scripts.includes(file) ||
			!existsSync(join(dir, "scripts", file))
		)
			continue;
		rmSync(join(dir, "scripts", file));
		changes.push({ path: `scripts/${file}`, action: "removed" });
	}
	for (const file of source.scripts) {
		put(
			dir,
			`scripts/${file}`,
			readFileSync(join(source.repoRoot, "scripts", file)),
			changes,
		);
	}
	return changes;
};

/**
 * What the project's engine shared before an upgrade replaces it: its shims,
 * and each book's starter files as that engine wrote them, each by path in a
 * book app.
 */
export type PreviousEngine = {
	shims: Record<string, string>;
	starterFiles: Record<string, Record<string, string>>;
};

/** Reads the project's engine; call it before `writeEngine` replaces that engine. */
export const readPreviousEngine = (
	dir: string,
	books: string[],
): PreviousEngine => {
	const hasStarter = existsSync(starterTemplateRootIn(dir));
	return {
		shims: Object.fromEntries(
			listShimPaths(dir).map((shim) => [
				shim,
				readFileSync(join(shimTemplateRootIn(dir), shim), "utf8"),
			]),
		),
		starterFiles: Object.fromEntries(
			books.map((book) => [
				book,
				hasStarter ? starterAppFiles(dir, book, bookTitle(dir, book)) : {},
			]),
		),
	};
};

/**
 * Copies every shim into each book; returns what changed. With `previous`, a
 * file that engine did not share (such as the home page, once a starter
 * file) that the author edited is first saved beside it as
 * `_<name>.before-upgrade`, which Astro does not read.
 */
export const writeShims = (
	source: Source,
	dir: string,
	books: string[],
	previous?: PreviousEngine,
): Change[] => {
	const changes: Change[] = [];
	const shims = listShimPaths(source.repoRoot);
	for (const book of books) {
		const starter = previous?.starterFiles[book] ?? {};
		for (const shim of shims) {
			const rel = `apps/${book}/${shim}`;
			const content = readFileSync(
				join(source.repoRoot, ENGINE_DIR, "templates", "book-app", shim),
			);
			const current = existsSync(join(dir, rel))
				? readFileSync(join(dir, rel))
				: undefined;
			const editedByAuthor =
				current &&
				previous &&
				!(shim in previous.shims) &&
				!current.equals(content) &&
				current.toString() !== starter[shim];
			const savedAs = editedByAuthor
				? rel.replace(/[^/]+$/, (name) => `_${name}.before-upgrade`)
				: undefined;
			if (current && savedAs) put(dir, savedAs, current, []);
			put(dir, rel, content, changes);
			if (savedAs) changes[changes.length - 1].savedAs = savedAs;
		}
	}
	return changes;
};

/** Removes `path`'s folder and each parent up to `stop` while they are empty. */
const removeEmptyFolders = (path: string, stop: string) => {
	for (
		let folder = dirname(path);
		isInside(folder, stop) && folder !== stop;
	) {
		if (readdirSync(folder).length > 0) return;
		rmSync(folder, { recursive: true });
		folder = dirname(folder);
	}
};

/**
 * Removes from each book the files the previous engine shared (a shim, or a
 * starter file) that this one no longer writes: the routes, layout, and
 * runtime wiring the bookkit() integration now serves from the engine. A file
 * the author edited is first saved beside it as `_<name>.before-upgrade`,
 * which Astro does not read: left in place, it would replace the engine's
 * route and import files that are gone.
 */
export const removeRetiredAppFiles = (
	source: Source,
	dir: string,
	books: string[],
	previous: PreviousEngine,
): Change[] => {
	const changes: Change[] = [];
	const current = new Set([
		...listShimPaths(source.repoRoot),
		...listFilesRecursive(starterTemplateRootIn(source.repoRoot)),
	]);
	for (const book of books) {
		const starter = previous.starterFiles[book] ?? {};
		const retired = [
			...new Set([...Object.keys(previous.shims), ...Object.keys(starter)]),
		].filter((file) => !current.has(file));
		for (const file of retired.sort()) {
			const rel = `apps/${book}/${file}`;
			const path = join(dir, rel);
			if (!existsSync(path)) continue;
			const content = readFileSync(path, "utf8");
			const change: Change = { path: rel, action: "removed" };
			if (content !== previous.shims[file] && content !== starter[file]) {
				change.savedAs = rel.replace(
					/[^/]+$/,
					(name) => `_${name}.before-upgrade`,
				);
				put(dir, change.savedAs, content, []);
			}
			rmSync(path);
			removeEmptyFolders(path, join(dir, "apps", book));
			changes.push(change);
		}
	}
	return changes;
};

/**
 * Sets the scaffolder's entries in a package.json (its scripts, and pinned
 * versions of the dependencies it names) and keeps everything else.
 */
export const mergePackageJson = (
	existing: Record<string, unknown>,
	owned: {
		scripts?: Record<string, string>;
		devDependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
		pins?: Map<string, string>;
		fields?: Record<string, unknown>;
	},
): Record<string, unknown> => {
	const merged: Record<string, unknown> = { ...existing, ...owned.fields };
	if (owned.scripts) {
		merged.scripts = {
			...(existing.scripts as Record<string, string> | undefined),
			...owned.scripts,
		};
	}
	for (const field of ["devDependencies", "optionalDependencies"] as const) {
		const ours = owned[field];
		if (!ours || Object.keys(ours).length === 0) continue;
		merged[field] = {
			...(existing[field] as Record<string, string> | undefined),
			...ours,
		};
	}
	for (const field of ["dependencies", "devDependencies"]) {
		const deps = merged[field] as Record<string, string> | undefined;
		if (!deps || !owned.pins) continue;
		merged[field] = Object.fromEntries(
			Object.entries(deps).map(([name, range]) => [
				name,
				range.startsWith("workspace:")
					? range
					: (owned.pins?.get(name) ?? range),
			]),
		);
	}
	return merged;
};

const putJson = (dir: string, rel: string, value: unknown, changes: Change[]) =>
	put(dir, rel, `${JSON.stringify(value, null, "\t")}\n`, changes);

/** The root package.json, tsconfig.base.json and bookkit.json. */
export const writeRootFiles = (
	source: Source,
	dir: string,
	name: string,
): Change[] => {
	const changes: Change[] = [];
	const packagePath = join(dir, "package.json");
	const existing = existsSync(packagePath)
		? readJson<Record<string, unknown>>(packagePath)
		: {
				name,
				private: true,
				type: "module",
				workspaces: ["apps/*", "packages/*"],
			};
	putJson(
		dir,
		"package.json",
		mergePackageJson(existing, {
			scripts: source.rootScripts,
			devDependencies: source.rootDevDependencies,
			optionalDependencies: source.rootOptionalDependencies,
			fields: source.packageManager
				? { packageManager: source.packageManager }
				: {},
		}),
		changes,
	);
	put(
		dir,
		"tsconfig.base.json",
		readFileSync(join(source.repoRoot, "tsconfig.base.json")),
		changes,
	);
	// The repository's lockfile, so a project installs the versions the engine
	// is tested with; bun install drops what the project's workspaces do not use.
	put(
		dir,
		"bun.lock",
		readFileSync(join(source.repoRoot, "bun.lock")),
		changes,
	);
	const stamp: ProjectStamp = {
		$comment:
			"Written by create-bookkit. Its --upgrade replaces the engine, these scripts, the wrappers every book shares, and the scaffolder's package.json entries. It never writes book content.",
		engine: { version: source.engineVersion, commit: source.commit },
		scripts: source.scripts,
	};
	putJson(dir, PROJECT_STAMP, stamp, changes);
	return changes;
};

/** The book's title as book.config.ts writes it (the first `title:` string). */
export const configTitle = (source: string): string | undefined => {
	const match = source.match(
		/\btitle:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
	);
	if (!match) return undefined;
	const literal = match[1];
	if (literal.startsWith("'"))
		return literal.slice(1, -1).replace(/\\(.)/g, "$1");
	try {
		return JSON.parse(literal) as string;
	} catch {
		return literal.slice(1, -1);
	}
};

/** A book's title from its book.config.ts, else one made from its slug. */
const bookTitle = (dir: string, book: string): string =>
	configTitle(
		readFileSync(join(dir, "apps", book, "src", "book.config.ts"), "utf8"),
	) ?? titleFromSlug(book);

/**
 * Starter files a book does not have yet, such as a TODOS.md that
 * `check:todos` needs and older projects lack. A book's existing files are
 * its own and are never replaced.
 */
export const writeMissingStarterFiles = (
	dir: string,
	books: string[],
): Change[] => {
	const changes: Change[] = [];
	for (const book of books) {
		for (const [file, content] of Object.entries(
			starterAppFiles(dir, book, bookTitle(dir, book)),
		)) {
			const rel = `apps/${book}/${file}`;
			if (!existsSync(join(dir, rel))) put(dir, rel, content, changes);
		}
	}
	return changes;
};

/** Pins each book app's dependencies to the repository's versions. */
export const writeAppPackages = (
	source: Source,
	dir: string,
	books: string[],
): Change[] => {
	const changes: Change[] = [];
	for (const book of books) {
		const rel = `apps/${book}/package.json`;
		if (!existsSync(join(dir, rel))) continue;
		putJson(
			dir,
			rel,
			mergePackageJson(readJson(join(dir, rel)), { pins: source.versions }),
			changes,
		);
	}
	return changes;
};

/**
 * What to run in a new project, in an order that works: everything up to
 * the commit runs before `git init`, and deploy, which publishes from a
 * commit, comes after it.
 */
export const nextSteps = (
	target: string,
	{ installed, book }: { installed: boolean; book: string },
): string => `
Next:
  cd ${target}${installed ? "" : "\n  bun install"}
  bun run dev                    preview the book (Ctrl-C to stop)
  bun run bookkit check          what to fix or fill in
  git init && git add -A && git commit -m "Start ${book}"
                                 deploy publishes from a commit
  bun run deploy -- --dry-run    every check and the build, stopping before publishing
Agents: bun run mcp serves the book's tools; .mcp.json registers it.`;

const GITIGNORE = `node_modules/
dist/
.astro/
.bookkit/
.DS_Store
`;

/** Registers the project's stdio MCP server, so agents (Claude Code, Codex) offer its tools here. */
const MCP_JSON = `${JSON.stringify(
	{
		mcpServers: {
			bookkit: { command: "bun", args: ["run", "scripts/mcp-server.ts"] },
		},
	},
	null,
	"\t",
)}\n`;

const readme = (book: string, title: string) => `# ${title}

A book built with Bookkit. The engine is copied into \`packages/astro-bookkit/\`; it is not installed from a registry.

## Commands

\`\`\`bash
bun install
bun run dev                      # preview with live reload
bun run bookkit check            # structure, plus mechanisms that overlap across books
bun run verify -- --all          # every check: types, content, wrappers, build
git init && git add -A && git commit -m "First draft"   # deploy publishes from a commit
bun run deploy -- --dry-run      # check content, build, verify dist/, then stop before publishing
bun run bookkit help             # every command
\`\`\`

## Agents

\`bun run mcp\` serves the book's MCP tools over stdio: read the book, get a section's contract, check a file before writing it, write it, validate, and build. \`.mcp.json\` registers it, so Claude Code and other MCP clients offer the tools in this folder.

## Layout

- \`apps/${book}/src/book.config.ts\`: the author's decisions (frame, objectives, constraints).
- \`apps/${book}/src/content/book/\`: chapters, mechanisms, toolkit, examples, glossary, releases.
- \`apps/${book}/src/pages/\`: none to start; the engine serves every page, and a file here replaces its page at the same URL.
- \`packages/astro-bookkit/\`, \`scripts/\`, and the files \`bun run check:shims\` checks in each app: the engine's. \`bookkit.json\` records which engine version they came from.

## Updating the engine

From a clone of the bookkit repository:

\`\`\`bash
bun run packages/create-bookkit/src/index.ts <this-folder> --upgrade
\`\`\`

It replaces only the engine's files, prints each one it changed, and never writes your content or book.config.ts. Then run \`bun install\` and \`bun run verify -- --all\`.
`;

/** Paths a new project writes that must not exist yet. */
export const createConflicts = (
	source: Source,
	dir: string,
	book: string,
): string[] =>
	[
		ENGINE_DIR,
		`apps/${book}`,
		"package.json",
		"tsconfig.base.json",
		"bun.lock",
		PROJECT_STAMP,
		...source.scripts.map((file) => `scripts/${file}`),
	].filter((rel) => existsSync(join(dir, rel)));

export type CreateResult = {
	files: number;
	keptExisting: string[];
};

/** Writes a new project into `dir`. The caller has checked `createConflicts`. */
export const createProject = (
	source: Source,
	dir: string,
	options: { book: string; title: string; today?: string },
): CreateResult => {
	const changes = [
		...writeEngine(source, dir),
		...writeScripts(source, dir),
		...writeRootFiles(source, dir, `${options.book}-book`),
	];
	const keptExisting: string[] = [];
	for (const [rel, content] of [
		[".gitignore", GITIGNORE],
		["README.md", readme(options.book, options.title)],
		[".mcp.json", MCP_JSON],
	] as const) {
		if (existsSync(join(dir, rel))) keptExisting.push(rel);
		else put(dir, rel, content, changes);
	}
	const { files } = scaffoldBook({
		root: dir,
		slug: options.book,
		title: options.title,
		today: options.today,
	});
	changes.push(...writeAppPackages(source, dir, [options.book]));
	return { files: changes.length + files.length, keptExisting };
};

export type UpgradeResult = {
	from?: ProjectStamp["engine"];
	to: ProjectStamp["engine"];
	changes: Change[];
	/** Scripts in scripts/ this version did not write and left in place. */
	untouchedScripts: string[];
};

/** Replaces the scaffolder's files in an existing project. Never writes content. */
export const upgradeProject = (source: Source, dir: string): UpgradeResult => {
	const previous = readStamp(dir);
	const books = projectBooks(dir);
	const previousEngine = readPreviousEngine(dir, books);
	const changes = [
		...writeEngine(source, dir),
		...writeScripts(source, dir, previous?.scripts),
		...writeShims(source, dir, books, previousEngine),
		...removeRetiredAppFiles(source, dir, books, previousEngine),
		...writeMissingStarterFiles(dir, books),
		...writeAppPackages(source, dir, books),
		...writeRootFiles(source, dir, `${books[0] ?? "bookkit"}-book`),
	];
	// Projects made before .mcp.json was written get one; an existing one is the author's.
	if (!existsSync(join(dir, ".mcp.json")))
		put(dir, ".mcp.json", MCP_JSON, changes);
	const owned = new Set([...source.scripts, ...(previous?.scripts ?? [])]);
	const untouchedScripts = existsSync(join(dir, "scripts"))
		? listFilesRecursive(join(dir, "scripts")).filter(
				(file) => !owned.has(file),
			)
		: [];
	return {
		from: previous?.engine,
		to: { version: source.engineVersion, commit: source.commit },
		changes,
		untouchedScripts,
	};
};

/** One line per changed area, plus each changed path outside the engine folder. */
export const summarizeUpgrade = (result: UpgradeResult): string[] => {
	const changed = result.changes.filter(
		(change) => change.action !== "unchanged",
	);
	const engine = changed.filter((change) =>
		change.path.startsWith(`${ENGINE_DIR}/`),
	);
	const count = (action: Change["action"]) =>
		engine.filter((change) => change.action === action).length;
	const lines = [
		`Engine ${engineLabel(result.from)} → ${engineLabel(result.to)}`,
		`  ${ENGINE_DIR}/: ${count("replaced")} replaced, ${count("added")} added, ${count("removed")} removed`,
	];
	for (const change of changed) {
		if (change.path.startsWith(`${ENGINE_DIR}/`)) continue;
		lines.push(`  ${change.action.padEnd(8)} ${change.path}`);
	}
	if (changed.length === 0) lines.push("  Nothing changed.");
	for (const change of changed.filter((change) => change.savedAs)) {
		lines.push(
			change.action === "removed"
				? `${change.path} is served by the engine from this version on, so your edited copy was removed and saved as ${change.savedAs}. Move its copy into book.config.ts (the home page's goes in \`home\`, the reading hub's in \`readHub\`, the mechanisms index's in \`mechanismsIndex\`), or, for a page, put it back under src/pages/, where it replaces the engine's, reading the book from @bookkit/astro-bookkit/routes/runtime; then delete the saved file.`
				: `${change.path} is shared by every book from this version on, so your edited copy was replaced and saved as ${change.savedAs}. Move its changes into book.config.ts, then delete the saved file.`,
		);
	}
	if (changed.some((change) => change.path === "bun.lock")) {
		lines.push(
			"bun.lock is the repository's now; bun install resolves any package you added yourself again, within its range.",
		);
	}
	if (result.untouchedScripts.length > 0) {
		lines.push(
			`Left in place (not written by this version): ${result.untouchedScripts.map((file) => `scripts/${file}`).join(", ")}`,
		);
	}
	return lines;
};

/** True when `child` is `parent` or inside it. */
export const isInside = (child: string, parent: string): boolean => {
	const rel = relative(parent, child);
	return (
		rel === "" ||
		(!rel.startsWith("..") && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel))
	);
};
