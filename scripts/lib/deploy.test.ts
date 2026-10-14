import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	countSitemapUrls,
	type DeployStamp,
	distDigest,
	findDeployableBooks,
	pageDropProblem,
	stampProblem,
	VERSION_MESSAGE_LIMIT,
	versionMessage,
} from "./deploy";

const scratch = mkdtempSync(join(tmpdir(), "bookkit-deploy-lib-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const write = (path: string, content = "") => {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, content);
};

describe("findDeployableBooks", () => {
	it("keeps folders with book.config.ts and wrangler.jsonc, sorted, and names what the rest lack", () => {
		const apps = join(scratch, "apps");
		for (const book of ["zeta", "alpha"]) {
			write(join(apps, book, "src", "book.config.ts"));
			write(join(apps, book, "wrangler.jsonc"));
		}
		write(join(apps, "notes", "README.md"));
		write(join(apps, "draft", "src", "book.config.ts"));
		write(join(apps, "loose-file.txt"));

		expect(findDeployableBooks(apps)).toEqual({
			books: ["alpha", "zeta"],
			skipped: [
				{ dir: "draft", missing: ["wrangler.jsonc"] },
				{ dir: "notes", missing: ["src/book.config.ts", "wrangler.jsonc"] },
			],
		});
		expect(findDeployableBooks(join(scratch, "missing"))).toEqual({
			books: [],
			skipped: [],
		});
	});
});

describe("versionMessage", () => {
	const git = {
		commit: "0123456789abcdef0123456789abcdef01234567",
		subject: "Fix the overview",
		dirty: [],
	};

	it("names the commit and its subject, and marks uncommitted work", () => {
		expect(versionMessage(git, false)).toBe("0123456789ab Fix the overview");
		expect(versionMessage(git, true)).toBe(
			"0123456789ab+uncommitted Fix the overview",
		);
		expect(versionMessage(null, true)).toBe(
			"uncommitted build outside a git checkout",
		);
	});

	it("fits Cloudflare's 100-character limit", () => {
		const message = versionMessage({ ...git, subject: "x".repeat(200) }, false);
		expect(message).toHaveLength(VERSION_MESSAGE_LIMIT);
		expect(message.endsWith("…")).toBe(true);
	});
});

describe("distDigest", () => {
	it("changes when any file's bytes or name change, and not otherwise", () => {
		const dist = join(scratch, "dist");
		write(join(dist, "index.html"), "<p>one</p>");
		write(join(dist, "read", "a.html"), "a");
		const first = distDigest(dist);
		expect(distDigest(dist)).toBe(first);

		write(join(dist, "read", "a.html"), "b");
		expect(distDigest(dist)).not.toBe(first);

		write(join(dist, "read", "a.html"), "a");
		expect(distDigest(dist)).toBe(first);
		write(join(dist, "read", "b.html"), "");
		expect(distDigest(dist)).not.toBe(first);
	});
});

describe("stampProblem", () => {
	const commit = "a".repeat(40);
	const stamp: DeployStamp = {
		book: "on-call",
		commit,
		uncommitted: false,
		digest: "d1",
		checkedAt: "2026-10-14T00:00:00.000Z",
	};
	const check = (overrides: Partial<Parameters<typeof stampProblem>[0]>) =>
		stampProblem({
			book: "on-call",
			stamp,
			commit,
			digest: "d1",
			allowUncommitted: false,
			...overrides,
		});

	it("passes a dist/ stamped at HEAD and unchanged since", () => {
		expect(check({})).toBeNull();
	});

	it("names each reason a dist/ cannot be published as is", () => {
		expect(check({ stamp: null })).toContain(
			"apps/on-call/dist/ has no deploy stamp",
		);
		expect(check({ commit: "b".repeat(40) })).toContain(
			"was built at aaaaaaaaaaaa, but HEAD is bbbbbbbbbbbb",
		);
		expect(check({ digest: "d2" })).toContain(
			"changed since bookkit deploy checked it",
		);
		expect(check({ digest: null })).toContain("is gone since");
		const uncommitted = { ...stamp, uncommitted: true };
		expect(check({ stamp: uncommitted })).toContain(
			"was built with uncommitted changes",
		);
		expect(check({ stamp: uncommitted, allowUncommitted: true })).toBeNull();
	});
});

describe("page count", () => {
	it("counts sitemap URLs", () => {
		expect(
			countSitemapUrls(
				"<urlset><url><loc>https://a/</loc></url><url><loc>https://a/b</loc></url></urlset>",
			),
		).toBe(2);
		expect(countSitemapUrls("<html>not a sitemap</html>")).toBe(0);
	});

	it("objects only when more than a quarter of the live pages would disappear", () => {
		const liveUrl = "https://book.example/sitemap.xml";
		expect(pageDropProblem({ live: 40, next: 30, liveUrl })).toBeNull();
		expect(pageDropProblem({ live: 40, next: 29, liveUrl })).toContain(
			"its sitemap lists 29 page(s), but 40 are live (https://book.example/sitemap.xml)",
		);
		expect(pageDropProblem({ live: 0, next: 0, liveUrl })).toBeNull();
	});
});
