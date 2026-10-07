import { describe, expect, it } from "bun:test";

import { createGovernanceResourcesFromFiles } from "./governance";

describe("createGovernanceResourcesFromFiles", () => {
	it("includes command reference generated from root package scripts metadata", () => {
		const resources = createGovernanceResourcesFromFiles(process.cwd());
		const commandReference = resources.find(
			(resource) =>
				resource.uri === "bookkit://governance/commands/root-scripts",
		);

		expect(commandReference).toBeDefined();
		expect(commandReference?.text).toContain("# Root command reference");
		expect(commandReference?.text).toContain("bun run list:books");
		expect(commandReference?.mimeType).toBe("text/markdown");
		expect(commandReference?.supportsChunking).toBe(true);
		expect(commandReference?.supportsSectionIndex).toBe(true);
	});
});
