/**
 * Which checks a change needs, judged by the paths it touches. Pure, so the
 * mapping can be tested; `scripts/verify.ts` runs the plan.
 *
 * CONTRIBUTING.md's verification matrix is rendered from this file (see
 * verificationMatrix below), so the table and the plan cannot disagree.
 * `--all` plans every gate CI runs; `--quick` narrows the tests gate to the
 * change (see quickTestTargets).
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
 * Gates a standalone project (create-bookkit) has nothing for: it installs no
 * Biome, vendors no engine tests, and has no architecture doc.
 */
export const WORKSPACE_ONLY_GATES = ["biome", "test", "architecture"];

/**
 * The tests `--quick` runs instead of the whole suite: the engine's own tests
 * when engine code changed (a few seconds), the generator's when it changed,
 * and for a script, the test file beside it. The tests under `scripts/` that
 * build books are nine tenths of the suite's time, so they wait for the full
 * run. `null`: the change cannot be narrowed (workspace config), so run it all.
 */
export const quickTestTargets = (
	changed: string[],
	exists: (path: string) => boolean,
): string[] | null => {
	if (changed.some((file) => ROOT_CONFIG.test(file))) return null;
	const targets = new Set<string>();
	for (const file of changed) {
		if (ENGINE.test(file)) targets.add("./packages/astro-bookkit");
		else if (CREATE_BOOKKIT.test(file))
			targets.add("./packages/create-bookkit");
		else if (SCRIPTS.test(file) && file.endsWith(".ts")) {
			const test = file.endsWith(".test.ts")
				? file
				: file.replace(/\.ts$/, ".test.ts");
			if (exists(test)) targets.add(`./${test}`);
		}
	}
	return [...targets].sort();
};

/**
 * `changed`: repo-relative paths, deleted ones included. `null` plans every
 * gate CI runs. `exists` filters deleted files out of formatter arguments.
 * `project` plans for a standalone project rather than this workspace.
 * `quick` narrows the tests gate to the change; every other gate is the same.
 */
export const planGates = (
	changed: string[] | null,
	books: string[],
	exists: (path: string) => boolean = () => true,
	profile: "workspace" | "project" = "workspace",
	options: { quick?: boolean } = {},
): Gate[] =>
	planWorkspaceGates(changed, books, exists, options.quick === true).filter(
		(gate) =>
			profile === "workspace" || !WORKSPACE_ONLY_GATES.includes(gate.id),
	);

const planWorkspaceGates = (
	changed: string[] | null,
	books: string[],
	exists: (path: string) => boolean,
	quick: boolean,
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
		const targets = quick ? quickTestTargets(changed, exists) : null;
		if (targets === null) {
			add({
				id: "test",
				label: "tests",
				why: "code with unit tests",
				commands: [bun("test")],
			});
		} else if (targets.length > 0) {
			add({
				id: "test",
				label: "tests (near the change)",
				why: "quick: the full suite still runs before a commit",
				commands: [["bun", "test", "--parallel", ...targets]],
			});
		}
	}

	const changedBooks = [...new Set([...contentBooks, ...appCode])];
	for (const book of changedBooks) {
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
	if (
		any(MECHANISMS) ||
		changed.includes("corpus.json") ||
		changed.includes("corpus-judgments.json")
	) {
		add(corpusGate("mechanisms, corpus.json, or judges' verdicts changed"));
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
	for (const book of changedBooks) {
		add(buildGate(book, "its content or app changed"));
	}
	// A fork or standalone project may not have the representative book.
	const representative = books.includes(REPRESENTATIVE_BOOK)
		? REPRESENTATIVE_BOOK
		: [...books].sort()[0];
	if (engine && representative && !changedBooks.includes(representative)) {
		add(
			buildGate(representative, "engine changed; one book stands in for all"),
		);
	}

	return [...gates.values()];
};

const MATRIX_BOOK = "<book>";

/** One row per kind of change: how the table names it, and a path that stands for it. */
const MATRIX_ROWS: { change: string; sample: string[] | null }[] = [
	{
		change: "`packages/astro-bookkit/**`",
		sample: ["packages/astro-bookkit/src/seo/book.ts"],
	},
	{
		change: "`packages/create-bookkit/**`",
		sample: ["packages/create-bookkit/src/index.ts"],
	},
	{ change: "`scripts/**`", sample: ["scripts/verify.ts"] },
	{
		change: "`apps/<book>/src/content/**`",
		sample: [`apps/${MATRIX_BOOK}/src/content/book/chapters/01-start.mdx`],
	},
	{
		change: "a mechanism file",
		sample: [`apps/${MATRIX_BOOK}/src/content/book/mechanisms/a-mechanism.mdx`],
	},
	{
		change: "`corpus.json`, `corpus-judgments.json`",
		sample: ["corpus.json"],
	},
	{
		change: "`apps/<book>/**` outside content (config, pages)",
		sample: [`apps/${MATRIX_BOOK}/src/book.config.ts`],
	},
	{ change: "`docs/architecture.md`", sample: ["docs/architecture.md"] },
	{ change: "`TODOS.md`", sample: [`apps/${MATRIX_BOOK}/TODOS.md`] },
	{
		change:
			"`package.json`, `bun.lock`, `tsconfig.base.json`, `biome.json`, `.github/**`",
		sample: ["package.json"],
	},
	{ change: "other prose (`README.md`, `docs/**`)", sample: ["README.md"] },
	{ change: "`--all` (what CI runs)", sample: null },
];

/**
 * The verification matrix in CONTRIBUTING.md: for each kind of change, the
 * gates planGates plans for it, named as verify prints them. Rendered, not
 * written by hand: `bun run verify -- --matrix --write` rewrites the table,
 * and a test fails when the document differs.
 */
export const verificationMatrix = (): string =>
	[
		"| Changed path | Checks, as `verify` names them |",
		"| --- | --- |",
		...MATRIX_ROWS.map(({ change, sample }) => {
			const gates = planGates(
				sample,
				sample === null ? [MATRIX_BOOK] : [MATRIX_BOOK, REPRESENTATIVE_BOOK],
			);
			const checks =
				gates.length > 0
					? gates.map((gate) => `\`${gate.label}\``).join(", ")
					: "nothing";
			return `| ${change} | ${checks} |`;
		}),
	].join("\n");

const MATRIX_START = "<!-- verify:matrix:start -->";
const MATRIX_END = "<!-- verify:matrix:end -->";

/** `doc` with its matrix region rendered afresh; `null` when it has no such region. */
export const withVerificationMatrix = (doc: string): string | null => {
	const start = doc.indexOf(MATRIX_START);
	const end = doc.indexOf(MATRIX_END);
	if (start === -1 || end < start) return null;
	return `${doc.slice(0, start)}${MATRIX_START}\n\n${verificationMatrix()}\n\n${doc.slice(end)}`;
};
