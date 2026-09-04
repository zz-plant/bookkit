import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { listBookDirs } from "./_lib";

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

const errors: string[] = [];

for (const book of listBookDirs()) {
	const contentRoot = join(
		process.cwd(),
		"apps",
		book,
		"src",
		"content",
		"book",
	);
	if (!existsSync(contentRoot)) continue;

	for (const file of listFiles(contentRoot)) {
		const baseName = basename(file);
		if (allowedFilenames.has(baseName)) continue;

		const extension = extname(file);

		// Rule 1: Disallowed file extensions in content directory
		if (!allowedExtensions.has(extension)) {
			errors.push(
				`Disallowed file in content bindings: ${file}\n` +
					"Move logic/assets to packages/astro-bookkit or apps/<book>/src and keep content as data-only.",
			);
			continue;
		}

		// Rule 2: Deep content inspection for markdown/MDX files
		if (extension === ".md" || extension === ".mdx") {
			const content = readFileSync(file, "utf8");

			// Strip YAML frontmatter
			const body = content.startsWith("---")
				? content.slice(content.indexOf("\n---", 3) + 4)
				: content;

			// Check for illegal imports in content files
			if (
				/^\s*import\s+.*from/m.test(body) ||
				/^\s*import\s*\(["'].*["']\)/m.test(body)
			) {
				errors.push(
					`Code import detected in content binding: ${file}\n` +
						"Content files must remain data-only. Never import components or logic inside MDX content.",
				);
			}

			// Check for inline script tags
			if (/<script[\s>]/i.test(body)) {
				errors.push(
					`Inline <script> tag detected in content binding: ${file}\n` +
						"Scripts belong in UI layout components, not in replaceable content files.",
				);
			}

			// Check for inline style tags
			if (/<style[\s>]/i.test(body)) {
				errors.push(
					`Inline <style> tag detected in content binding: ${file}\n` +
						"Styles belong in engine stylesheets or layout components, not in replaceable content files.",
				);
			}
		}
	}
}

if (errors.length > 0) {
	console.error("\nSEPARATION VIOLATIONS");
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	"Separation checks passed (file boundaries and data-only content invariants verified).",
);

function listFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(fullPath));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}
