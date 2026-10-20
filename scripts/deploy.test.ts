import { afterAll, describe, expect, it } from "bun:test";
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import {
	runChild,
	runChildAsync,
	waitForChildren,
} from "./lib/child-process.fixture";

/**
 * `bookkit deploy` in a scratch git repository. Its `verify`, each book's
 * build, and wrangler are stand-ins that record what they were asked to do,
 * so nothing is built for real and nothing is published.
 */

// Each test runs deploy, which runs bun several times, and the tests of a
// describe.concurrent block run at once: under load one took 12 s.
waitForChildren();

const created: string[] = [];
afterAll(() => {
	for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

// Spawned git and deploy must not inherit a caller's GIT_DIR or index (a hook).
const env = Object.fromEntries(
	Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

const git = (cwd: string, ...args: string[]) => {
	const result = runChild(
		[
			"git",
			"-c",
			"user.name=Bookkit Test",
			"-c",
			"user.email=test@example.com",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{ cwd, env },
	);
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout.trim();
};

type BookOptions = { siteUrl?: string; hosts?: string[] };

type Workspace = {
	root: string;
	head: () => string;
	commit: (subject: string) => void;
	/** Lines the stand-ins appended: `verify …`, `build <book>`, `<book> deploy …`. */
	calls: (log: "verify" | "build" | "wrangler") => string[];
	clearCalls: () => void;
};

/** A git repository with `books` committed under apps/, plus `extra` files. */
const makeWorkspace = (
	books: Record<string, BookOptions>,
	extra: Record<string, string> = {},
): Workspace => {
	const root = mkdtempSync(join(tmpdir(), "bookkit-deploy-"));
	// Logs and stand-ins live outside the repository, so they never dirty it.
	const stubs = mkdtempSync(join(tmpdir(), "bookkit-deploy-stubs-"));
	created.push(root, stubs);
	const log = (name: string) => join(stubs, `${name}.log`);

	writeFileSync(
		join(stubs, "verify.ts"),
		`import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log("verify"))}, \`verify \${process.argv.slice(2).join(" ")}\\n\`);
process.exit(Number(process.env.STUB_VERIFY_EXIT ?? 0));
`,
	);
	writeFileSync(
		join(stubs, "build.ts"),
		`import { appendFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { writeHealthyDist } from ${JSON.stringify(join(repoRoot(), "scripts", "lib", "build-output.fixture.ts"))};
const book = basename(process.cwd());
appendFileSync(${JSON.stringify(log("build"))}, \`build \${book}\\n\`);
if (process.env.STUB_FAIL_BUILD === book) process.exit(1);
await writeHealthyDist(join(process.cwd(), "dist"));
if (process.env.STUB_BREAK_DIST === book) rmSync(join(process.cwd(), "dist", "exports"), { recursive: true });
`,
	);

	// deploy runs scripts/check-build.ts and node_modules/.bin/wrangler from
	// the directory it starts in.
	symlinkSync(join(repoRoot(), "scripts"), join(root, "scripts"));
	const bin = join(root, "node_modules", ".bin");
	mkdirSync(bin, { recursive: true });
	writeFileSync(
		join(bin, "wrangler"),
		`#!/bin/sh\necho "$(basename "$PWD") $*" >> "${log("wrangler")}"\n[ "$(basename "$PWD")" != "$STUB_FAIL_WRANGLER" ]\n`,
	);
	chmodSync(join(bin, "wrangler"), 0o755);

	const files: Record<string, string> = {
		".gitignore": "node_modules/\ndist/\n.bookkit/\n",
		"package.json": JSON.stringify({
			private: true,
			workspaces: ["apps/*"],
			scripts: { verify: `bun ${join(stubs, "verify.ts")}` },
		}),
		...extra,
	};
	for (const [book, options] of Object.entries(books)) {
		const site = options.siteUrl ?? `https://${book}.example`;
		files[`apps/${book}/package.json`] = JSON.stringify({
			name: `@books/${book}`,
			scripts: { build: `bun ${join(stubs, "build.ts")}` },
		});
		files[`apps/${book}/src/book.config.ts`] =
			`export const bookConfig = { title: "${book}", status: "draft", site: { url: "${site}" } };\n`;
		files[`apps/${book}/wrangler.jsonc`] = JSON.stringify({
			name: `bookkit-${book}`,
			assets: { directory: "./dist" },
			routes: (options.hosts ?? []).map((pattern) => ({
				pattern,
				custom_domain: true,
			})),
		});
		files[`apps/${book}/src/content/book/chapters/01-start.mdx`] =
			'---\nslug: "01-start"\ntitle: "Start"\nstatus: draft\n---\nCommitted text.\n';
		for (const section of ["mechanisms", "toolkit", "examples", "glossary"]) {
			files[`apps/${book}/src/content/book/${section}/.gitkeep`] = "";
		}
	}
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	git(root, "init", "-q");
	git(root, "add", "-A");
	git(root, "commit", "-qm", "Add books");

	return {
		root,
		head: () => git(root, "rev-parse", "HEAD"),
		commit: (subject) => {
			git(root, "add", "-A");
			git(root, "commit", "-qm", subject);
		},
		calls: (name) =>
			existsSync(log(name))
				? readFileSync(log(name), "utf8").trim().split("\n")
				: [],
		clearCalls: () => {
			for (const name of ["verify", "build", "wrangler"]) {
				rmSync(log(name), { force: true });
			}
		},
	};
};

/** Runs `bookkit deploy` asynchronously, so a test server can answer it. */
const deploy = (
	workspace: Workspace,
	args: string[],
	extraEnv: Record<string, string> = {},
) =>
	runChildAsync(
		[
			process.execPath,
			"run",
			join(repoRoot(), "scripts", "bookkit.ts"),
			"deploy",
			...args,
		],
		{ cwd: workspace.root, env: { ...env, ...extraEnv } },
	);

const THREE_BOOKS = { gamma: {}, beta: {}, alpha: {} };

describe.concurrent("bookkit deploy: all or none", () => {
	it("checks every book before publishing any, so one failure publishes nothing", async () => {
		const workspace = makeWorkspace(THREE_BOOKS);

		const result = await deploy(workspace, ["--dry-run"], {
			STUB_BREAK_DIST: "alpha",
			STUB_FAIL_BUILD: "gamma",
		});

		expect(result.status).toBe(1);
		expect(workspace.calls("wrangler")).toEqual([]);
		// Every book was still checked, so the summary names every problem.
		expect(workspace.calls("build")).toEqual([
			"build alpha",
			"build beta",
			"build gamma",
		]);
		expect(result.output).toMatch(
			/alpha {2}refused: its dist\/ failed check:build/,
		);
		expect(result.output).toContain("beta   passed its checks; not published");
		expect(result.output).toMatch(
			/gamma {2}refused: its build failed \(exit 1\)/,
		);
		expect(result.output).toContain(
			"Nothing was published: 2 of 3 book(s) failed their checks.",
		);
	});

	it("publishes nothing when verify --all fails", async () => {
		const workspace = makeWorkspace(THREE_BOOKS);

		const result = await deploy(workspace, ["--dry-run"], {
			STUB_VERIFY_EXIT: "1",
		});

		expect(result.status).toBe(1);
		expect(workspace.calls("verify")).toEqual([
			"verify --all --skip build:all",
		]);
		expect(workspace.calls("build")).toEqual([]);
		expect(workspace.calls("wrangler")).toEqual([]);
		expect(result.output).toContain(
			"Nothing was published: verify --all failed",
		);
	});

	it("publishes the books in sorted order, skips folders that are not books, and tags each version with the commit", async () => {
		const workspace = makeWorkspace(THREE_BOOKS, {
			"apps/notes/README.md": "Not a book.\n",
			"apps/draft/src/book.config.ts": "export const bookConfig = {};\n",
		});
		const message = `${workspace.head().slice(0, 12)} Add books`;

		const result = await deploy(workspace, ["--dry-run"]);

		expect(result.status).toBe(0);
		expect(workspace.calls("verify")).toEqual([
			"verify --all --skip build:all",
		]);
		expect(workspace.calls("wrangler")).toEqual(
			["alpha", "beta", "gamma"].map(
				(book) => `${book} deploy --dry-run --message ${message}`,
			),
		);
		expect(result.output).toContain(
			"Skipping apps/draft: it has no wrangler.jsonc",
		);
		expect(result.output).toContain(
			"Skipping apps/notes: it has no src/book.config.ts or wrangler.jsonc",
		);
		expect(result.output).toMatch(/alpha {2}passed; wrangler dry run ok/);
	});

	it("deploys the current book when none is named, and every book with --all", async () => {
		const workspace = makeWorkspace(THREE_BOOKS);
		mkdirSync(join(workspace.root, ".bookkit"));
		writeFileSync(
			join(workspace.root, ".bookkit", "local.json"),
			JSON.stringify({ book: "beta" }),
		);

		const current = await deploy(workspace, ["--dry-run"]);
		expect(current.status).toBe(0);
		expect(current.output).toContain("Deploying beta, the current book.");
		expect(
			workspace.calls("wrangler").map((line) => line.split(" ")[0]),
		).toEqual(["beta"]);

		workspace.clearCalls();
		const all = await deploy(workspace, ["--all", "--dry-run"]);
		expect(all.status).toBe(0);
		expect(
			workspace.calls("wrangler").map((line) => line.split(" ")[0]),
		).toEqual(["alpha", "beta", "gamma"]);
	});

	it("reports a book wrangler fails on, after trying every book", async () => {
		const workspace = makeWorkspace(THREE_BOOKS);

		const result = await deploy(workspace, ["--dry-run"], {
			STUB_FAIL_WRANGLER: "beta",
		});

		expect(result.status).toBe(1);
		expect(workspace.calls("wrangler")).toHaveLength(3);
		expect(result.output).toContain("beta   wrangler dry run failed");
		expect(result.output).toContain("wrangler failed for beta");
	});

	it("refuses an unknown flag instead of publishing for real", async () => {
		const workspace = makeWorkspace({ alpha: {} });

		const result = await deploy(workspace, ["alpha", "--dryrun"]);

		expect(result.status).toBe(1);
		expect(result.output).toContain("--dryrun");
		expect(workspace.calls("wrangler")).toEqual([]);
	});
});

describe.concurrent("bookkit deploy: provenance", () => {
	it("refuses uncommitted changes in a book being deployed, and ignores other books' changes", async () => {
		const workspace = makeWorkspace({ alpha: {}, beta: {} });
		appendFileSync(
			join(workspace.root, "apps/alpha/src/content/book/chapters/01-start.mdx"),
			"An uncommitted paragraph.\n",
		);
		writeFileSync(
			join(workspace.root, "apps/alpha/src/content/book/chapters/02-wip.mdx"),
			"work in progress\n",
		);

		const refused = await deploy(workspace, ["alpha"]);
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			" M apps/alpha/src/content/book/chapters/01-start.mdx",
		);
		expect(refused.output).toContain(
			"?? apps/alpha/src/content/book/chapters/02-wip.mdx",
		);
		expect(refused.output).toContain("--allow-dirty");
		expect(workspace.calls("verify")).toEqual([]);
		expect(workspace.calls("wrangler")).toEqual([]);

		const other = await deploy(workspace, ["beta", "--dry-run"]);
		expect(other.status).toBe(0);
		expect(workspace.calls("wrangler")).toEqual([
			`beta deploy --dry-run --message ${workspace.head().slice(0, 12)} Add books`,
		]);
	});

	it("rehearses uncommitted changes in a dry run, saying a real deploy refuses them, and stamps nothing", async () => {
		const workspace = makeWorkspace({ alpha: {} });
		appendFileSync(
			join(workspace.root, "apps/alpha/src/content/book/chapters/01-start.mdx"),
			"An uncommitted paragraph.\n",
		);

		const rehearsed = await deploy(workspace, ["--dry-run"]);
		expect(rehearsed.status).toBe(0);
		expect(rehearsed.output).toContain(
			"Rehearsing uncommitted work: a real deploy refuses these 1 change(s)",
		);
		expect(rehearsed.output).toContain(
			"Commit your changes, then publish: bun run bookkit deploy alpha",
		);
		expect(rehearsed.output).toContain("bunx wrangler login");
		expect(workspace.calls("wrangler")).toHaveLength(1);

		const fromStamp = await deploy(workspace, ["--no-build", "--dry-run"]);
		expect(fromStamp.status).toBe(1);
		expect(fromStamp.output).toContain(
			"a dry run of uncommitted work stamps none",
		);
	});

	it("publishes uncommitted changes with --allow-dirty, warning and saying so in the version message", async () => {
		const workspace = makeWorkspace({ alpha: {} });
		appendFileSync(
			join(workspace.root, "apps/alpha/src/content/book/chapters/01-start.mdx"),
			"An uncommitted paragraph.\n",
		);

		const result = await deploy(workspace, ["--dry-run", "--allow-dirty"]);

		expect(result.status).toBe(0);
		expect(result.output).toContain("WARNING: --allow-dirty");
		expect(workspace.calls("wrangler")).toEqual([
			`alpha deploy --dry-run --message ${workspace.head().slice(0, 12)}+uncommitted Add books`,
		]);
	});

	it("--no-build publishes the dist/ a dry run stamped at HEAD, without verifying or building again", async () => {
		const workspace = makeWorkspace({ alpha: {} });
		expect((await deploy(workspace, ["--dry-run"])).status).toBe(0);
		workspace.clearCalls();

		const result = await deploy(workspace, ["--no-build", "--dry-run"]);

		expect(result.status).toBe(0);
		expect(workspace.calls("verify")).toEqual([]);
		expect(workspace.calls("build")).toEqual([]);
		expect(workspace.calls("wrangler")).toHaveLength(1);
	});

	it("--no-build refuses a dist/ that no deploy run stamped", async () => {
		const workspace = makeWorkspace({ alpha: {} });
		runChild([process.execPath, "run", "build"], {
			cwd: join(workspace.root, "apps", "alpha"),
			env,
		});

		const result = await deploy(workspace, ["--no-build", "--dry-run"]);

		expect(result.status).toBe(1);
		expect(result.output).toContain("apps/alpha/dist/ has no deploy stamp");
		expect(workspace.calls("wrangler")).toEqual([]);
	});

	it("--no-build refuses a dist/ stamped at another commit, or changed since", async () => {
		const workspace = makeWorkspace({ alpha: {} });
		expect((await deploy(workspace, ["--dry-run"])).status).toBe(0);
		const stamped = workspace.head();
		writeFileSync(
			join(workspace.root, "apps/alpha/src/content/book/chapters/02-next.mdx"),
			'---\nslug: "02-next"\ntitle: "Next"\nstatus: draft\n---\nNew.\n',
		);
		workspace.commit("Add a chapter");
		workspace.clearCalls();

		const stale = await deploy(workspace, ["--no-build", "--dry-run"]);
		expect(stale.status).toBe(1);
		expect(stale.output).toContain(
			`apps/alpha/dist/ was built at ${stamped.slice(0, 12)}, but HEAD is ${workspace.head().slice(0, 12)}`,
		);

		expect((await deploy(workspace, ["--dry-run"])).status).toBe(0);
		appendFileSync(join(workspace.root, "apps/alpha/dist/index.html"), "edit");
		workspace.clearCalls();
		const edited = await deploy(workspace, ["--no-build", "--dry-run"]);
		expect(edited.status).toBe(1);
		expect(edited.output).toContain(
			"apps/alpha/dist/ changed since bookkit deploy checked it",
		);
		expect(workspace.calls("wrangler")).toEqual([]);
	});
});

describe.concurrent("bookkit deploy: page count against the live site", () => {
	const servers: Array<ReturnType<typeof Bun.serve>> = [];
	afterAll(() => {
		for (const server of servers) server.stop(true);
	});

	/** A live site whose sitemap lists `pages` URLs. */
	const liveSite = (pages: number) => {
		const server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: (request) =>
				new URL(request.url).pathname === "/sitemap.xml"
					? new Response(
							`<urlset>${Array.from({ length: pages }, (_, i) => `<url><loc>http://live/${i}</loc></url>`).join("")}</urlset>`,
						)
					: new Response("not found", { status: 404 }),
		});
		servers.push(server);
		const host = `127.0.0.1:${server.port}`;
		return { siteUrl: `http://${host}`, hosts: [host] };
	};

	it("refuses a book whose sitemap shrinks by more than a quarter, unless --allow-page-drop", async () => {
		const workspace = makeWorkspace({ alpha: liveSite(8) });

		const refused = await deploy(workspace, ["--dry-run"]);
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			"its sitemap lists 1 page(s), but 8 are live",
		);
		expect(workspace.calls("wrangler")).toEqual([]);

		const allowed = await deploy(workspace, ["--dry-run", "--allow-page-drop"]);
		expect(allowed.status).toBe(0);
		expect(allowed.output).toContain("1 sitemap page(s); 8 live.");
	});

	it("publishes when the page count holds, and says when it cannot compare", async () => {
		const workspace = makeWorkspace({ alpha: liveSite(1), beta: {} });

		const result = await deploy(workspace, ["--dry-run"]);

		expect(result.status).toBe(0);
		expect(result.output).toContain("1 sitemap page(s); 1 live.");
		expect(result.output).toContain(
			"not compared with the live site: the Worker does not serve site.url's host (beta.example)",
		);
	});
});
