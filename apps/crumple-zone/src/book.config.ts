export const bookConfig = {
  slug: "crumple-zone",
  title: "The Crumple Zone: How Systems Externalize Harm and What to Build Instead",
  status: "draft",
  site: {
    url: "https://crumple-zone.book",
    enforceHttps: true,
    indexable: false,
    defaultMeta: {
      description: "Draft book instance for The Crumple Zone: How Systems Externalize Harm and What to Build Instead.",
      ogImage: "/og/default.svg",
    },
  },
  localization: {
    defaultLocale: "en",
    includeDefaultPrefix: false,
    label: "Language",
    locales: [
      {
        code: "en",
        label: "English",
        isDefault: true,
        completeness: 1,
      },
    ],
  },
  previewAccess: {
    enabled: false,
    paramName: "preview",
    protectedPaths: ["/"],
    tokens: [],
  },
  features: {
    aiQa: true,
  },
  objectives: {
    readerStart:
      "Feels stuck at the starting edge of the transformation and lacks a reliable next move.",
    readerEnd:
      "Can name the core mechanism, route responsibility correctly, and take a small, reversible action.",
    transformation:
      "From stuck and over-responsible to system-aware action with a concrete first step.",
  },
  frame: {
    slug: "intervention",
    steps: ["recognition", "exoneration", "mechanism", "agency"],
    intent: "Move readers from recognition to agency with enforceable steps.",
  },
  causalStance:
    "Outcomes are shaped by incentives and constraints, not just individual intent or character.",
  constraints: {
    mechanismCountTarget: [6, 8],
    actionPrimitiveMaxMinutes: 10,
    examplesMustBeSwappable: true,
    orderingModel: "constraint-graph",
  },
  mechanisms: [],
  glossaryFocus: [],
} as const;

export default bookConfig;
