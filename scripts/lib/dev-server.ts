import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
		{ cwd: appDir, stdio: "inherit" },
	);
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => child.kill(signal));
	}
	return new Promise((resolve) => {
		child.once("error", (error) => {
			console.error(
				`Could not start the dev server with ${runtime}: ${error.message}`,
			);
			resolve(1);
		});
		child.once("exit", (code, signal) =>
			resolve(code ?? 128 + (signal ? constants.signals[signal] : 0)),
		);
	});
};
