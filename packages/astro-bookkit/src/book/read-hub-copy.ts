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
  heroTitle: "Choose where to start, then keep going.",
  heroLede:
    "Pick the path that matches your goal: start, solve, or look something up. We'll keep the next step clear on every page.",
  quickLinkStart: "Start here",
  quickLinkSolve: "Solve now",
  quickLinkReference: "Reference",
  quickStartRecommendedEyebrow: "Recommended start",
  quickStartProblemTitle: "Find the pattern first",
  bucketsEyebrow: "Reading paths",
  bucketsTitle: "Choose the path that fits what you need",
  bucketsLede: "Each path is focused so you can move faster with less guesswork.",
};
