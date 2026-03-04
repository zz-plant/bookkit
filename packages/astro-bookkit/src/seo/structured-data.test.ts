import { describe, expect, it } from "bun:test";
import {
  createBreadcrumbListStructuredData,
  createBreadcrumbListStructuredDataFromTrail,
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

  it("builds BreadcrumbList payloads from breadcrumb trail items", () => {
    const payload = createBreadcrumbListStructuredDataFromTrail(
      [
        { name: "Reading hub", href: "/es/read" },
        { name: "Mechanisms", href: "/es/read/mechanisms" },
        { name: "Delay as force" },
      ],
      "https://example.com/es/read/mechanisms/delay-as-force"
    );

    expect(payload).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Reading hub",
          item: "https://example.com/es/read",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Mechanisms",
          item: "https://example.com/es/read/mechanisms",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Delay as force",
          item: "https://example.com/es/read/mechanisms/delay-as-force",
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
