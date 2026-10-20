import type { BookMechanismsIndexConfig, MechanismUrgency } from "./config";

/** The mechanisms index's copy once `mechanismsIndex` from book.config.ts is applied. */
export type MechanismsIndexCopy = {
	lede: string;
	urgency: Readonly<Record<string, MechanismUrgency>>;
};

/** What a book that sets no `mechanismsIndex` shows. */
export const defaultMechanismsIndexCopy: MechanismsIndexCopy = {
	lede: "The named patterns this book explains, and how to recognize each one.",
	urgency: {},
};

/** `mechanismsIndex` from book.config.ts, with the default for each field it leaves out. */
export const resolveMechanismsIndexCopy = (
	mechanismsIndex?: BookMechanismsIndexConfig,
): MechanismsIndexCopy => ({
	lede: mechanismsIndex?.lede ?? defaultMechanismsIndexCopy.lede,
	urgency: mechanismsIndex?.urgency ?? defaultMechanismsIndexCopy.urgency,
});
