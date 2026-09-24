import { type ReadHubConfig, readRoutes } from "@bookkit/astro-bookkit";

export const readHubConfig: ReadHubConfig = {
	hero: {
		title: "Reading hub",
		lede: "Start with the overview, go straight to a problem you have, or look something up.",
		quickLinks: [],
		quickStartAriaLabel: "Where to start",
	},
	quickStartCards: [
		{
			title: "Read the overview",
			description: "What the book covers and how it’s organized.",
			href: readRoutes.overview,
			recommended: true,
			funnelStep: "new_reader_overview",
		},
		{
			title: "Spot coercive waiting",
			description: "How delay gets used as pressure, and how to recognize it.",
			href: `${readRoutes.mechanisms}/coercive-waiting`,
			funnelStep: "new_reader_mechanism",
		},
		{
			title: "Run a deadline countermove",
			description: "A ten-minute response that needs no one’s permission.",
			href: `${readRoutes.toolkit}/coercive-waiting--deadline-countermove`,
			funnelStep: "new_reader_toolkit",
		},
	],
	intro: {
		title: "All sections",
	},
	bucketNavigation: "stacked",
	buckets: [
		{
			id: "start-here",
			title: "Start here",
			description: "Read these first.",
			sectionKeys: ["overview", "chapters"],
			primary: true,
		},
		{
			id: "solve-now",
			title: "Solve a problem",
			description: "Name the pattern, then pick an action.",
			sectionKeys: ["mechanisms", "toolkit"],
		},
		{
			id: "reference",
			title: "Look something up",
			description: "Terms and worked cases.",
			sectionKeys: ["glossary", "examples"],
		},
	],
	utilities: {
		mode: "accordion",
		title: "Release notes, downloads, and author tools",
		cards: [
			{
				title: "Updates",
				description: "See what changed, or download a copy to read offline.",
				links: [
					{ label: "Release notes", href: "/release-notes" },
					{ label: "Downloads", href: "/downloads" },
				],
			},
			{
				title: "For authors",
				description: "Analytics and publishing tools.",
				links: [{ label: "Author tools", href: readRoutes.tools }],
			},
		],
	},
	releaseFilter: {
		initialLabel: "Show recently updated",
		activeLabel: "Show all sections",
	},
};
