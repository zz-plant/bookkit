import { afterAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * What the workflows promise, read from their YAML (actionlint has no
 * maintained bun or npm package): deploy runs only after CI passed on a push
 * to this repository's main, the Cloudflare token reaches only the step that
 * publishes, and CI runs the deploy path, publishing nothing, on every pull
 * request. The two shell snippets that carry behavior are run here too.
 */

type Step = {
	name?: string;
	uses?: string;
	run?: string;
	"timeout-minutes"?: number;
	shell?: string;
	if?: string;
	env?: Record<string, string>;
	with?: Record<string, string>;
};
type Job = {
	if?: string;
	env?: Record<string, string>;
	"timeout-minutes"?: number;
	steps: Step[];
};
type Workflow = {
	on: Record<string, unknown>;
	env?: Record<string, string>;
	jobs: Record<string, Job>;
};

const dir = join(repoRoot(), ".github", "workflows");
const load = (file: string) =>
	Bun.YAML.parse(readFileSync(join(dir, file), "utf8")) as Workflow;

/** A GitHub Actions expression, `${{ … }}`, as it appears in the YAML. */
const expression = (inner: string) => `$\{{ ${inner} }}`;

const scratch = mkdtempSync(join(tmpdir(), "bookkit-workflows-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs a step's script with bash, as GitHub does on ubuntu runners. */
const runStep = (script: string, env: Record<string, string>) => {
	const result = Bun.spawnSync(["bash", "-eo", "pipefail", "-c", script], {
		cwd: scratch,
		env: { PATH: process.env.PATH ?? "", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

describe("workflows", () => {
	it("all parse, and every job has steps", () => {
		const files = readdirSync(dir).filter((file) => /\.ya?ml$/.test(file));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			for (const [id, job] of Object.entries(load(file).jobs)) {
				expect({ file, id, steps: job.steps?.length > 0 }).toEqual({
					file,
					id,
					steps: true,
				});
			}
		}
	});
});

describe("deploy.yml", () => {
	const workflow = load("deploy.yml");
	const job = workflow.jobs.deploy;
	const json = (value: unknown) => JSON.stringify(value ?? {});

	it("runs when CI completes on main, or by hand; never on a push", () => {
		expect(Object.keys(workflow.on).sort()).toEqual([
			"workflow_dispatch",
			"workflow_run",
		]);
		expect(workflow.on.workflow_run).toEqual({
			workflows: ["CI"],
			types: ["completed"],
			branches: ["main"],
		});
	});

	it("deploys only a passed CI push to this repository's main, or a manual run on main, once DEPLOY_BOOKS names books", () => {
		const condition = (job.if ?? "").replace(/\s+/g, " ");
		for (const clause of [
			"vars.DEPLOY_BOOKS != ''",
			"github.event.workflow_run.conclusion == 'success'",
			"github.event.workflow_run.event == 'push'",
			"github.event.workflow_run.head_branch == 'main'",
			"github.event.workflow_run.head_repository.full_name == github.repository",
			"github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'",
		]) {
			expect(condition).toContain(clause);
		}
		expect(job.env?.COMMIT).toContain("github.event.workflow_run.head_sha");
		const checkout = job.steps.find((step) =>
			step.uses?.startsWith("actions/checkout"),
		);
		expect(checkout?.with?.ref).toBe(expression("env.COMMIT"));
	});

	it("gives the Cloudflare token only to the step that publishes, after everything else ran without it", () => {
		expect(json(workflow.env)).not.toContain("secrets.");
		expect(json(job.env)).not.toContain("secrets.");
		const holders = job.steps.filter((step) =>
			Object.values(step.env ?? {}).includes(
				expression("secrets.CLOUDFLARE_API_TOKEN"),
			),
		);
		expect(holders.map((step) => step.name)).toEqual(["Publish"]);
		const publish = job.steps.indexOf(holders[0]);
		expect(holders[0].run).toContain("--no-build");
		const before = job.steps.slice(0, publish).map((step) => step.run ?? "");
		expect(before.some((run) => run.includes("bun install"))).toBe(true);
		expect(before.some((run) => /bookkit deploy .*--dry-run/.test(run))).toBe(
			true,
		);
	});

	it("fails when DEPLOY_BOOKS is set but the token is missing, and refuses flags in DEPLOY_BOOKS", () => {
		const check = job.steps[0];
		expect(check.env?.HAS_TOKEN).toBe(
			expression("secrets.CLOUDFLARE_API_TOKEN != ''"),
		);
		const script = check.run ?? "";

		const missing = runStep(script, {
			DEPLOY_BOOKS: "on-call",
			HAS_TOKEN: "false",
		});
		expect(missing.status).toBe(1);
		expect(missing.output).toContain(
			"the CLOUDFLARE_API_TOKEN secret is missing, so nothing was published",
		);

		const flag = runStep(script, {
			DEPLOY_BOOKS: "--allow-dirty on-call",
			HAS_TOKEN: "true",
		});
		expect(flag.status).toBe(1);
		expect(flag.output).toContain('"--allow-dirty" is not a book');

		for (const books of ["on-call running-hot", "--all"]) {
			expect(
				runStep(script, { DEPLOY_BOOKS: books, HAS_TOKEN: "true" }).status,
			).toBe(0);
		}
	});
});

describe("ci.yml", () => {
	const workflow = load("ci.yml");
	const steps = workflow.jobs["governance-and-tests"].steps;
	const verify = steps.findIndex(
		(step) => step.run === "bun run verify -- --all",
	);
	const deploy = steps.findIndex((step) =>
		step.run?.includes("bun run bookkit deploy --all --dry-run"),
	);

	it("limits how long Chromium may run, in each job and step that drives it", () => {
		const drivesChromium = (step: Step) =>
			/bun run (check:a11y|test:browser)\b/.test(step.run ?? "");
		const jobs = Object.entries(workflow.jobs).filter(([, job]) =>
			job.steps.some(drivesChromium),
		);
		expect(jobs.map(([id]) => id)).toEqual(["accessibility"]);
		for (const [id, job] of jobs) {
			expect({ id, limit: job["timeout-minutes"] }).toEqual({
				id,
				limit: expect.any(Number),
			});
			for (const step of job.steps.filter(drivesChromium)) {
				const limit = step["timeout-minutes"] ?? Number.POSITIVE_INFINITY;
				expect({
					step: step.name,
					limited: limit < (job["timeout-minutes"] ?? 0),
				}).toEqual({
					step: step.name,
					limited: true,
				});
			}
		}
	});

	it("runs on pull requests and pushes to main", () => {
		expect(workflow.on).toEqual({
			push: { branches: ["main"] },
			pull_request: { branches: ["main"] },
		});
	});

	it("runs every gate, then deploys every book as a dry run, checking each got this commit as its version message", () => {
		expect(verify).toBeGreaterThanOrEqual(0);
		expect(deploy).toBeGreaterThan(verify);
		expect(steps[deploy].run).toContain(
			'--message $(git rev-parse --short=12 HEAD) "',
		);
	});

	it("puts a guard in wrangler's place that refuses anything but a dry run", () => {
		const guard = steps[deploy].run?.match(/<<'GUARD'\n([\s\S]*?)\nGUARD/)?.[1];
		expect(guard).toBeDefined();
		writeFileSync(join(scratch, "wrangler"), `${guard}\n`);
		writeFileSync(
			join(scratch, "wrangler-real"),
			'#!/bin/sh\necho "real wrangler: $*"\n',
		);
		chmodSync(join(scratch, "wrangler"), 0o755);
		chmodSync(join(scratch, "wrangler-real"), 0o755);
		const env = { RUNNER_TEMP: scratch };

		const publish = runStep("./wrangler deploy --message abc", env);
		expect(publish.status).toBe(1);
		expect(publish.output).not.toContain("real wrangler");

		const dryRun = runStep("./wrangler deploy --dry-run --message abc", env);
		expect(dryRun.status).toBe(0);
		expect(dryRun.output).toContain(
			"real wrangler: deploy --dry-run --message abc",
		);
		expect(readFileSync(join(scratch, "wrangler-calls"), "utf8")).toContain(
			"deploy --dry-run --message abc",
		);
	});

	it("runs check:a11y in its own job, with Chromium cached by Playwright version", () => {
		const steps = workflow.jobs.accessibility.steps;
		const runs = steps.map((step) => step.run ?? "");
		const cache = steps.findIndex(
			(step) =>
				step.uses?.startsWith("actions/cache@") &&
				step.with?.path === "~/.cache/ms-playwright",
		);
		const install = runs.findIndex((run) =>
			run.startsWith("bunx playwright install --with-deps"),
		);
		const check = runs.indexOf("bun run check:a11y");
		const browserTests = runs.indexOf("bun run test:browser");
		expect(steps[cache]?.with?.key).toContain(
			"steps.playwright.outputs.version",
		);
		expect(install).toBeGreaterThan(cache);
		expect(check).toBeGreaterThan(install);
		expect(browserTests).toBeGreaterThan(install);
		// It reads the link-preview cache governance-and-tests saves, and saves none.
		expect(
			steps.some(
				(step) =>
					step.uses?.startsWith("actions/cache@") &&
					String(step.with?.path).includes("bookkit-og"),
			),
		).toBe(false);
	});

	it("verifies the standalone project before git init, and deploys it after", () => {
		const runs = workflow.jobs["standalone-project"].steps.map(
			(step) => step.run ?? "",
		);
		const at = (text: string) => runs.findIndex((run) => run.includes(text));
		expect(at("bun run verify -- --all")).toBeGreaterThan(-1);
		expect(at("git init")).toBeGreaterThan(at("bun run verify -- --all"));
		expect(at("bun run deploy")).toBe(at("git init"));
	});

	it("fails the standalone project's job when its build prints a warning, or fails", () => {
		const steps = workflow.jobs["standalone-project"].steps;
		const build = steps.find((step) => step.run?.includes("bun run build"));
		// GitHub's default shell has no pipefail, which would lose the build's status to tee.
		expect(build?.shell).toBe("bash");
		const runs = steps.map((step) => step.run ?? "");
		expect(runs.indexOf(build?.run ?? "")).toBeGreaterThan(
			runs.findIndex((run) => run.includes("bun install")),
		);
		expect(runs.indexOf(build?.run ?? "")).toBeLessThan(
			runs.findIndex((run) => run.includes("bun run deploy")),
		);

		// A stand-in bun that prints what a build printed and exits as it did.
		const bin = join(scratch, "standalone-bin");
		mkdirSync(bin, { recursive: true });
		writeFileSync(
			join(bin, "bun"),
			'#!/bin/sh\nprintf "%b" "$BUILD_OUTPUT"\nexit "$BUILD_EXIT"\n',
		);
		chmodSync(join(bin, "bun"), 0o755);
		const buildWith = (output: string, exit = 0) =>
			runStep(build?.run ?? "", {
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				RUNNER_TEMP: scratch,
				BUILD_OUTPUT: output,
				BUILD_EXIT: String(exit),
			});

		const clean = buildWith(
			"@books/field-notes build: 23:21:54 [build] Complete!\\n",
		);
		expect(clean.status, clean.output).toBe(0);

		// Vite's chunk-size warning, as Astro prints it in a project's build.
		const warned = buildWith(
			"@books/field-notes build: 23:22:23 [WARN] [vite] [plugin builtin:vite-reporter] \\n@books/field-notes build: (!) Some chunks are larger than 500 kB after minification.\\n",
		);
		expect(warned.status).toBe(1);
		expect(warned.output).toContain("::error title=Build warnings::");
		expect(warned.output).toContain("[WARN] [vite]");

		expect(buildWith("Build failed.\\n", 1).status).toBe(1);
	});

	it("runs the meaning pass of check:corpus, with the model download allowed and cached, and fails if it did not run", () => {
		const job = workflow.jobs["semantic-corpus"];
		expect(job.env?.BOOKKIT_DOWNLOAD_MODEL).toBe("1");
		const cache = job.steps.find((step) =>
			step.uses?.startsWith("actions/cache"),
		);
		expect(cache?.with?.path).toBe(expression("env.BOOKKIT_MODEL_CACHE"));
		expect(cache?.with?.key).toContain("steps.model.outputs.id");
		const run = job.steps.map((step) => step.run ?? "").join("\n");
		// actions/cache will not save a path containing "..", so the model
		// would be downloaded on every run.
		const cachePath = run.match(
			/BOOKKIT_MODEL_CACHE=(\S+)"? >> "\$GITHUB_ENV"/,
		)?.[1];
		expect(cachePath).toBeTruthy();
		expect(cachePath).not.toContain("..");
		expect(run).toContain("check:corpus -- --mode error");
		expect(run).toContain('grep -q "semantic pass: "');
	});
});

describe("every workflow", () => {
	it("limits how long each job may run, so a stuck one fails in minutes, not at GitHub's 6 hours", () => {
		const unlimited = readdirSync(dir)
			.filter((file) => file.endsWith(".yml"))
			.flatMap((file) =>
				Object.entries(load(file).jobs)
					.filter(([, job]) => typeof job["timeout-minutes"] !== "number")
					.map(([id]) => `${file}: ${id}`),
			);
		expect(unlimited).toEqual([]);
	});
});
