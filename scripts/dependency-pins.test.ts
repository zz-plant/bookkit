import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * package.json's `overrides` pin some packages to one version. A workspace
 * that asks for that package must ask for a range the pin is in, or its
 * range says one thing and bun.lock installs another: #317 bumped the
 * engine's mermaid to ^12.2.0 while the pin kept 11.12.2. Dependabot must
 * not offer such a bump either, nor TypeScript 7, which #320 brought and
 * main reverted.
 */

const root = repoRoot();
const readJson = (path: string) =>
	JSON.parse(readFileSync(join(root, path), "utf8")) as Record<
		string,
		Record<string, string> | undefined
	>;

const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

/** The repository's package.json and each workspace's. */
const manifests = [
	"package.json",
	...["packages", "apps"].flatMap((dir) =>
		readdirSync(join(root, dir))
			.map((name) => `${dir}/${name}/package.json`)
			.filter((path) => existsSync(join(root, path))),
	),
];

/** Overrides that pin one exact version, by package. */
const pins = Object.entries(readJson("package.json").overrides ?? {}).filter(
	([, version]) => /^\d+\.\d+\.\d+$/.test(version),
);

type DependabotUpdate = {
	"package-ecosystem": string;
	ignore?: Array<{ "dependency-name": string; versions?: string[] }>;
};
const bunUpdates = (
	Bun.YAML.parse(
		readFileSync(join(root, ".github", "dependabot.yml"), "utf8"),
	) as { updates: DependabotUpdate[] }
).updates.find((update) => update["package-ecosystem"] === "bun");
const ignored = (name: string) =>
	(bunUpdates?.ignore ?? []).filter((rule) => rule["dependency-name"] === name);

describe("pinned dependencies", () => {
	it("are asked for at a range the pin is in", () => {
		expect(pins.length).toBeGreaterThan(0);
		const mismatches = manifests.flatMap((manifest) => {
			const pkg = readJson(manifest);
			return DEPENDENCY_FIELDS.flatMap((field) =>
				pins.flatMap(([name, version]) => {
					const range = pkg[field]?.[name];
					return range && !Bun.semver.satisfies(version, range)
						? [
								`${manifest} ${field}.${name} is "${range}", but package.json's overrides pin ${name} to ${version}, so bun.lock installs ${version}. Ask for a range ${version} is in, or lift the pin (see .github/dependabot.yml).`,
							]
						: [];
				}),
			);
		});
		expect(mismatches).toEqual([]);
	});

	it("are not offered by Dependabot while the pin holds", () => {
		const offered = pins
			.filter(([name]) =>
				manifests.some((manifest) => {
					const pkg = readJson(manifest);
					return DEPENDENCY_FIELDS.some((field) => pkg[field]?.[name]);
				}),
			)
			.filter(
				([name]) => !ignored(name).some((rule) => rule.versions === undefined),
			)
			.map(([name, version]) => `${name} (pinned to ${version})`);
		expect(offered).toEqual([]);
	});

	it("leave TypeScript 7 out of Dependabot's updates", () => {
		expect(ignored("typescript").flatMap((rule) => rule.versions)).toContain(
			">=7.0.0",
		);
	});
});
