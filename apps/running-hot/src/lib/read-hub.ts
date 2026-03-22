import {
  defaultReadHubCopy,
  readRoutes,
  type ReadHubConfig,
} from "@bookkit/astro-bookkit";

export const readHubConfig: ReadHubConfig = {
  hero: {
    eyebrow: defaultReadHubCopy.heroEyebrow,
    title: defaultReadHubCopy.heroTitle,
    lede: defaultReadHubCopy.heroLede,
    quickLinksAriaLabel: "Quick ways to start",
    quickStartAriaLabel: "Quick start paths",
    quickLinks: [
      {
        label: defaultReadHubCopy.quickLinkStart,
        href: "#start-here",
        funnelStep: "read_to_start_here",
      },
      {
        label: defaultReadHubCopy.quickLinkSolve,
        href: "#solve-now",
        funnelStep: "read_to_solve_now",
      },
      {
        label: defaultReadHubCopy.quickLinkReference,
        href: "#reference",
        funnelStep: "read_to_reference",
      },
    ],
  },
  intro: {
    eyebrow: defaultReadHubCopy.bucketsEyebrow,
    title: defaultReadHubCopy.bucketsTitle,
    lede: defaultReadHubCopy.bucketsLede,
  },
  quickStartCards: [
    {
      eyebrow: defaultReadHubCopy.quickStartRecommendedEyebrow,
      title: "Read chapter-first",
      description: "Follow the core arc from orientation to action.",
      href: readRoutes.chapters,
      recommended: true,
      funnelStep: "quickstart_chapter_first",
    },
    {
      eyebrow: "Understand the frame",
      title: "Scan objectives and constraints",
      description: "Get the model before diving into modules.",
      href: readRoutes.overview,
      funnelStep: "quickstart_frame_first",
    },
    {
      eyebrow: "Solve a specific problem",
      title: defaultReadHubCopy.quickStartProblemTitle,
      description: "Find the pattern, then move to toolkit actions.",
      href: readRoutes.mechanisms,
      funnelStep: "quickstart_problem_first",
    },
  ],
  buckets: [
    {
      id: "start-here",
      title: "Start here",
      description: "Orientation and first-pass reading.",
      sectionKeys: ["overview", "chapters"],
      primary: true,
    },
    {
      id: "solve-now",
      title: "Solve now",
      description: "Diagnose patterns and pick a ten-minute action.",
      sectionKeys: ["mechanisms", "toolkit"],
    },
    {
      id: "reference",
      title: "Reference",
      description: "Shared language and replaceable examples.",
      sectionKeys: ["glossary", "examples"],
    },
  ],
  utilities: {
    mode: "default",
    eyebrow: "Meta",
    title: "Release and maintenance links",
    lede: "Lower-priority utilities live here so reading routes stay focused.",
    cards: [
      {
        eyebrow: "Reader meta",
        title: "Reader updates",
        description: "Track changes or download an offline copy.",
        featured: true,
        deemphasizeUntilStarted: true,
        secondaryNote: "Release notes stay secondary until you start reading.",
        links: [
          { label: "See what changed", href: "/release-notes" },
          { label: "Download for offline reading", href: "/downloads" },
        ],
      },
      {
        eyebrow: "Author meta",
        title: "Author diagnostics",
        description: "Open analytics and publishing diagnostics.",
        links: [{ label: "Open author diagnostics", href: readRoutes.tools }],
      },
    ],
  },
};
