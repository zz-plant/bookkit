import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { NormalizedErrorPayload } from "./normalized-error";

export type CheckSeparationOptions = {
	workspaceRoot?: string;
};

export type CheckSeparationResult = {
	ok: boolean;
	violations: NormalizedErrorPayload[];
};

const allowedExtensions = new Set([
	".md",
	".mdx",
	".json",
	".yml",
	".yaml",
	".txt",
	".csv",
]);
const allowedFilenames = new Set([".gitkeep"]);

export function checkSeparationInMemory(
	options?: CheckSeparationOptions,
): CheckSeparationResult {
	const root = options?.workspaceRoot ?? process.cwd();
	const appsDir = join(root, "apps");
	const violations: NormalizedErrorPayload[] = [];

	if (!existsSync(appsDir)) {
		return { ok: true, violations: [] };
	}

	const bookSlugs = readdirSync(appsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	for (const book of bookSlugs) {
		const contentRoot = join(appsDir, book, "src", "content", "book");
		if (!existsSync(contentRoot)) continue;

		const files = listAllFiles(contentRoot);
		for (const file of files) {
			const name = basename(file);
			if (allowedFilenames.has(name)) continue;

			const ext = extname(file);
			if (!allowedExtensions.has(ext)) {
				violations.push({
					machineCode: "SEPARATION_DISALLOWED_EXTENSION",
					humanSummary: `Disallowed file extension "${ext}" in content directory: ${file}`,
					location: { module: "validators/separation-validator", file },
					failingRule:
						"content bindings must only use data extensions (.md, .mdx, .json, .yml, .yaml)",
					nextAction: "Move non-data assets to app or engine packages.",
					severity: "error",
					gateLevel: "blocking",
				});
				continue;
			}

			if (ext === ".md" || ext === ".mdx") {
				const content = readFileSync(file, "utf8");
				const body = content.startsWith("---")
					? content.slice(content.indexOf("\n---", 3) + 4)
					: content;

				if (/^\s*import\s+.*from/m.test(body)) {
					violations.push({
						machineCode: "SEPARATION_CODE_IMPORT_DETECTED",
						humanSummary: `Code import detected in content binding: ${file}`,
						location: { module: "validators/separation-validator", file },
						failingRule:
							"content files must remain data-only without code imports",
						nextAction:
							"Remove the import statement and express required behavior via engine frames or config.",
						severity: "error",
						gateLevel: "blocking",
					});
				}

				if (/<script[\s>]/i.test(body)) {
					violations.push({
						machineCode: "SEPARATION_SCRIPT_TAG_DETECTED",
						humanSummary: `Inline <script> tag detected in content binding: ${file}`,
						location: { module: "validators/separation-validator", file },
						failingRule:
							"scripts belong in layout/engine components, not in content bindings",
						nextAction: "Remove inline script from content file.",
						severity: "error",
						gateLevel: "blocking",
					});
				}
			}
		}
	}

	return { ok: violations.length === 0, violations };
}

function listAllFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listAllFiles(full));
		} else if (entry.isFile()) {
			files.push(full);
		}
	}
	return files;
}
