import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { McpResourceInput } from "./endpoint";

export type GovernanceFileResource = Omit<McpResourceInput, "text"> & {
	relativePath: string;
};

export const DEFAULT_GOVERNANCE_FILE_RESOURCES: GovernanceFileResource[] = [
	{
		uri: "bookkit://governance/README.md",
		name: "Bookkit README",
		description: "Orientation and daily commands.",
		relativePath: "README.md",
	},
	{
		uri: "bookkit://governance/CONTRIBUTING.md",
		name: "Bookkit CONTRIBUTING",
		description: "Contribution workflow and lanes.",
		relativePath: "CONTRIBUTING.md",
	},
	{
		uri: "bookkit://governance/AGENTS.md",
		name: "Bookkit AGENTS",
		description: "Architectural invariants and risk boundaries.",
		relativePath: "AGENTS.md",
	},
	{
		uri: "bookkit://governance/docs/architecture.md",
		name: "Bookkit architecture",
		description:
			"System structure: layers, pipelines, engine module map, import tiers.",
		relativePath: "docs/architecture.md",
	},
	{
		uri: "bookkit://governance/docs/bets.md",
		name: "Bookkit bets",
		description:
			"What gets worked on next and why: the anchor, active bets, parked work.",
		relativePath: "docs/bets.md",
	},
	{
		uri: "bookkit://governance/docs/design-notes.md",
		name: "Bookkit design notes",
		description: "Why the invariants exist, and the error philosophy.",
		relativePath: "docs/design-notes.md",
	},
	{
		uri: "bookkit://governance/docs/guide/concepts.md",
		name: "Bookkit guide: concepts and configuration",
		description:
			"Record types, frames, book status, book.config.ts fields, and the files Bookkit writes.",
		relativePath: "docs/guide/concepts.md",
	},
	{
		uri: "bookkit://governance/docs/guide/checks.md",
		name: "Bookkit guide: what the checks enforce",
		description:
			"Content rules, link and HTML safety, build checks, runbook coverage.",
		relativePath: "docs/guide/checks.md",
	},
	{
		uri: "bookkit://governance/docs/guide/ai.md",
		name: "Bookkit guide: proposals, AI, and MCP",
		description: "Proposal bundles, the embedding model, and the MCP tools.",
		relativePath: "docs/guide/ai.md",
	},
	{
		uri: "bookkit://governance/.codex/skills/README.md",
		name: "Bookkit local skills index",
		description: "Local skill registry for lane-based contributor workflows.",
		relativePath: ".codex/skills/README.md",
	},
	{
		uri: "bookkit://governance/.codex/skills/content-edit/SKILL.md",
		name: "Bookkit skill: content-edit",
		description: "Checklist for content and book-app lane edits.",
		relativePath: ".codex/skills/content-edit/SKILL.md",
	},
	{
		uri: "bookkit://governance/.codex/skills/engine-change/SKILL.md",
		name: "Bookkit skill: engine-change",
		description: "Checklist for engine, schema, and validator changes.",
		relativePath: ".codex/skills/engine-change/SKILL.md",
	},
	{
		uri: "bookkit://governance/.codex/skills/release/SKILL.md",
		name: "Bookkit skill: release",
		description: "Checklist for release and versioning updates.",
		relativePath: ".codex/skills/release/SKILL.md",
	},
	{
		uri: "bookkit://governance/.codex/skills/reader-typography/SKILL.md",
		name: "Bookkit skill: reader-typography",
		description:
			"Typographic system and review checklist for reader-facing UI changes.",
		relativePath: ".codex/skills/reader-typography/SKILL.md",
	},
	{
		uri: "bookkit://governance/.codex/skills/verify/SKILL.md",
		name: "Bookkit skill: verify",
		description:
			"Before any commit: run the checks the change needs and read the summary.",
		relativePath: ".codex/skills/verify/SKILL.md",
	},
];

export const CORE_GOVERNANCE_FILE_RESOURCES: GovernanceFileResource[] = [
	{
		uri: "bookkit://governance/README.md",
		name: "Bookkit README",
		description: "Orientation and daily commands.",
		relativePath: "README.md",
	},
	{
		uri: "bookkit://governance/CONTRIBUTING.md",
		name: "Bookkit CONTRIBUTING",
		description: "Contribution workflow and lanes.",
		relativePath: "CONTRIBUTING.md",
	},
	{
		uri: "bookkit://governance/AGENTS.md",
		name: "Bookkit AGENTS",
		description: "Architectural invariants and risk boundaries.",
		relativePath: "AGENTS.md",
	},
];

type GovernanceLoadOptions = {
	allowMissingFiles?: boolean;
};

type PackageScriptsMetadata = {
	scripts?: Record<string, string>;
};

const COMMAND_REFERENCE_URI = "bookkit://governance/commands/root-scripts";

const createRootScriptsCommandReference = (
	rootDir: string,
): McpResourceInput => {
	const packageJsonPath = resolve(rootDir, "package.json");
	const packageJsonRaw = readFileSync(packageJsonPath, "utf8");

	let packageJson: PackageScriptsMetadata;
	try {
		packageJson = JSON.parse(packageJsonRaw) as PackageScriptsMetadata;
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown error";
		throw new Error(
			`Unable to parse scripts metadata from ${packageJsonPath}: ${reason}. Validate package.json and retry.`,
		);
	}

	const scripts = packageJson.scripts ?? {};
	const lines = [
		"# Root command reference",
		"",
		"Generated from `package.json#scripts`.",
		"",
		"| Command | Script |",
		"| --- | --- |",
		...Object.entries(scripts).map(
			([command, script]) => `| \`bun run ${command}\` | \`${script}\` |`,
		),
	];

	return {
		uri: COMMAND_REFERENCE_URI,
		name: "Bookkit root command reference",
		description:
			"Deterministic command list generated from root package scripts metadata.",
		mimeType: "text/markdown",
		text: lines.join("\n"),
		supportsChunking: true,
		supportsSectionIndex: true,
	};
};

export const createGovernanceResourcesFromFiles = (
	rootDir: string,
	definitions: GovernanceFileResource[] = DEFAULT_GOVERNANCE_FILE_RESOURCES,
	options: GovernanceLoadOptions = {},
): McpResourceInput[] => {
	const fileResources = definitions.flatMap((definition) => {
		const filePath = resolve(rootDir, definition.relativePath);

		try {
			return [
				{
					uri: definition.uri,
					name: definition.name,
					description: definition.description,
					mimeType: definition.mimeType,
					text: readFileSync(filePath, "utf8"),
					supportsChunking: true,
					supportsSectionIndex: true,
				},
			];
		} catch (error) {
			if (options.allowMissingFiles) {
				return [];
			}

			const reason = error instanceof Error ? error.message : "unknown error";
			throw new Error(
				`Unable to read governance resource "${definition.relativePath}" from ${filePath}: ${reason}`,
			);
		}
	});

	return [...fileResources, createRootScriptsCommandReference(rootDir)];
};
