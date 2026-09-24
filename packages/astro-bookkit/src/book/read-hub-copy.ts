export type ReadHubCopy = {
	heroEyebrow: string;
	heroTitle: string;
	heroLede: string;
	quickLinkStart: string;
	quickLinkSolve: string;
	quickLinkReference: string;
	quickStartRecommendedEyebrow: string;
	quickStartProblemTitle: string;
	bucketsEyebrow: string;
	bucketsTitle: string;
	bucketsLede: string;
};

export const defaultReadHubCopy: ReadHubCopy = {
	heroEyebrow: "Reading hub",
	heroTitle: "Where to start",
	heroLede:
		"Read from the beginning, go straight to a problem you have, or look something up.",
	quickLinkStart: "Start here",
	quickLinkSolve: "Solve a problem",
	quickLinkReference: "Look something up",
	quickStartRecommendedEyebrow: "Start here",
	quickStartProblemTitle: "Find the pattern",
	bucketsEyebrow: "",
	bucketsTitle: "All sections",
	bucketsLede: "",
};
