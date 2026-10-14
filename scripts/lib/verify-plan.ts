/**
 * Which checks a change needs, judged by the paths it touches. Pure, so the
 * mapping can be tested; `scripts/verify.ts` runs the plan.
 *
 * The mapping is CONTRIBUTING.md's verification matrix made executable:
 *
 * | Changed path                         | Checks                                              |
 * | ------------------------------------ | --------------------------------------------------- |
 * | any formattable file                 | Biome format, import order, lint (changed files)    |
 * | packages/astro-bookkit/**            | types, tests, shims, architecture, build one book   |
 * | packages/create-bookkit/**           | types, tests                                        |
 * | scripts/**                           | types (.ts only), tests                             |
 * | apps/<book>/src/content/**           | validate that book, separation, concepts, build it  |
 * | apps/<book>/src/content/.../mechanisms, corpus.json | mechanisms across books (wording)    |
 * | apps/<book>/** (config, pages, lib)  | types, shims, validate, build that book             |
 * | docs/architecture.md                 | architecture                                        |
 * | TODOS.md                             | todos                                               |
 * | package.json, bun.lock, tsconfig, biome.json, CI | everything in the first column above    |
 * | --all (CI runs exactly this)         | every gate, plus mechanisms across books and concepts |
 */

export type Gate = {
	id: string;
	label: string;
	/** Why this change needs it, in a few words. */
	why: string;
	/** Commands run in order; the gate fails on the first nonzero exit. */
	commands: string[][];
	/** `findings-json`: stdout is `{ findings: [...] }`; judge by error-level findings. */
	parse?: "findings-json";
};

/** The book `verify` builds when engine code changes: small, and published. Without it, the first book. */
export const REPRESENTATIVE_BOOK = "on-call";

const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|astro)$/;
const ENGINE = /^packages\/astro-bookkit\//;
const CREATE_BOOKKIT = /^packages\/create-bookkit\//;
const SCRIPTS = /^scripts\//;
const ROOT_CONFIG =
	/^(package\.json|bun\.lock|tsconfig\.base\.json|biome\.json|\.github\/)/;
const APP = /^apps\/([^/]+)\//;
const CONTENT = /^apps\/([^/]+)\/src\/content\//;
const MECHANISMS = /^apps\/[^/]+\/src\/content\/book\/mechanisms\//;

const bun = (...args: string[]) => ["bun", "run", ...args];

const buildGate = (book: string, why: string): Gate => ({
	id: `build:${book}`,
	label: `build ${book}`,
	why,
	commands: [
		["bun", "run", "--filter", `@books/${book}`, "build"],
		bun("scripts/check-build.ts", "--book", book),
	],
});

/** Unregistered multi-word names in prose: reported as warnings, never failing. */
const conceptsGate = (books: string[] | null, why: string): Gate => ({
	id: "concepts",
	label: "named concepts",
	why,
	commands: [
		bun(
			"scripts/check-floating-concepts.ts",
			...(books && books.length === 1 ? ["--book", books[0]] : []),
			"--json",
		),
	],
	parse: "findings-json",
});

const corpusGate = (why: string): Gate => ({
	id: "corpus",
	label: "mechanisms across books",
	why,
	commands: [
		bun("scripts/check-corpus.ts", "--no-semantic", "--mode", "error"),
	],
});

const validateGate = (book: string, why: string): Gate => ({
	id: `validate:${book}`,
	label: `validate ${book}`,
	why,
	commands: [bun("scripts/validate-book.ts", "--book", book, "--json")],
	parse: "findings-json",
});

/**
 * `changed`: repo-relative paths, deleted ones included. `null` plans every
 * gate CI runs. `exists` filters deleted files out of formatter arguments.
 */
