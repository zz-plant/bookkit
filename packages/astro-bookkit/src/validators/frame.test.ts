import { describe, expect, it } from "bun:test";

import {
	frameStepsInHeadings,
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

describe("frameStepsInHeadings", () => {
	const runbook = {
		slug: "runbook",
		name: "Runbook",
		steps: [
			{ id: "ownership", label: "Ownership", required: true },
			{ id: "trigger", label: "Trigger", required: true },
			{ id: "steps", label: "Steps", required: true },
			{ id: "escalation", label: "Escalation", required: true },
			{ id: "verification", label: "Verification", required: true },
		],
	};

	it("credits the words runbooks actually use", () => {
		expect(
			frameStepsInHeadings(runbook, [
				"Owner",
				"Triggers and alerts",
				"Step 1: drain the node",
				"Escalation path",
				"Verify recovery",
			]),
		).toEqual(["ownership", "trigger", "steps", "escalation", "verification"]);
	});

	it("reports what no heading covers", () => {
		expect(
			frameStepsInHeadings(runbook, ["Overview", "Procedure", "Notes"]),
		).toEqual([]);
	});
});
