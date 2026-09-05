import { describe, expect, test } from "bun:test";
import { defaultFrames } from "../frames/defaults";
import { extractFrameConfigFromSource } from "./frame-config";

describe("extractFrameConfigFromSource", () => {
	test("parses slug and steps from a frame property", () => {
		const source = `
			const isProduction = true;
			export const bookConfig = {
				slug: "on-call",
				frame: {
					slug: "runbook",
					steps: ["ownership", "trigger", "steps", "escalation", "verification"],
					intent: "Move readers from alarm to bounded action.",
				},
				constraints: { mechanismCountTarget: [4, 6] },
			} as const;
			export default bookConfig;
		`;
		const result = extractFrameConfigFromSource(source);
		expect(result).toEqual({
			slug: "runbook",
			steps: ["ownership", "trigger", "steps", "escalation", "verification"],
		});
	});

	test("returns null when no frame property exists", () => {
		const source = `export const bookConfig = { slug: "bad-people" } as const;`;
		expect(extractFrameConfigFromSource(source)).toBeNull();
	});

	test("ignores braces inside string literals", () => {
		const source = `
			export const bookConfig = {
				frame: {
					slug: "intervention",
					intent: "Move readers {from} {harm}.",
					steps: ["recognition"],
				},
			} as const;
		`;
		const result = extractFrameConfigFromSource(source);
		expect(result?.slug).toBe("intervention");
		expect(result?.steps).toEqual(["recognition"]);
	});

	test("supports single-quoted and template-literal values", () => {
		const source = `
			export const bookConfig = {
				frame: {
					slug: 'field-guide',
					steps: ['steps', \`checklist\`],
				},
			} as const;
		`;
		const result = extractFrameConfigFromSource(source);
		expect(result?.slug).toBe("field-guide");
		expect(result?.steps).toEqual(["steps", "checklist"]);
	});
});

describe("defaultFrames runbook", () => {
	test("runbook frame exists with the expected required steps", () => {
		const frame = defaultFrames.find((f) => f.slug === "runbook");
		expect(frame).toBeDefined();
		expect(frame?.steps.map((s) => s.id)).toEqual([
			"ownership",
			"trigger",
			"steps",
			"escalation",
			"verification",
		]);
		expect(frame?.steps.every((s) => s.required)).toBe(true);
	});
});