export const planGates = (
	changed: string[] | null,
	books: string[],
	exists: (path: string) => boolean = () => true,
): Gate[] => {
	if (changed === null) {
		return [
			{
				id: "biome",
				label: "format + lint",
				why: "every file",
				commands: [bun("check:format")],
			},
			{
				id: "types",
				label: "types",
				why: "every project",
				commands: [bun("check:types")],
			},
			{ id: "test", label: "tests", why: "all", commands: [bun("test")] },
			{
				id: "separation",
				label: "separation",
				why: "all books",
				commands: [bun("check:separation")],
			},
			{
				id: "architecture",
				label: "architecture doc",
				why: "module map",
				commands: [bun("check:architecture")],
			},
			{
				id: "todos",
				label: "todos",
				why: "trackers",
				commands: [bun("check:todos")],
			},
			{
				id: "shims",
				label: "shims",
				why: "book wrappers",
				commands: [bun("check:shims")],
			},
			...books.map((book) => validateGate(book, "every book")),
			corpusGate("mechanisms stay distinct across books"),
			conceptsGate(null, "every book"),
			{
				id: "build:all",
				label: "build every book",
				why: "every book",
				commands: [bun("build:all"), bun("check:build")],
			},
		];
	}

	const gates = new Map<string, Gate>();
	const add = (gate: Gate) => {
		if (!gates.has(gate.id)) gates.set(gate.id, gate);
	};
	const any = (pattern: RegExp) => changed.some((file) => pattern.test(file));
	const booksMatching = (pattern: RegExp) =>
		[
			...new Set(
				changed
					.map((file) => file.match(pattern)?.[1])
					.filter((book): book is string => Boolean(book)),
			),
		].filter((book) => books.includes(book));

	const formattable = changed.filter(
		(file) => FORMATTABLE.test(file) && exists(file),
	);
	if (formattable.length > 0) {
		add({
			id: "biome",
			label: "format + lint",
			why: `${formattable.length} changed file${formattable.length === 1 ? "" : "s"}`,
			commands: [
				["bunx", "biome", "ci", "--no-errors-on-unmatched", ...formattable],
			],
		});
	}

	const rootConfig = any(ROOT_CONFIG);
	const engine = any(ENGINE) || rootConfig;
	const appCode = booksMatching(APP).filter((book) =>
		changed.some(
			(file) =>
				file.startsWith(`apps/${book}/`) &&
				!file.startsWith(`apps/${book}/src/content/`) &&
				!file.endsWith(".md"),
		),
	);
	const contentBooks = booksMatching(CONTENT);

	// Types: the .astro pass is slow, so it runs only when something it reads changed.
	if (engine || appCode.length > 0) {
		add({
			id: "types",
			label: "types",
			why: engine ? "engine or workspace config" : "book app code",
			commands: [bun("check:types")],
		});
	} else if (any(SCRIPTS) || any(CREATE_BOOKKIT)) {
		add({
			id: "types",
			label: "types (.ts only)",
			why: "scripts or generator",
			commands: [bun("check:types", "--no-astro")],
		});
	}

	if (engine || any(SCRIPTS) || any(CREATE_BOOKKIT)) {
		add({
			id: "test",
			label: "tests",
			why: "code with unit tests",
			commands: [bun("test")],
		});
	}

	for (const book of [...new Set([...contentBooks, ...appCode])]) {
		add(
			validateGate(
				book,
				contentBooks.includes(book) ? "content changed" : "book config or app",
			),
		);
	}
	if (contentBooks.length > 0) {
		add({
			id: "separation",
			label: "separation",
			why: "content must stay data-only",
			commands: [bun("check:separation")],
		});
	}
	if (contentBooks.length > 0) {
		add(conceptsGate(contentBooks, "names in new prose"));
	}
	if (any(MECHANISMS) || changed.includes("corpus.json")) {
		add(corpusGate("mechanisms or corpus.json changed"));
	}

	if (engine || appCode.length > 0) {
		add({
			id: "shims",
			label: "shims",
			why: "wrappers stay identical across books",
			commands: [bun("check:shims")],
		});
	}
	if (engine || changed.includes("docs/architecture.md")) {
		add({
			id: "architecture",
			label: "architecture doc",
			why: "module map matches the tree",
			commands: [bun("check:architecture")],
		});
	}
	if (changed.some((file) => file.endsWith("TODOS.md"))) {
		add({
			id: "todos",
			label: "todos",
			why: "tracker format",
			commands: [bun("check:todos")],
		});
	}

	// Builds last: they are the slowest and catch what nothing else does (MDX
	// syntax, prerender failures, shipped output).
	const buildBooks = [...new Set([...contentBooks, ...appCode])];
	for (const book of buildBooks) {
		add(buildGate(book, "its content or app changed"));
	}
	// A fork or standalone project may not have the representative book.
	const representative = books.includes(REPRESENTATIVE_BOOK)
		? REPRESENTATIVE_BOOK
		: [...books].sort()[0];
	if (engine && representative && !buildBooks.includes(representative)) {
		add(
			buildGate(representative, "engine changed; one book stands in for all"),
		);
	}

	return [...gates.values()];
};
