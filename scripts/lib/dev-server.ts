import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { constants } from "node:os";
import { join } from "node:path";
import { listBookDirs, repoRoot } from "../_lib";

/**
 * `bookkit dev`: one book's dev server in the foreground. The command returns
 * when the server stops, with its exit status; SIGINT, SIGTERM, or SIGHUP stop
 * the server first (exit 128 + the signal's number, as a shell reports it), so
 * a script or agent that started it can end it and get the port back.
 */

export const DEFAULT_DEV_PORT = 4321;

/** Whether something accepts connections on the port, over IPv4 or IPv6. */
export const isPortInUse = async (port: number): Promise<boolean> => {
	const probe = (host: string) =>
		new Promise<boolean>((resolve) => {
			const socket = connect({ host, port });
			const done = (inUse: boolean) => {
				socket.destroy();
				resolve(inUse);
			};
			socket.setTimeout(1000, () => done(false));
			socket.once("connect", () => done(true));
			socket.once("error", () => done(false));
		});
	const results = await Promise.all([probe("127.0.0.1"), probe("::1")]);
	return results.some(Boolean);
};

/**
 * A dev server that `astro dev` left running in the background on this port:
 * Astro records it in `apps/<book>/.astro/dev.json`.
 */
const findBackgroundServer = (
	port: number,
): { book: string; pid: number } | null => {
	for (const book of listBookDirs()) {
		const lockFile = join(repoRoot(), "apps", book, ".astro", "dev.json");
		if (!existsSync(lockFile)) continue;
		try {
			const lock = JSON.parse(readFileSync(lockFile, "utf8"));
			if (lock.port !== port || typeof lock.pid !== "number") continue;
			process.kill(lock.pid, 0);
			return { book, pid: lock.pid };
		} catch {
			// Unreadable lock file, or its process is gone.
		}
	}
	return null;
};

export const portInUseMessage = (book: string, port: number): string => {
	const holder = findBackgroundServer(port);
	const otherPort = `bun run bookkit dev ${book} --port ${port + 1}`;
	return [
		`Port ${port} is already in use, so the dev server for ${book} cannot start there.`,
		holder
			? `It is held by the dev server for ${holder.book} that astro dev left running in the background (pid ${holder.pid}). Stop it with \`bun run bookkit dev stop ${holder.book}\`, or start on another port: ${otherPort}`
			: `Stop the process listening on it, or start on another port: ${otherPort}`,
	].join("\n");
};

/**
 * Where `bookkit dev` records the server it runs in the foreground, so that
 * `bookkit dev stop` and `dev status` from another terminal find it.
 */
const foregroundLock = (book: string): string =>
	join(repoRoot(), ".bookkit", "dev", `${book}.json`);

/** The dev server `bookkit dev` is running for `book`, if its process is alive. */
export const foregroundServer = (
	book: string,
): { pid: number; port: number } | null => {
	const lockFile = foregroundLock(book);
	if (!existsSync(lockFile)) return null;
	try {
		const lock = JSON.parse(readFileSync(lockFile, "utf8"));
		if (typeof lock.pid !== "number" || typeof lock.port !== "number") {
			return null;
		}
		process.kill(lock.pid, 0);
		return { pid: lock.pid, port: lock.port };
	} catch {
		// Its process is gone: the lock is stale.
		rmSync(lockFile, { force: true });
		return null;
	}
};

/** Left by `bookkit dev stop`, so the server it stops exits 0: stopped on purpose, not failed. */
const stopMarker = (book: string): string =>
	join(repoRoot(), ".bookkit", "dev", `${book}.stop`);

/** Stops the server `bookkit dev` runs for `book` in another terminal. */
export const stopForegroundServer = (server: { pid: number }, book: string) => {
	writeFileSync(stopMarker(book), "");
	process.kill(server.pid, "SIGTERM");
};

/** Runs the dev server for `book` until it stops; resolves to the exit status. */
export const runDevServer = async (
	book: string,
	port: number,
): Promise<number> => {
	if (await isPortInUse(port)) {
		console.error(portInUseMessage(book, port));
		return 1;
	}
	const appDir = join(repoRoot(), "apps", book);
	// Node, like the `astro` command; Bun stands in when Node is not installed.
	const runtime = Bun.which("node") ?? process.execPath;
	const child = spawn(
		runtime,
		[join(import.meta.dir, "astro-dev.mjs"), appDir, String(port)],
		{
			cwd: appDir,
			stdio: "inherit",
			// The workspace pins Astro; its "upgrade available" notice would ask
			// an author to change a version they do not own.
			env: { ...process.env, ASTRO_DISABLE_UPDATE_CHECK: "true" },
		},
	);
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => child.kill(signal));
	}
	const lockFile = foregroundLock(book);
	mkdirSync(join(lockFile, ".."), { recursive: true });
	rmSync(stopMarker(book), { force: true });
	writeFileSync(lockFile, JSON.stringify({ pid: process.pid, port }));
	child.once("exit", () => rmSync(lockFile, { force: true }));
	return new Promise((resolve) => {
		child.once("error", (error) => {
			console.error(
				`Could not start the dev server with ${runtime}: ${error.message}`,
			);
			resolve(1);
		});
		child.once("exit", (code, signal) => {
			if (existsSync(stopMarker(book))) {
				rmSync(stopMarker(book), { force: true });
				console.log(`\nStopped by bun run bookkit dev stop ${book}.`);
				resolve(0);
				return;
			}
			resolve(code ?? 128 + (signal ? constants.signals[signal] : 0));
		});
	});
};
