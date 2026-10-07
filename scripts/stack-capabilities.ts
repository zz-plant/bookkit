import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type PackageManifest = {
	name?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

type PackageInsight = {
	name: string;
	declaredIn: string[];
	currentRanges: string[];
	latest: string;
	next: string | null;
	risk: "none" | "patch" | "minor" | "major" | "unknown";
};

type NpmMeta = {
	"dist-tags"?: {
		latest?: string;
		next?: string;
	};
};

const WATCHLIST = [
	"astro",
	"@astrojs/mdx",
	"typescript",
	"bun",
	"mermaid",
	"jszip",
	"pdf-lib",
] as const;

const root = process.cwd();
const reportPath = argValue("--write") ?? null;

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

async function main() {
	const manifests = [
		["package.json", readManifest("package.json")],
		[
			"apps/bad-people/package.json",
			readManifest("apps/bad-people/package.json"),
		],
		[
			"packages/astro-bookkit/package.json",
			readManifest("packages/astro-bookkit/package.json"),
		],
	] as const;

	const versions = collectWatchedVersions(manifests);
	const insights = await Promise.all(
		Array.from(versions.entries()).map(async ([pkg, refs]) => {
			const meta = await fetchNpmMeta(pkg);
			const latest = meta?.["dist-tags"]?.latest ?? "unknown";
			const next = meta?.["dist-tags"]?.next ?? null;
			const currentRanges = Array.from(
				new Set(refs.map((r) => r.range)),
			).sort();
			return {
				name: pkg,
				declaredIn: refs.map((r) => r.path),
				currentRanges,
				latest,
				next,
				risk: computeRisk(currentRanges[0] ?? "", latest),
			} satisfies PackageInsight;
		}),
	);

	const markdown = renderReport(insights);
	if (reportPath) {
		writeFileSync(join(root, reportPath), markdown, "utf8");
		console.log(`Wrote capability report to ${reportPath}`);
	} else {
		console.log(markdown);
	}
}

function readManifest(relPath: string): PackageManifest {
	return JSON.parse(
		readFileSync(join(root, relPath), "utf8"),
	) as PackageManifest;
}

function collectWatchedVersions(
	manifests: readonly (readonly [string, PackageManifest])[],
): Map<string, Array<{ path: string; range: string }>> {
	const out = new Map<string, Array<{ path: string; range: string }>>();
	for (const [path, manifest] of manifests) {
		for (const deps of [manifest.dependencies, manifest.devDependencies]) {
			if (!deps) continue;
			for (const pkg of WATCHLIST) {
				const range = deps[pkg];
				if (!range) continue;
				if (!out.has(pkg)) out.set(pkg, []);
				out.get(pkg)?.push({ path, range });
			}
		}
	}
	return out;
}

async function fetchNpmMeta(pkg: string): Promise<NpmMeta | null> {
	const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
	const res = await fetch(url);
	if (!res.ok) return null;
	return (await res.json()) as NpmMeta;
}

function computeRisk(
	currentRange: string,
	latest: string,
): PackageInsight["risk"] {
	const current = extractSemver(currentRange);
	const latestParsed = extractSemver(latest);
	if (!current || !latestParsed) return "unknown";
	if (
		current.major === latestParsed.major &&
		current.minor === latestParsed.minor &&
		current.patch === latestParsed.patch
	) {
		return "none";
	}
	if (current.major !== latestParsed.major) return "major";
	if (current.minor !== latestParsed.minor) return "minor";
	return "patch";
}

function extractSemver(
	input: string,
): { major: number; minor: number; patch: number } | null {
	const match = input.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	};
}

function renderReport(insights: PackageInsight[]): string {
	const now = new Date().toISOString().slice(0, 10);
	const lines = [
		`# Tech Stack Capability Research (${now})`,
		"",
		"Generated with: `bun run stack:capabilities`.",
		"",
		"## Version scan",
		"",
		"| Package | Declared | Latest | Next/Beta | Delta |",
		"|---|---:|---:|---:|---|",
	];

	for (const item of insights.sort((a, b) => a.name.localeCompare(b.name))) {
		lines.push(
			`| ${item.name} | ${item.currentRanges.join(", ")} | ${item.latest} | ${item.next ?? "—"} | ${item.risk} |`,
		);
	}

	lines.push("", "## Notes", "");
	lines.push(
		"- `major` means latest npm stable is on a newer major than the declared range.",
	);
	lines.push("- `minor` and `patch` indicate likely lower-risk upgrades.");
	lines.push(
		"- `next`/beta tags indicate upcoming capabilities worth evaluating in a spike branch.",
	);
	lines.push("", "## Declaration locations", "");

	for (const item of insights.sort((a, b) => a.name.localeCompare(b.name))) {
		lines.push(
			`- **${item.name}**: ${Array.from(new Set(item.declaredIn)).join(", ")}`,
		);
	}

	return `${lines.join("\n")}\n`;
}

function argValue(flag: string): string | null {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return null;
	return process.argv[idx + 1] ?? null;
}
