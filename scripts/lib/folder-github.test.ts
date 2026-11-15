import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewFolder } from "../../packages/astro-bookkit/src/proposals";
import {
	formatGithubAnnotations,
	formatGithubStepSummary,
} from "./folder-report";

const dirs: string[] = [];
const tempDir = () => {
	const dir = mkdtempSync(join(tmpdir(), "bookkit-github-report-"));
	dirs.push(dir);
	return dir;
};

afterEach(() => {
	while (dirs.length > 0) {
		rmSync(dirs.pop() as string, { recursive: true, force: true });
	}
});

describe("GitHub folder check output", () => {
	it("emits workflow annotations relative to GITHUB_WORKSPACE and a Markdown step summary", () => {
		const workspace = tempDir();
		const docsDir = join(workspace, "docs", "runbooks");
		mkdirSync(docsDir, { recursive: true });
		const source = "# Restart API\n\n## Steps\n\n1. Restart.\n";
		writeFileSync(join(docsDir, "restart.md"), source);

		const preview = previewFolder([{ path: "restart.md", source }], {
			frame: "runbook",
			requireFrameSteps: true,
		});

		const annotations = formatGithubAnnotations(docsDir, preview, workspace);
		expect(annotations.length).toBeGreaterThan(0);
		expect(annotations[0]).toMatch(
			/^::error file=docs\/runbooks\/restart\.md,title=Bookkit \(FRAME_STEP_MISSING\)::/,
		);

		const summary = formatGithubStepSummary("docs/runbooks", preview);
		expect(summary).toContain("### Bookkit Check: `docs/runbooks` — Failed");
		expect(summary).toContain("| `restart.md` | error |");
	});
});
