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
    description: "Architecture and operational commands.",
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
    uri: "bookkit://governance/STACK_CAPABILITIES_RESEARCH.md",
    name: "Bookkit stack capability research",
    description: "Operational dependency capability snapshot and version scan.",
    relativePath: "STACK_CAPABILITIES_RESEARCH.md",
  },
  {
    uri: "bookkit://governance/docs/mcp-agent-skills-research.md",
    name: "Bookkit MCP and agent skills research",
    description: "MCP/skill adoption options and phased implementation guidance.",
    relativePath: "docs/mcp-agent-skills-research.md",
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
];

export const CORE_GOVERNANCE_FILE_RESOURCES: GovernanceFileResource[] = [
  {
    uri: "bookkit://governance/README.md",
    name: "Bookkit README",
    description: "Architecture and operational commands.",
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

const createRootScriptsCommandReference = (rootDir: string): McpResourceInput => {
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
    ...Object.entries(scripts).map(([command, script]) => `| \`bun run ${command}\` | \`${script}\` |`),
  ];

  return {
    uri: COMMAND_REFERENCE_URI,
    name: "Bookkit root command reference",
    description: "Deterministic command list generated from root package scripts metadata.",
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
      return [{
        uri: definition.uri,
        name: definition.name,
        description: definition.description,
        mimeType: definition.mimeType,
        text: readFileSync(filePath, "utf8"),
        supportsChunking: true,
        supportsSectionIndex: true,
      }];
    } catch (error) {
      if (options.allowMissingFiles) {
        return [];
      }

      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `Unable to read governance resource \"${definition.relativePath}\" from ${filePath}: ${reason}`,
      );
    }
  });

  return [...fileResources, createRootScriptsCommandReference(rootDir)];
};
