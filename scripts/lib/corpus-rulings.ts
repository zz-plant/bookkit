import { formatJson } from "./corpus-judgments";

/**
 * The author's rulings in corpus.json, written by `bookkit rule`. A ruling is
 * added as text, in the layout the file already uses, so the rest of the file
 * (written by hand) is left exactly as it was.
 */

export type DistinctRuling = { pair: [string, string]; reason: string };

/** The ruling on a pair, in either order, if there is one. */
export const findRuling = (
	rulings: readonly DistinctRuling[],
	a: string,
	b: string,
): DistinctRuling | undefined =>
	rulings.find(({ pair }) => pair.includes(a) && pair.includes(b));

/** The end of the "distinct" array: the index of its closing bracket. */
const distinctArrayEnd = (text: string): number | null => {
	const open = text.match(/"distinct"\s*:\s*\[/);
	if (open?.index === undefined) return null;
	let depth = 0;
	let inString = false;
	for (let i = open.index + open[0].length - 1; i < text.length; i += 1) {
		const char = text[i];
		if (inString) {
			if (char === "\\") i += 1;
			else if (char === '"') inString = false;
		} else if (char === '"') inString = true;
		else if (char === "[" || char === "{") depth += 1;
		else if (char === "]" || char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return null;
};

/**
 * corpus.json's text with one more distinct ruling at the end of "distinct".
 * `text` null means there is no corpus.json yet.
 */
export const addDistinctRuling = (
	text: string | null,
	ruling: DistinctRuling,
): string => {
	if (text === null) return formatJson({ distinct: [ruling] });
	const end = distinctArrayEnd(text);
	if (end === null) {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return formatJson({ ...parsed, distinct: [ruling] });
	}
	const pairLine = `\t\t\t"pair": ${JSON.stringify(ruling.pair).replace(",", ", ")},`;
	// Biome keeps a short array on one line (width 80, a tab counted as 2).
	const pair =
		pairLine.length + 3 <= 80
			? pairLine
			: `\t\t\t"pair": [\n${ruling.pair.map((slug) => `\t\t\t\t${JSON.stringify(slug)}`).join(",\n")}\n\t\t\t],`;
	const entry = `\t\t{\n${pair}\n\t\t\t"reason": ${JSON.stringify(ruling.reason)}\n\t\t}`;
	const before = text.slice(0, end).replace(/\s*$/, "");
	const empty = before.endsWith("[");
	const updated = `${before}${empty ? "" : ","}\n${entry}\n\t${text.slice(end)}`;
	// The file must still parse, with the ruling in it.
	const parsed = JSON.parse(updated) as { distinct?: DistinctRuling[] };
	if (!findRuling(parsed.distinct ?? [], ...ruling.pair)) {
		throw new Error("corpus.json: could not add the ruling.");
	}
	return updated;
};
