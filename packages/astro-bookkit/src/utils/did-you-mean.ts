/**
 * Suggestions for a mistyped name: the candidate it most plausibly meant,
 * for "Did you mean …?" in an error. Used by the CLI (commands, books,
 * flags) and by the validators (a book's frame and its steps).
 */

/** Edit distance with adjacent transpositions ("chek" → "check" is 1). */
export const editDistance = (a: string, b: string): number => {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const d: number[][] = Array.from({ length: rows }, (_, i) =>
		Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(
				d[i - 1][j] + 1,
				d[i][j - 1] + 1,
				d[i - 1][j - 1] + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
};

/**
 * The candidate the input most plausibly meant, or undefined when nothing is
 * close: a unique prefix, the same letters without hyphens, or a small edit.
 */
export const closest = (
	input: string,
	candidates: readonly string[],
): string | undefined => {
	const wanted = input.toLowerCase();
	const squash = (value: string) => value.toLowerCase().replace(/[-_\s]/g, "");
	const exactish = candidates.find(
		(candidate) => squash(candidate) === squash(wanted),
	);
	if (exactish) return exactish;
	const prefixed = candidates.filter((candidate) =>
		candidate.toLowerCase().startsWith(wanted),
	);
	if (wanted.length >= 2 && prefixed.length === 1) return prefixed[0];
	const scored = candidates
		.map((candidate) => ({
			candidate,
			distance: editDistance(wanted, candidate.toLowerCase()),
		}))
		.sort((a, b) => a.distance - b.distance);
	const best = scored[0];
	const limit = Math.max(1, Math.floor(Math.max(wanted.length, 3) / 3));
	return best && best.distance <= limit ? best.candidate : undefined;
};

/** "Did you mean x?" or nothing, for appending to an error. */
export const didYouMean = (
	input: string,
	candidates: readonly string[],
): string => {
	const match = closest(input, candidates);
	return match ? ` Did you mean ${match}?` : "";
};
