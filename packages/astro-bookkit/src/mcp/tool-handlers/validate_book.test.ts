import { describe, expect, it } from "bun:test";

import { toValidateBookFailure } from "./validate_book";

describe("validate_book handler normalized failures", () => {
	it("matches snapshot for command failure payload", () => {
		expect(toValidateBookFailure(1)).toMatchInlineSnapshot(`
      {
        "cause": "Validation failed: validate:book exited with code 1.",
        "failingRule": "validate:book must complete with zero errors",
        "gateLevel": "blocking",
        "humanSummary": "Validation failed: validate:book exited with code 1.",
        "location": {
          "module": "scripts/validate-book.ts",
        },
        "machineCode": "VALIDATE_BOOK_COMMAND_FAILED",
        "nextAction": "Fix the reported validation ERRORS, then re-run bun run validate:book -- --book <slug>.",
        "severity": "error",
      }
    `);
	});
});
