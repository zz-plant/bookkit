export type ChapterPageCopy = {
	chapterMapLabel: string;
	chapterStepsHeading: string;
	downloadChapterTitle: string;
	downloadChapterDescription: string;
	nextMoveHeading: string;
	/** Labels the chapters a chapter lists under `prerequisites`. */
	prerequisitesLabel: string;
	/** Heads the actions for the mechanisms a chapter lists, under "Keep going". */
	chapterActionsLabel: string;
	continueChapterPrefix: string;
	mechanismsLinkLabel: string;
	toolkitLinkLabel: string;
};

export const defaultChapterPageCopy: ChapterPageCopy = {
	chapterMapLabel: "On this page",
	chapterStepsHeading: "In this chapter",
	downloadChapterTitle: "Download this chapter",
	downloadChapterDescription: "PDF for print, EPUB for e-readers.",
	nextMoveHeading: "Keep going",
	prerequisitesLabel: "Read first:",
	chapterActionsLabel: "Actions for this chapter’s mechanisms",
	continueChapterPrefix: "Next chapter",
	mechanismsLinkLabel: "Mechanisms",
	toolkitLinkLabel: "Toolkit",
};
