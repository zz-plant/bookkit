import { formatJson } from "./corpus-judgments";

/**
 * The author's rulings in corpus.json, written by `bookkit rule` and
 * `bookkit merge`. A ruling is added as text, in the layout the file already
 * uses, so the rest of the file (written by hand) is left exactly as it was.
 */

export type DistinctRuling = { pair: [string, string]; reason: string };

/** One mechanism as it read before a merge. */
export type MergedMechanism = {
	book: string;
	slug: string;
	title: string;
	definition: string;
	is: string[];
};

/** A merge: `before` holds both mechanisms as they were. */
export type MergeRecord = {
	into: string;
	date: string;
	reason: string;
	before: MergedMechanism[];
};

/** The ruling on a pair, in either order, if there is one. */
export const findRuling = (
	rulings: readonly DistinctRuling[],
	a: string,
	b: string,
): DistinctRuling | undefined =>
	rulings.find(({ pair }) => pair.includes(a) && pair.includes(b));

/**
 * A top-level array in corpus.json's text: the index of its opening and
 * closing brackets, and where each of its objects starts and ends.
 */
const arraySpan = (
	text: string,
	key: string,
): {
	open: number;
	close: number;
	elements: Array<{ start: number; end: number }>;
} | null => {
	const opener = text.match(new RegExp(`"${key}"\\s*:\\s*\\[`));
	if (opener?.index === undefined) return null;
	const open = opener.index + opener[0].length - 1;
	const elements: Array<{ start: number; end: number }> = [];
	let depth = 0;
	let inString = false;
	let start = -1;
	for (let i = open; i < text.length; i += 1) {
		const char = text[i];
		if (inString) {
			if (char === "\\") i += 1;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === "[" || char === "{") {
			if (depth === 1 && start < 0) start = i;
			depth += 1;
		} else if (char === "]" || char === "}") {
			depth -= 1;
			if (depth === 0) return { open, close: i, elements };
			if (depth === 1) {
				elements.push({ start, end: i + 1 });
				start = -1;
			}
		}
	}
	return null;
};

/** One element of a top-level array, laid out as Biome lays it out there. */
const elementText = (key: string, value: unknown): string => {
	const text = formatJson({ [key]: [value] });
	return text.slice(text.indexOf("[\n") + 2, text.lastIndexOf("\n\t]"));
};

/**
 * corpus.json's text with `value` at the end of the top-level array `key`.
 * `text` null means there is no corpus.json yet.
 */
const appendElement = (
	text: string | null,
	key: string,
	value: unknown,
): string => {
	if (text === null) return formatJson({ [key]: [value] });
	const span = arraySpan(text, key);
	if (span === null) {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return formatJson({ ...parsed, [key]: [value] });
	}
	const before = text.slice(0, span.close).replace(/\s*$/, "");
	const empty = before.endsWith("[");
	return `${before}${empty ? "" : ","}\n${elementText(key, value)}\n\t${text.slice(span.close)}`;
};

/**
 * corpus.json's text with one more distinct ruling at the end of "distinct".
 * `text` null means there is no corpus.json yet.
 */
export const addDistinctRuling = (
	text: string | null,
	ruling: DistinctRuling,
): string => {
	const updated = appendElement(text, "distinct", ruling);
	// The file must still parse, with the ruling in it.
	const parsed = JSON.parse(updated) as { distinct?: DistinctRuling[] };
	if (!findRuling(parsed.distinct ?? [], ...ruling.pair)) {
		throw new Error("corpus.json: could not add the ruling.");
	}
	return updated;
};

/** corpus.json's text with a merge recorded at the end of "merged". */
export const addMergeRecord = (
	text: string | null,
	record: MergeRecord,
): string => {
	const updated = appendElement(text, "merged", record);
	const parsed = JSON.parse(updated) as { merged?: MergeRecord[] };
	if (!parsed.merged?.some((merge) => merge.into === record.into)) {
		throw new Error("corpus.json: could not record the merge.");
	}
	return updated;
};

/**
 * After `drop` is merged into `keep`: each distinct ruling on `drop` now
 * holds for `keep`, unless `keep` already has its own ruling on that pair.
 * Other rulings are left as written.
 */
export const rebindRulings = (
	text: string,
	drop: string,
	keep: string,
): {
	text: string;
	carried: DistinctRuling[];
	removed: DistinctRuling[];
} => {
	const span = arraySpan(text, "distinct");
	if (span === null) return { text, carried: [], removed: [] };
	const rulings = span.elements.map(({ start, end }) => ({
		source: text.slice(start, end),
		ruling: JSON.parse(text.slice(start, end)) as DistinctRuling,
	}));
	const carried: DistinctRuling[] = [];
	const removed: DistinctRuling[] = [];
	const kept: string[] = [];
	for (const { source, ruling } of rulings) {
		if (!ruling.pair.includes(drop)) {
			kept.push(`\t\t${source}`);
			continue;
		}
		const other = ruling.pair.find((slug) => slug !== drop) ?? drop;
		const own = rulings.some(
			(entry) =>
				entry.ruling.pair.includes(keep) && entry.ruling.pair.includes(other),
		);
		if (other === keep || own) {
			removed.push(ruling);
			continue;
		}
		const rebound: DistinctRuling = {
			pair: ruling.pair.map((slug) => (slug === drop ? keep : slug)) as [
				string,
				string,
			],
			reason: ruling.reason,
		};
		carried.push(rebound);
		kept.push(elementText("distinct", rebound));
	}
	if (carried.length === 0 && removed.length === 0) {
		return { text, carried, removed };
	}
	const array = kept.length === 0 ? "[]" : `[\n${kept.join(",\n")}\n\t]`;
	return {
		text: `${text.slice(0, span.open)}${array}${text.slice(span.close + 1)}`,
		carried,
		removed,
	};
};
