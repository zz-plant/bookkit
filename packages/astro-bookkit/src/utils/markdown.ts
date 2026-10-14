export const createSlugger = () => {
	const used = new Map<string, number>();
	return (value: string) => {
		const base = value
			.toLowerCase()
			.trim()
			.replace(/[`~!@#$%^&*()=+[{}\]\\|;:'",.<>/?]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-/, "")
			.replace(/-$/, "");
		const count = used.get(base) ?? 0;
		used.set(base, count + 1);
		if (!base) return "section";
		return count ? `${base}-${count}` : base;
	};
};

export const stripMarkdown = (value: string) => {
	return value
		.replace(/`{1,3}[^`]*`{1,3}/g, "")
		.replace(/\[(.*?)\]\([^)]*\)/g, "$1")
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.replace(/\*(.*?)\*/g, "$1")
		.replace(/_{1,3}(.*?)_{1,3}/g, "$1")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/^\s*[-*+]\s+/g, "")
		.replace(/^\s*\d+\.\s+/g, "")
		.trim();
};

/** What `toMdxBody` changed, by kind, so an import can say what it did. */
export type MdxConversion = {
	/** HTML comments rewritten as MDX comments. */
	htmlComments: number;
	/** `{` or `}` escaped, which MDX would read as a JavaScript expression. */
	braces: number;
	/** `<https://…>` autolinks, which MDX does not support, rewritten as links. */
	autolinks: number;
	/** `<word…` escaped, which MDX would read as a JSX tag (placeholders like `<service>`, raw HTML). */
	tags: number;
};

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;

/** Escapes text that is neither code nor a comment. */
const escapeText = (text: string, counts: MdxConversion): string =>
	text
		.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, url: string) => {
			counts.autolinks += 1;
			return `[${url}](${url})`;
		})
		.replace(/[{}]/g, (brace) => {
			counts.braces += 1;
			return `\\${brace}`;
		})
		.replace(/<br\s*\/?>/gi, "<br />")
		.replace(/<(?!br \/>)(?=[A-Za-z/!?>])/g, () => {
			counts.tags += 1;
			return "\\<";
		});

/** HTML comments become MDX comments; everything around them is escaped. */
const escapeProse = (text: string, counts: MdxConversion): string => {
	let out = "";
	let last = 0;
	for (const match of text.matchAll(/<!--([\s\S]*?)-->/g)) {
		const index = match.index ?? 0;
		counts.htmlComments += 1;
		out += `${escapeText(text.slice(last, index), counts)}{/*${match[1].replace(/\*\//g, "* /")}*/}`;
		last = index + match[0].length;
	}
	return out + escapeText(text.slice(last), counts);
};

/** Escapes one run of prose, leaving inline code spans exactly as written. */
const convertProse = (prose: string, counts: MdxConversion): string => {
	let out = "";
	let last = 0;
	for (const match of prose.matchAll(INLINE_CODE)) {
		const index = match.index ?? 0;
		out += escapeProse(prose.slice(last, index), counts) + match[0];
		last = index + match[0].length;
	}
	return out + escapeProse(prose.slice(last), counts);
};

/**
 * Makes Markdown safe to compile as MDX, which book apps load: HTML comments
 * become MDX comments, autolinks become links, and braces and tag-like `<`
 * are escaped so they render as written. Code (fenced or inline) is left
 * exactly as it was. MDX has no indented code blocks, so indented text is
 * treated as prose, as MDX itself would.
 */
export const toMdxBody = (
	markdown: string,
): { body: string; changes: MdxConversion } => {
	const changes: MdxConversion = {
		htmlComments: 0,
		braces: 0,
		autolinks: 0,
		tags: 0,
	};
	const out: string[] = [];
	let prose: string[] = [];
	let fence: string | null = null;
	const flush = () => {
		if (prose.length > 0) out.push(convertProse(prose.join("\n"), changes));
		prose = [];
	};
	for (const line of markdown.split("\n")) {
		const marker = line.match(FENCE)?.[1];
		if (fence) {
			out.push(line);
			if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
				fence = null;
			}
			continue;
		}
		if (marker) {
			flush();
			fence = marker;
			out.push(line);
			continue;
		}
		prose.push(line);
	}
	flush();
	return { body: out.join("\n"), changes };
};
