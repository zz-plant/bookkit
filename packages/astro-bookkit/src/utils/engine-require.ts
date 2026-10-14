import { createRequire } from "node:module";

/**
 * `require` from the engine package's own folder. This code also runs
 * bundled, into a book's dist/ or its Astro config, where `import.meta.url`
 * is the bundle's location; under Bun's isolated installs the engine's own
 * dependencies (satori, resvg, the Newsreader font files) are reachable only
 * from the engine's folder. Falls back to this module's location when the
 * engine cannot be found by name.
 */
export const engineRequire = (): NodeJS.Require => {
	const local = createRequire(import.meta.url);
	try {
		return createRequire(local.resolve("@bookkit/astro-bookkit/package.json"));
	} catch {
		return local;
	}
};
