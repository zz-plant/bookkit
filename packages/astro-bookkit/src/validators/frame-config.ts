export type FrameConfigFromSource = {
	slug: string;
	steps: string[];
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
 * `typescript`). Returns null when the frame property is absent or malformed.
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

	const stepsMatch = frameObject.match(/\bsteps\s*:\s*\[/);
	if (!stepsMatch) return null;

	const stepsContent = frameObject.slice(
		(stepsMatch.index ?? 0) + stepsMatch[0].length,
	);
	const closingBracket = stepsContent.indexOf("]");
	if (closingBracket === -1) return null;

	const steps = Array.from(
		stepsContent
			.slice(0, closingBracket)
			.matchAll(/(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g),
	)
		.map((m) => m[1] ?? m[2] ?? m[3])
		.filter((value) => value.length > 0);

	return { slug: slugMatch[1] ?? slugMatch[2] ?? slugMatch[3], steps };
}
