// Runs one book's Astro dev server for `bookkit dev`, under Node like the
// `astro` command. It uses Astro's JavaScript API because `astro dev` moves
// itself to the background when it detects an AI agent, returning at once and
// leaving the server holding its port; this process instead lives exactly as
// long as the server.
//
// Usage: node scripts/lib/astro-dev.mjs <app dir> <port>
import { createRequire } from "node:module";
import { constants } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [appDir, port] = process.argv.slice(2);
const astroEntry = createRequire(join(appDir, "package.json")).resolve("astro");
const { dev } = await import(pathToFileURL(astroEntry).href);

let server;
try {
	server = await dev({
		root: appDir,
		server: { port: Number(port) },
		// Fail on a taken port instead of moving to the next free one, so the
		// URL a script or agent was given is the one that answers.
		vite: { server: { strictPort: true } },
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

// Stop the server, then exit as a shell reports a signal (128 + its number:
// 130 for Ctrl-C, 143 for SIGTERM), which is also what Vite does on SIGTERM.
let stopping = false;
const stop = async (signal) => {
	if (stopping) return;
	stopping = true;
	await server.stop();
	process.exit(128 + constants.signals[signal]);
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.on(signal, () => stop(signal));
}

// If `bookkit dev` is killed outright (SIGKILL), this process is re-parented;
// stop rather than keep the port.
const parent = process.ppid;
setInterval(() => {
	if (process.ppid !== parent) void stop("SIGHUP");
}, 1000).unref();
