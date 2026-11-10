import { decodeEntities } from "./character-references";
import { literalValue } from "./html-allowlist";

/**
 * One tag or MDX expression read from source at an offset, as MDX reads it
 * or as HTML does, for `findUnsafeMarkup` and `findUntitledEmbeds`. The
 * exports' parser reads its tags in markdown-html.ts.
 */

/** A spread attribute in MDX (`{...props}`, `{...{ src: "…" }}`), braces nested up to three deep, as a pattern. */
export const SPREAD = String.raw`\{\s*\.\.\.(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`;

/**
 * The index of the `}` that closes the `{` at `open`, past strings,
 * template literals, comments, and nested braces, as an MDX expression
 * reads them; -1 when it never closes.
 */
export const closingBrace = (text: string, open: number): number => {
	const stack = ["}"];
	for (let index = open + 1; index < text.length; index += 1) {
		const char = text[index];
		const inTemplate = stack[stack.length - 1] === "`";
		if (inTemplate) {
			if (char === "\\") index += 1;
			else if (char === "`") stack.pop();
			else if (char === "$" && text[index + 1] === "{") {
				stack.push("}");
				index += 1;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			let at = index + 1;
			while (at < text.length && text[at] !== char) {
				if (text[at] === "\\") at += 1;
				at += 1;
			}
			if (at >= text.length) return -1;
			index = at;
		} else if (char === "`") {
			stack.push("`");
		} else if (char === "/" && text[index + 1] === "*") {
			const end = text.indexOf("*/", index + 2);
			if (end < 0) return -1;
			index = end + 1;
		} else if (char === "/" && text[index + 1] === "/") {
			const end = text.indexOf("\n", index);
			if (end < 0) return -1;
			index = end;
		} else if (char === "{") {
			stack.push("}");
		} else if (char === "}") {
			stack.pop();
			if (stack.length === 0) return index;
		}
	}
	return -1;
};

/** An attribute in a tag: its name (null for a spread), and its value. */
export type TagAttribute = {
	/** From the space before it to its end, so removing it leaves the tag tidy. */
	start: number;
	end: number;
	name: string | null;
	/** Decoded text; "" for a bare name; null for an expression that is not a plain literal, or a spread. */
	value: string | null;
	/** An expression's or a spread's source, braces included. */
	source?: string;
};

export type Tag = {
	start: number;
	end: number;
	/** As written; "" for a JSX fragment (`<>`). */
	name: string;
	closing: boolean;
	selfClosing: boolean;
	attributes: TagAttribute[];
};

const JSX_NAME = /[A-Za-z_$][\w$-]*(?:[.:][A-Za-z_$][\w$-]*)*/y;
const HTML_NAME = /[A-Za-z][A-Za-z0-9-]*/y;
const SPACE = /\s*/y;
const JSX_ATTRIBUTE_NAME = /[^\s"'<>/={}]+/y;
const HTML_ATTRIBUTE_NAME = /[^\s"'<>/=]+/y;
const UNQUOTED_VALUE = /[^\s"'=<>`]+/y;

/** Matches `pattern` (sticky) at `at`, or null. */
const stickyMatch = (pattern: RegExp, text: string, at: number) => {
	pattern.lastIndex = at;
	return pattern.exec(text)?.[0] ?? null;
};

/**
 * The tag that starts at the `<` at `at`, as MDX reads one (`jsx`: names
 * with `.` and `:`, quoted or braced values, spreads, fragments) or as HTML
 * does (unquoted values, no braces); null when it is not a tag.
 */
export const readTag = (text: string, at: number, jsx: boolean): Tag | null => {
	let index = at + 1;
	const closing = text[index] === "/";
	if (closing) index += 1;
	const name = stickyMatch(jsx ? JSX_NAME : HTML_NAME, text, index) ?? "";
	if (!name && !(jsx && text[index] === ">")) return null;
	index += name.length;
	const attributes: TagAttribute[] = [];
	for (;;) {
		const start = index;
		index += stickyMatch(SPACE, text, index)?.length ?? 0;
		if (text[index] === ">" || text.startsWith("/>", index)) {
			const selfClosing = text[index] === "/";
			if (closing && (attributes.length > 0 || selfClosing)) return null;
			return {
				start: at,
				end: index + (selfClosing ? 2 : 1),
				name,
				closing,
				selfClosing,
				attributes,
			};
		}
		if (index === start || closing) return null;
		if (jsx && text[index] === "{") {
			const end = closingBrace(text, index);
			const source = end < 0 ? "" : text.slice(index, end + 1);
			if (!/^\{\s*\.\.\./.test(source)) return null;
			attributes.push({ start, end: end + 1, name: null, value: null, source });
			index = end + 1;
			continue;
		}
		const attribute = stickyMatch(
			jsx ? JSX_ATTRIBUTE_NAME : HTML_ATTRIBUTE_NAME,
			text,
			index,
		);
		if (!attribute) return null;
		index += attribute.length;
		const beforeEquals = index;
		index += stickyMatch(SPACE, text, index)?.length ?? 0;
		if (text[index] !== "=") {
			index = beforeEquals;
			attributes.push({ start, end: index, name: attribute, value: "" });
			continue;
		}
		index += 1;
		index += stickyMatch(SPACE, text, index)?.length ?? 0;
		const quote = text[index];
		if (quote === '"' || quote === "'") {
			const end = text.indexOf(quote, index + 1);
			if (end < 0) return null;
			attributes.push({
				start,
				end: end + 1,
				name: attribute,
				value: decodeEntities(text.slice(index + 1, end)),
			});
			index = end + 1;
		} else if (jsx && quote === "{") {
			const end = closingBrace(text, index);
			if (end < 0) return null;
			const source = text.slice(index, end + 1);
			attributes.push({
				start,
				end: end + 1,
				name: attribute,
				value: literalValue(source.slice(1, -1)),
				source,
			});
			index = end + 1;
		} else {
			const bare = jsx ? null : stickyMatch(UNQUOTED_VALUE, text, index);
			if (!bare) return null;
			attributes.push({
				start,
				end: index + bare.length,
				name: attribute,
				value: decodeEntities(bare),
			});
			index += bare.length;
		}
	}
};
