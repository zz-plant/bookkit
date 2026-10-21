/**
 * Author decisions read from a book.config.ts source without running it.
 * Dependency-free: the engine must not require `typescript`.
 */

export type FrameConfigFromSource = {
	slug: string;
	/** `frame.steps`; undefined when the config lists none. */
	steps?: string[];
};

const STRING_START = /["'`]/;

function readStringAt(source: string, index: number): number {
	const quote = source[index];
	for (let i = index + 1; i < source.length; i++) {
		const ch = source[i];
		if (ch === "\\") {
			i++;
			continue;
		}
		if (ch === quote) return i + 1;
	}
	return source.length;
}

/**
 * Extracts `{ slug, steps }` from a `frame: { ... }` property inside a
 * book.config.ts source string. Dependency-free (the engine must not require
 * `typescript`). Returns null when the frame property or its slug is absent
 * or malformed; `steps` is undefined when the frame lists none.
 */
export function extractFrameConfigFromSource(
	source: string,
): FrameConfigFromSource | null {
	const frameIdx = source.search(/\bframe\s*:/);
	if (frameIdx === -1) return null;

	let i = frameIdx + 6;
	while (i < source.length && source[i] !== "{") {
		if (STRING_START.test(source[i])) i = readStringAt(source, i);
		else i++;
	}
	if (i >= source.length) return null;

	let depth = 0;
	let endIndex = -1;
	for (; i < source.length; i++) {
		const ch = source[i];
		if (STRING_START.test(ch)) {
			i = readStringAt(source, i);
			continue;
		}
		if (ch === "//") {
			while (i < source.length && source[i] !== "\n") i++;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				endIndex = i;
				break;
			}
		}
	}
	if (endIndex === -1) return null;

	const frameObject = source.slice(frameIdx, endIndex);
	const slugMatch = frameObject.match(
		/\bslug\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/,
	);
	if (!slugMatch) return null;

	const slug = slugMatch[1] ?? slugMatch[2] ?? slugMatch[3];
	const stepsMatch = frameObject.match(/\bsteps\s*:\s*\[/);
	if (!stepsMatch) return { slug };

	const stepsContent = frameObject.slice(
		(stepsMatch.index ?? 0) + stepsMatch[0].length,
	);
	const closingBracket = stepsContent.indexOf("]");
	if (closingBracket === -1) return { slug };

	const steps = Array.from(
		stepsContent
			.slice(0, closingBracket)
			.matchAll(/(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g),
	)
		.map((m) => m[1] ?? m[2] ?? m[3])
		.filter((value) => value.length > 0);

	return { slug, steps };
}

const BOOK_STATUS_KEY = /status\s*:\s*(["'`])([^"'`\n]*)\1/y;

/**
 * The book's `status` from a book.config.ts source: the first `status:` key
 * one level inside an object literal, which is where `export const
 * bookConfig = { status: "draft", ... }` puts it. Strings and comments are
 * skipped, so a nested `status` (or one in prose) is never read. Undefined
 * when absent or not a string literal.
 */
export function extractBookStatusFromSource(
	source: string,
): string | undefined {
	let depth = 0;
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (STRING_START.test(ch)) {
			i = readStringAt(source, i) - 1;
		} else if (ch === "/" && source[i + 1] === "/") {
			while (i < source.length && source[i] !== "\n") i++;
		} else if (ch === "/" && source[i + 1] === "*") {
			const end = source.indexOf("*/", i + 2);
			i = end === -1 ? source.length : end + 1;
		} else if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
		} else if (depth === 1 && !/[\w$]/.test(source[i - 1] ?? "")) {
			BOOK_STATUS_KEY.lastIndex = i;
			const match = BOOK_STATUS_KEY.exec(source);
			if (match) return match[2];
		}
	}
	return undefined;
}

/** Where the comment starting at `index` ends, or `index` when none starts there. */
function skipComment(source: string, index: number): number {
	if (source[index] !== "/") return index;
	if (source[index + 1] === "/") {
		const end = source.indexOf("\n", index);
		return end === -1 ? source.length : end;
	}
	if (source[index + 1] === "*") {
		const end = source.indexOf("*/", index + 2);
		return end === -1 ? source.length : end + 2;
	}
	return index;
}

/**
 * The `{ ... }` that follows the property `name` between `from` and `to`, as
 * [open, close] indexes. Strings and comments are skipped, so a name in prose
 * or in a comment is never taken for the property.
 */
function objectAfterKey(
	source: string,
	name: string,
	from = 0,
	to = source.length,
): [number, number] | null {
	const key = new RegExp(`${name}\\s*:\\s*\\{`, "y");
	for (let i = from; i < to; i++) {
		const ch = source[i];
		if (STRING_START.test(ch)) {
			i = readStringAt(source, i) - 1;
			continue;
		}
		const afterComment = skipComment(source, i);
		if (afterComment !== i) {
			i = afterComment - 1;
			continue;
		}
		if (/[\w$]/.test(source[i - 1] ?? "")) continue;
		key.lastIndex = i;
		const match = key.exec(source);
		if (match) return closeOfObject(source, i + match[0].length - 1, to);
	}
	return null;
}

/** [open, close] of the object literal whose `{` is at `open`. */
function closeOfObject(
	source: string,
	open: number,
	to: number,
): [number, number] | null {
	let depth = 0;
	for (let i = open; i < to; i++) {
		const ch = source[i];
		if (STRING_START.test(ch)) {
			i = readStringAt(source, i) - 1;
			continue;
		}
		const afterComment = skipComment(source, i);
		if (afterComment !== i) {
			i = afterComment - 1;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}" && --depth === 0) return [open, i];
	}
	return null;
}

/**
 * The mechanism slugs `mechanismsIndex.urgency` names in a book.config.ts
 * source: each key of that object, quoted or bare, in order. Empty when the
 * book sets no urgency.
 */
export function extractMechanismUrgencySlugsFromSource(
	source: string,
): string[] {
	const index = objectAfterKey(source, "mechanismsIndex");
	if (!index) return [];
	const urgency = objectAfterKey(source, "urgency", index[0] + 1, index[1]);
	if (!urgency) return [];
	const slugs: string[] = [];
	let expectKey = true;
	for (let i = urgency[0] + 1; i < urgency[1]; i++) {
		const ch = source[i];
		const afterComment = skipComment(source, i);
		if (afterComment !== i) {
			i = afterComment - 1;
		} else if (STRING_START.test(ch)) {
			const end = readStringAt(source, i);
			if (expectKey) slugs.push(source.slice(i + 1, end - 1));
			expectKey = false;
			i = end - 1;
		} else if (ch === ",") {
			expectKey = true;
		} else if (expectKey && /[\w$]/.test(ch)) {
			const key = /[\w$-]+/y;
			key.lastIndex = i;
			const name = key.exec(source)?.[0] ?? ch;
			slugs.push(name);
			expectKey = false;
			i += name.length - 1;
		}
	}
	return slugs;
}
