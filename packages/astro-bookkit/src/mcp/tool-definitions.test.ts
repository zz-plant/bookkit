import { describe, expect, it } from "bun:test";

import { TOOL_DEFINITIONS } from "./tool-definitions";

describe("TOOL_DEFINITIONS", () => {
	it("requires complete operational metadata for every tool", () => {
		expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);

		for (const tool of TOOL_DEFINITIONS) {
			expect(tool.expectedRuntime.length).toBeGreaterThan(0);
			expect(tool.expectedRuntimeClass.length).toBeGreaterThan(0);
			expect(tool.sideEffectLevel.length).toBeGreaterThan(0);
			expect(typeof tool.idempotent).toBe("boolean");
			expect(tool.idempotencyGuarantee.length).toBeGreaterThan(0);
			expect(tool.retryGuidance.length).toBeGreaterThan(0);
			expect(tool.retryPolicyGuidance.length).toBeGreaterThan(0);
			expect(tool.failureClassTaxonomy.length).toBeGreaterThan(0);
		}
	});
});
