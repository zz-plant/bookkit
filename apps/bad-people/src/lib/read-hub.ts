import { readRoutes, type ReadHubConfig } from "@bookkit/astro-bookkit";

export const readHubConfig: ReadHubConfig = {
  hero: {
    eyebrow: "Reading hub",
    title: "Pick a route, then move forward in one click.",
    lede: "Use the buckets below: start, solve, or reference. Follow one route first, then branch only if needed.",
    quickLinksAriaLabel: "Quick ways to start",
    quickLinks: [
      {
        label: "Start here",
        href: "#start-here",
        primary: true,
        funnelStep: "read_to_start_here",
      },
      {
        label: "Solve now",
        href: "#solve-now",
        funnelStep: "read_to_solve_now",
      },
      {
        label: "Reference",
        href: "#reference",
        funnelStep: "read_to_reference",
      },
    ],
  },
  intro: {
    eyebrow: "Route buckets",
    title: "Choose one bucket and begin",
    lede: "Start, solve, and reference routes are intentionally separated.",
  },
  bucketNavigation: "tabs",
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
    mode: "accordion",
    eyebrow: "Meta",
    title: "More reading utilities",
    lede: "Release notes, downloads, and author diagnostics",
    cards: [
      {
        eyebrow: "Reader meta",
        title: "Reader updates",
        description: "Track changes or download an offline copy.",
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
  quickStartCards: [
    {
      eyebrow: "New reader? Start in 3 minutes",
      title: "Follow the load",
      description: "Read the overview for the map, then one mechanism pattern you already recognize.",
      href: readRoutes.overview,
      recommended: true,
      funnelStep: "new_reader_overview",
    },
    {
      eyebrow: "Then diagnose one pattern",
      title: "Spot delay as force",
      description: "See how waiting is weaponized — and what a 10-minute paper trail countermove looks like.",
      href: `${readRoutes.mechanisms}/delay-as-force`,
      funnelStep: "new_reader_mechanism",
    },
    {
      eyebrow: "Then try one move",
      title: "Run a deadline countermove",
      description: "Pick one toolkit action that fits inside ten minutes and requires no permission.",
      href: `${readRoutes.toolkit}/delay-as-force--deadline-countermove`,
      funnelStep: "new_reader_toolkit",
    },
  ],
  releaseFilter: {
    initialLabel: "Show sections marked in latest release notes",
    activeLabel: "Show all sections",
  },
};
