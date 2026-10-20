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

/** "Chapter 2 of 5": where a chapter sits in the reading order the index lists. */
export const chapterPositionLabel = (number: number, total: number): string =>
	`Chapter ${number} of ${total}`;

/**
 * What a draft is. The chapter index says it of its chapters; a draft
 * book's home page and reading hub say it of the book, in the same words.
 */
export const draftCopy = {
	book: "This book is a draft.",
	allChapters: "These chapters are drafts",
	someChapters: "Some chapters are drafts",
	meaning:
		"Drafts are complete enough to use. The mechanisms they describe won’t change, but wording, examples, and order may.",
} as const;
