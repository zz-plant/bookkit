/**
 * The words of a page address, for searching when the address leads nowhere:
 * `/read/toolkit/classify-severity/` → "classify severity". Route names,
 * version segments (`/v/1.2.0/`) and file extensions are dropped, so only the
 * words a reader typed or followed remain.
 */
const ROUTE_WORDS = new Set([
	"read",
	"chapters",
	"mechanisms",
	"toolkit",
	"glossary",
	"examples",
	"overview",
	"index",
	"v",
]);

export const searchQueryFromPath = (pathname: string): string => {
	let decoded = pathname;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		// Keep the raw path when it is not valid percent-encoding.
	}
	return decoded
		.split("/")
		.map((segment) => segment.replace(/\.[a-z0-9]+$/i, ""))
		.filter(
			(segment) =>
				segment &&
				!ROUTE_WORDS.has(segment.toLowerCase()) &&
				!/^\d+(\.\d+)*$/.test(segment),
		)
		.flatMap((segment) => segment.split(/[-_\s]+/))
		.filter((word) => word && !/^\d+$/.test(word))
		.join(" ")
		.toLowerCase();
};
