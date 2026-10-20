import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import type { compile as compileType } from "@mdx-js/mdx";
import type remarkGfmType from "remark-gfm";
import { FRONTMATTER } from "../../packages/astro-bookkit/src/utils/frontmatter";

/**
 * Compiles a content file the way a book build does — frontmatter removed,
 * then MDX with GitHub-flavored Markdown, as `@astrojs/mdx` runs it — so a
 * file that would stop the build is caught by name and line before it does.
 * The compiler is the one the book's `@astrojs/mdx` uses, found from the
 * book's folder (or beside these scripts), so a project with isolated
 * installs checks with the same compiler its build runs.
 */

export type MdxCompileResult =
	| { ok: true }
	| {
			ok: false;
			/** 1-based line in the file, frontmatter included. */
			line?: number;
			column?: number;
			reason: string;
	  }
	/** The book's MDX compiler is not installed (a project before `bun install`). */
	| { ok: null; reason: string };

type Compiler = (source: string) => Promise<unknown>;

type Position = { line?: number; column?: number };

type CompileError = Position & {
	place?: Position & { start?: Position };
	reason?: string;
	message?: string;
};

/**
 * Whether `dir`, or a folder above it, has a node_modules folder. Where none
 * does, Bun resolves a package by downloading its latest version into its
 * cache (auto-install) instead of failing: a check would then compile with a
 * compiler the book does not use (@astrojs/mdx 8 for a book on 7), fetched
 * from the network as it runs.
 */
const isInstalledAt = (dir: string): boolean => {
	for (let at = resolvePath(dir); ; at = dirname(at)) {
		if (existsSync(join(at, "node_modules"))) return true;
		if (dirname(at) === at) return false;
	}
};

/** Where `specifier` resolves from `from`, looking only in installed packages. */
const resolve = (specifier: string, from: string): string | undefined => {
	if (!isInstalledAt(from)) return undefined;
	try {
		return Bun.resolveSync(specifier, from);
	} catch {
		return undefined;
	}
};

const compilers = new Map<string, Promise<Compiler | string>>();

const loadCompiler = (bookDir: string): Promise<Compiler | string> => {
	const cached = compilers.get(bookDir);
	if (cached) return cached;
	const loading = (async (): Promise<Compiler | string> => {
		// The book's own @astrojs/mdx, else the one beside these scripts.
		const astroMdx =
			resolve("@astrojs/mdx/package.json", bookDir) ??
			resolve("@astrojs/mdx/package.json", import.meta.dir);
		const mdx = astroMdx && resolve("@mdx-js/mdx", dirname(astroMdx));
		const gfm = astroMdx && resolve("remark-gfm", dirname(astroMdx));
		if (!mdx || !gfm) {
			return "the book's MDX compiler (@astrojs/mdx) is not installed; run bun install";
		}
		const [{ compile }, { default: remarkGfm }] = (await Promise.all([
			import(mdx),
			import(gfm),
		])) as [{ compile: typeof compileType }, { default: typeof remarkGfmType }];
		return (source) =>
			compile(source, {
				remarkPlugins: [remarkGfm],
				jsxImportSource: "astro",
				elementAttributeNameCase: "html",
			});
	})();
	compilers.set(bookDir, loading);
	return loading;
};

/** Where the error is: on the error, on its place, or only in its text ("(7:1-7:10)"). */
const positionOf = (error: CompileError, reason: string): Position => {
	const place = error.place?.start ?? error.place;
	const inText = reason.match(/\((\d+):(\d+)(?:-\d+:\d+)?\)/);
	return {
		line: error.line ?? place?.line ?? (inText ? Number(inText[1]) : undefined),
		column:
			error.column ?? place?.column ?? (inText ? Number(inText[2]) : undefined),
	};
};

/** Compiles `source` as a chapter of the book app in `bookDir` would be. */
export const compileMdx = async (
	source: string,
	bookDir: string,
): Promise<MdxCompileResult> => {
	const compile = await loadCompiler(bookDir);
	if (typeof compile === "string") return { ok: null, reason: compile };
	// The frontmatter becomes blank lines, as Astro does, so lines match the file.
	const body = source.replace(FRONTMATTER, (block) =>
		"\n".repeat(block.match(/\n/g)?.length ?? 0),
	);
	try {
		await compile(body);
		return { ok: true };
	} catch (error) {
		const failure = error as CompileError;
		const reason = failure.reason ?? failure.message ?? String(error);
		return { ok: false, ...positionOf(failure, reason), reason };
	}
};

/**
 * A compile result as a validation finding: an error naming the line and
 * column the build would stop at, a warning when the compiler is not
 * installed (so nothing was compiled), or null when the file compiles.
 */
export const compileFinding = (
	result: MdxCompileResult,
): {
	level: "error" | "warning";
	code: "MDX_COMPILE" | "MDX_NOT_COMPILED";
	message: string;
	fix: string;
} | null => {
	if (result.ok === true) return null;
	if (result.ok === null) {
		return {
			level: "warning",
			code: "MDX_NOT_COMPILED",
			message: `MDX was not compiled: ${result.reason}`,
			fix: "Run bun install, then check again.",
		};
	}
	const where = result.line
		? ` at line ${result.line}${result.column ? `, column ${result.column}` : ""}`
		: "";
	return {
		level: "error",
		code: "MDX_COMPILE",
		message: `MDX does not compile${where}: ${result.reason}`,
		fix: "The build stops on this file. Usual causes: a literal { or < in prose (write \\{ or &lt;), a tag that is never closed, or an HTML comment (write {/* … */}).",
	};
};
