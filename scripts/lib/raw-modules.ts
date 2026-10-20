import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BookContentRawModules } from "../../packages/astro-bookkit/src/book/entrypoints";

const SECTIONS = [
	"chapters",
	"mechanisms",
	"toolkit",
	"glossary",
	"examples",
] as const;

const listMdx = (dir: string): string[] =>
	existsSync(dir)
		? readdirSync(dir, { recursive: true })
				.map(String)
				.filter((file) => /\.mdx?$/.test(file))
		: [];

/**
 * A book's raw content sources, read from disk and keyed as the apps'
 * `import.meta.glob` keys them (`../content/book/<section>/<file>`, relative
 * to `src/lib/`), so engine code gets what it gets inside a build.
 */
export const loadRawModules = (contentRoot: string): BookContentRawModules => {
	const modules = {} as BookContentRawModules;
	for (const section of SECTIONS) {
		const dir = join(contentRoot, section);
		modules[section] = Object.fromEntries(
			listMdx(dir).map((file) => [
				`../content/book/${section}/${file.split("\\").join("/")}`,
				readFileSync(join(dir, file), "utf8"),
			]),
		);
	}
	return modules;
};
