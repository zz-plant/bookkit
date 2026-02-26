import { describe, expect, it } from "bun:test";
import {
  createBreadcrumbListStructuredData,
  createDefinedTermStructuredData,
} from "./structured-data";

describe("structured data helpers", () => {
  it("builds BreadcrumbList payloads with stable positions", () => {
    const payload = createBreadcrumbListStructuredData([
      { name: "Reading hub", item: "https://example.com/read" },
      { name: "Mechanisms", item: "https://example.com/read/mechanisms" },
    ]);

    expect(payload).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Reading hub",
          item: "https://example.com/read",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Mechanisms",
          item: "https://example.com/read/mechanisms",
        },
      ],
    });
  });

  it("builds DefinedTerm payloads", () => {
    const payload = createDefinedTermStructuredData({
      name: "Delay as force",
      description: "Waiting used to exhaust options.",
      termCode: "delay-as-force",
      url: "https://example.com/read/mechanisms/delay-as-force",
      inDefinedTermSet: "https://example.com/read/mechanisms",
    });

    expect(payload).toEqual({
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: "Delay as force",
      description: "Waiting used to exhaust options.",
      termCode: "delay-as-force",
      url: "https://example.com/read/mechanisms/delay-as-force",
      inDefinedTermSet: "https://example.com/read/mechanisms",
    });
  });
});
