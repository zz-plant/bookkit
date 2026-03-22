import { describe, expect, it } from "bun:test";

import type { SearchEntry } from "../../search/index";
import { buildRankedResults } from "./search-ranking";

const entries: SearchEntry[] = [
  {
    id: "mechanisms-transfer-success-intro",
    type: "mechanisms",
    label: "Mechanisms",
    order: 2,
    title: "Transfer success",
    snippet: "Use this pattern to improve transfer between teams.",
    url: "/read/mechanisms/transfer-success",
    context: "Transfer success",
  },
  {
    id: "chapters-compliance-intro",
    type: "chapters",
    label: "Chapters",
    order: 1,
    title: "Compliance traps",
    snippet: "This chapter mentions transfer and governance.",
    url: "/read/chapters/compliance-traps",
    context: "Compliance traps",
  },
  {
    id: "glossary-transfer-intro",
    type: "glossary",
    label: "Glossary",
    order: 3,
    title: "Transfer",
    snippet: "A short definition.",
    url: "/read/glossary/transfer",
    context: "Glossary of terms",
  },
];

describe("search ranking", () => {
  it("requires every token to match and prioritizes title/context matches", () => {
    const { tokens, results } = buildRankedResults(entries, "transfer success");

    expect(tokens).toEqual(["transfer", "success"]);
    expect(results.map((entry) => entry.id)).toEqual(["mechanisms-transfer-success-intro"]);
  });

  it("keeps stronger title matches ahead of snippet-only matches", () => {
    const { results } = buildRankedResults(entries, "transfer");

    expect(results.map((entry) => entry.id)).toEqual([
      "mechanisms-transfer-success-intro",
      "glossary-transfer-intro",
      "chapters-compliance-intro",
    ]);
  });
});
