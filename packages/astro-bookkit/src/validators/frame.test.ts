import { describe, expect, it } from "bun:test";

import { validateFrameDefinition, validateFrameSteps } from "./frame";

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
