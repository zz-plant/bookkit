import type { BookHomeConfig } from "./config";

/** The home page's copy once `home` from book.config.ts is applied. */
export type BookHomeCopy = {
	/** Shown above the title when not empty. */
	kicker: string;
	mechanismsCard: { title: string; description: string };
};

/** What a book that sets no `home` copy shows. */
export const defaultBookHomeCopy: BookHomeCopy = {
	kicker: "",
	mechanismsCard: {
		title: "Browse the mechanisms",
		description: "The named patterns this book explains.",
	},
};

/** `home` from book.config.ts, with the default for each field it leaves out. */
export const resolveBookHomeCopy = (home?: BookHomeConfig): BookHomeCopy => {
	const card = defaultBookHomeCopy.mechanismsCard;
	return {
		kicker: home?.kicker ?? defaultBookHomeCopy.kicker,
		mechanismsCard: {
			title: home?.mechanismsCard?.title ?? card.title,
			description: home?.mechanismsCard?.description ?? card.description,
		},
	};
};
