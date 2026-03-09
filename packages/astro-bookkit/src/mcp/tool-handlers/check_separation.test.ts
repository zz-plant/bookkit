import { describe, expect, it } from "bun:test";

import { toCheckSeparationFailure } from "./check_separation";

describe("check_separation handler normalized failures", () => {
  it("matches snapshot for command failure payload", () => {
    expect(toCheckSeparationFailure(1)).toMatchInlineSnapshot(`
      {
        "cause": "Separation checks failed: check:separation exited with code 1.",
        "failingRule": "content bindings must remain data-only and pass separation checks",
        "gateLevel": "blocking",
        "humanSummary": "Separation checks failed: check:separation exited with code 1.",
        "location": {
          "module": "scripts/check-separation.ts",
        },
        "machineCode": "CHECK_SEPARATION_COMMAND_FAILED",
        "nextAction": "Resolve the reported SEPARATION VIOLATIONS, then re-run bun run check:separation.",
        "severity": "error",
      }
    `);
  });
});
