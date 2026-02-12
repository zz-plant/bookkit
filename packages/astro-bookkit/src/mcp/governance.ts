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
];

export const createGovernanceResourcesFromFiles = (
  rootDir: string,
  definitions: GovernanceFileResource[] = DEFAULT_GOVERNANCE_FILE_RESOURCES,
): McpResourceInput[] => {
  return definitions.map((definition) => {
    const filePath = resolve(rootDir, definition.relativePath);

    try {
      return {
        uri: definition.uri,
        name: definition.name,
        description: definition.description,
        mimeType: definition.mimeType,
        text: readFileSync(filePath, "utf8"),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `Unable to read governance resource \"${definition.relativePath}\" from ${filePath}: ${reason}`,
      );
    }
  });
};
