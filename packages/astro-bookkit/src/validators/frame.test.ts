import { describe, expect, it } from "bun:test";

import { defaultFrames } from "../frames/defaults";
import {
	frameStepsInPage,
	validateFrameDefinition,
	validateFrameSteps,
} from "./frame";

describe("frame validator normalized errors", () => {
	it("returns snapshot-friendly payload for missing required steps", () => {
		const result = validateFrameSteps(
			{
				slug: "argument-frame",
				name: "Argument Frame",
				steps: [
					{ id: "claim", label: "Claim", required: true },
					{ id: "evidence", label: "Evidence", required: true },
				],
			},
			["claim"],
		);

		expect(result).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "failingRule": "required frame step must be present",
            "gateLevel": "blocking",
            "humanSummary": "Frame "argument-frame" is missing required step "evidence".",
            "location": {
              "file": "argument-frame",
              "module": "validators/frame",
            },
            "machineCode": "FRAME_REQUIRED_STEP_MISSING",
            "nextAction": "Add step "evidence" to the frame content before validating again.",
            "severity": "error",
          },
        ],
        "missingRequiredSteps": [
          "evidence",
        ],
      }
    `);
	});

	it("returns snapshot-friendly payload for duplicate step ids", () => {
		const result = validateFrameDefinition({
			slug: "argument-frame",
			name: "Argument Frame",
			steps: [
				{ id: "claim", label: "Claim", required: true },
				{ id: "claim", label: "Second claim", required: false },
			],
		});

		expect(result).toMatchInlineSnapshot(`
      {
        "duplicateStepIds": [
          "claim",
        ],
        "errors": [
          {
            "failingRule": "frame step ids must be unique",
            "gateLevel": "blocking",
            "humanSummary": "Frame "argument-frame" defines duplicate step id "claim".",
            "location": {
              "file": "argument-frame",
              "module": "validators/frame",
            },
            "machineCode": "FRAME_DUPLICATE_STEP_ID",
            "nextAction": "Rename one of the "claim" steps to a unique id.",
            "severity": "error",
          },
        ],
      }
    `);
	});
});

describe("frameStepsInPage", () => {
	const frame = (slug: string) => {
		const found = defaultFrames.find((candidate) => candidate.slug === slug);
		if (!found) throw new Error(`no frame ${slug}`);
		return found;
	};
	const fieldGuide = frame("field-guide");

	it("counts a heading whose whole text is the step's name, however it is written", () => {
		for (const heading of [
			"## Failure Modes",
			"## Failure modes",
			"## failure-modes",
			"### **Failure** _modes_",
			"#### Failure Modes ##",
			"## [Failure Modes](#failure-modes)",
			"## `failure-modes`",
			"Failure Modes\n-------------",
		]) {
			expect(frameStepsInPage(fieldGuide, heading)).toEqual(["failure-modes"]);
		}
	});

	it("counts a heading nested in a list item, however deep, or in a <details> inside one", () => {
		expect(
			frameStepsInPage(
				fieldGuide,
				"1. First:\n\n    ## Steps\n\n- Outer\n  - Inner\n\n    ## Failure Modes\n\n- More\n\n  <details>\n  <summary>Notes</summary>\n\n      ### Checklist\n\n  </details>\n",
			),
		).toEqual(["steps", "failure-modes", "checklist"]);
	});

	it("does not count a heading that says more, says it in other words, or is not a heading", () => {
		for (const page of [
			"## Failure modes we have seen",
			"## Failure — modes",
			"## Failures",
			"##### Failure Modes",
			"Failure Modes",
			"```md\n## Failure Modes\n```",
			"<h2>Failure Modes</h2>",
		]) {
			expect(frameStepsInPage(fieldGuide, page)).toEqual([]);
		}
	});

	it("reads every step of a page, a repeated heading included", () => {
		expect(
			frameStepsInPage(
				frame("runbook"),
				[
					"# Overview",
					"## Ownership",
					"Who owns it.",
					"## Trigger",
					"## Steps",
					"### Steps",
					"## Escalation:",
					"## Verification?",
				].join("\n\n"),
			),
		).toEqual(["ownership", "trigger", "steps", "escalation", "verification"]);
		expect(
			frameStepsInPage(
				frame("intervention"),
				"## Recognition and blame\n\n## Exoneration\n",
			),
		).toEqual(["exoneration"]);
	});
});
