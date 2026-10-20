import type { Color } from "pdf-lib";
import { type PdfFontChain, widthOfText } from "./pdf-fonts";

/**
 * Lines of text in mixed fonts for the PDF: prose with code spans, bold and
 * italic text, and links in it, a footnote number raised above the line,
 * and the columns of a table.
 */

/**
 * Where linked text points: a page of the site or elsewhere (`uri`), or a
 * named destination in the PDF, with `fallback` (the entry, without its
 * heading) and `uri` to use when the PDF does not have it.
 */
export type PdfLinkTarget =
	| { uri: string }
	| { destination: string; fallback: string; uri?: string };

/**
 * Text in one font and size; `rise` lifts it off the baseline, as a note
 * number is. Linked text carries its `link` and is drawn in `color`. A
 * `lineBreak` piece (`<br>`) ends the line.
 */
export type Piece = {
	text: string;
	fonts: PdfFontChain;
	size: number;
	rise?: number;
	link?: PdfLinkTarget;
	color?: Color;
	lineBreak?: true;
};

const sameStyle = (a: Piece, b: Piece) =>
	a.fonts === b.fonts &&
	a.size === b.size &&
	a.rise === b.rise &&
	a.link === b.link &&
	a.color === b.color;

/** Pieces with neighbours in the same style joined, so a line in one style is one string. */
export const mergePieces = (pieces: Piece[]): Piece[] => {
	const merged: Piece[] = [];
	for (const piece of pieces) {
		const last = merged[merged.length - 1];
		if (last && sameStyle(last, piece)) last.text += piece.text;
		else merged.push({ ...piece });
	}
	return merged;
};

export const widthOfPieces = (pieces: Piece[]): number =>
	mergePieces(pieces).reduce(
		(width, piece) => width + widthOfText(piece.text, piece.fonts, piece.size),
		0,
	);

/** A run of text between spaces, which may change font (`max_retries`, then a comma); or a line break. */
export type Word = { parts: Piece[]; space?: Piece; lineBreak?: true };

/** Text as words; the space before each word keeps the style it was written in. */
export const toWords = (pieces: Piece[]): Word[] => {
	const words: Word[] = [];
	let word: Word | null = null;
	let space: Piece | undefined;
	for (const piece of pieces) {
		if (piece.lineBreak) {
			words.push({ parts: [], lineBreak: true });
			word = null;
			space = undefined;
			continue;
		}
		for (const chunk of piece.text.split(/(\s+)/)) {
			if (!chunk) continue;
			if (/^\s/.test(chunk)) {
				word = null;
				space ??= { ...piece, text: " " };
				continue;
			}
			if (!word) {
				const after = words[words.length - 1];
				word = {
					parts: [],
					space: after && !after.lineBreak ? space : undefined,
				};
				words.push(word);
				space = undefined;
			}
			word.parts.push({ ...piece, text: chunk });
		}
	}
	return words;
};

/** How many of `count` characters fit, keeping at least one so a line always moves on. */
const fittingCount = (count: number, fits: (count: number) => boolean) => {
	let cut = count - 1;
	while (cut > 1 && !fits(cut)) cut -= 1;
	return Math.max(cut, 1);
};

/** Lines no wider than `maxWidth`; a word longer than a line (a URL, an identifier) is split. */
export const wrapWords = (words: Word[], maxWidth: number): Piece[][] => {
	const fits = (line: Piece[]) => widthOfPieces(line) <= maxWidth;
	const lines: Piece[][] = [];
	let current: Piece[] = [];
	for (const { parts, space, lineBreak } of words) {
		if (lineBreak) {
			lines.push(mergePieces(current));
			current = [];
			continue;
		}
		const next =
			current.length > 0
				? [...current, ...(space ? [space] : []), ...parts]
				: parts;
		if (fits(next)) {
			current = next;
			continue;
		}
		if (current.length > 0) lines.push(mergePieces(current));
		current = parts;
		while (!fits(current)) {
			const chars = current.flatMap((piece) =>
				Array.from(piece.text, (char) => ({ ...piece, text: char })),
			);
			if (chars.length < 2) break;
			const cut = fittingCount(chars.length, (count) =>
				fits(chars.slice(0, count)),
			);
			lines.push(mergePieces(chars.slice(0, cut)));
			current = mergePieces(chars.slice(cut));
		}
	}
	if (current.length > 0) lines.push(mergePieces(current));
	return lines;
};

/** A line of code split where it reaches `maxWidth`, keeping its spaces. */
export const breakCodeLine = (
	line: string,
	fonts: PdfFontChain,
	size: number,
	maxWidth: number,
): string[] => {
	const parts: string[] = [];
	let rest = Array.from(line);
	const width = (chars: string[]) => widthOfText(chars.join(""), fonts, size);
	while (rest.length > 1 && width(rest) > maxWidth) {
		const cut = fittingCount(
			rest.length,
			(count) => width(rest.slice(0, count)) <= maxWidth,
		);
		parts.push(rest.slice(0, cut).join(""));
		rest = rest.slice(cut);
	}
	parts.push(rest.join(""));
	return parts;
};

/**
 * How wide each table column's text may be, sharing `room`, from each
 * column's widest cell on one line (`natural`) and its longest word
 * (`longest`). A table that fits keeps its natural widths. Otherwise each
 * column gets its longest word and shares the rest by how much more it
 * would take; when even the longest words do not fit, columns shrink in
 * proportion and their words are split.
 */
const tableColumnWidths = (
	natural: number[],
	longest: number[],
	room: number,
): number[] => {
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
	if (sum(natural) <= room) return natural;
	const floor = sum(longest);
	if (floor > room) return longest.map((width) => (room * width) / floor);
	const stretch = sum(natural) - floor;
	return natural.map(
		(width, column) =>
			longest[column] + ((room - floor) * (width - longest[column])) / stretch,
	);
};

/** A table's rows, header first, laid out in columns. */
export type TableLayout = {
	/** Each column's text width, without the cell's padding. */
	widths: number[];
	/** Each row's cells, as lines. */
	rows: Piece[][][][];
	/** Each row's height: its tallest cell, plus `padY` above and below. */
	heights: number[];
};

/**
 * `rows` (each a list of cells, header first) as columns sharing `room`, or
 * null when a column would be too narrow to read: narrower than
 * `minColumn`, or than its own text when that is shorter.
 */
export const layoutTable = (
	rows: Piece[][][],
	room: number,
	style: { lineHeight: number; padY: number; minColumn: number },
): TableLayout | null => {
	const words = rows.map((cells) => cells.map(toWords));
	const columns = Array.from({ length: rows[0]?.length ?? 0 }, (_, i) => i);
	const natural = columns.map((column) =>
		Math.max(
			0,
			...words.map((cells) =>
				widthOfPieces(
					wrapWords(cells[column], Number.POSITIVE_INFINITY)[0] ?? [],
				),
			),
		),
	);
	const longest = columns.map((column) =>
		Math.max(
			0,
			...words.flatMap((cells) =>
				cells[column].map((word) => widthOfPieces(word.parts)),
			),
		),
	);
	const widths = tableColumnWidths(natural, longest, room);
	if (
		widths.some(
			(width, column) => width < Math.min(style.minColumn, natural[column]),
		)
	) {
		return null;
	}
	const laidOut = words.map((cells) =>
		cells.map((cell, column) => wrapWords(cell, widths[column])),
	);
	const heights = laidOut.map(
		(cells) =>
			Math.max(1, ...cells.map((lines) => lines.length)) * style.lineHeight +
			style.padY * 2,
	);
	return { widths, rows: laidOut, heights };
};
