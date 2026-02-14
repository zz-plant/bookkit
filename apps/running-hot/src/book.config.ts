export const bookConfig = {
  slug: "running-hot",
  title: "Don't Turn People Into Infrastructure: Why Institutions Run Hot - and Who They Burn",
  status: "draft",
  site: {
    url: "https://running-hot.book",
    enforceHttps: true,
    indexable: false,
    defaultMeta: {
      description:
        "A draft BookKit title arguing that institutional stability is often purchased by externalizing volatility into people.",
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
      "Feels overheated by obligation and blamed for adapting to systems that offload harm.",
    readerEnd:
      "Can name where institutional heat is being dumped, route ownership clearly, and run a reversible cooling move.",
    transformation:
      "From overload sympathy to enforceable accountability for where heat goes, who pays, and how repair happens.",
  },
  frame: {
    slug: "intervention",
    steps: ["recognition", "exoneration", "mechanism", "agency"],
    intent:
      "Move readers from symptom heat to structural diagnosis and executable cooling actions.",
  },
  causalStance:
    "Systems continue operating by moving volatility somewhere; when cooling is underfunded, humans absorb the load.",
  constraints: {
    mechanismCountTarget: [6, 8],
    actionPrimitiveMaxMinutes: 10,
    examplesMustBeSwappable: true,
    orderingModel: "constraint-graph",
  },
  mechanisms: [
    {
      slug: "human-heat-sink",
      focus:
        "Institutions preserve throughput by externalizing thermal load into waiting, paperwork, and emotional labor.",
      actionPrimitiveCountTarget: 1,
    },
  ],
  glossaryFocus: [
    "running hot",
    "dont turn people into infrastructure",
    "human heat sink",
    "thermal lag",
    "engineered dissipation",
  ],
} as const;

export default bookConfig;
