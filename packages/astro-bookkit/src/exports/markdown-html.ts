import { decodeNamedCharacterReference } from "decode-named-character-reference";
import {
	BLOCK_ELEMENTS,
	KEPT_ELEMENTS,
	VOID_ELEMENTS,
} from "../utils/markdown";

/**
 * Raw HTML in Markdown, as the exports read it: tags, their attributes, and
 * character references. The exports render the elements import keeps
 * (`KEPT_ELEMENTS`), which the site renders too, and drop any other tag
 * while keeping its text.
 */

/** An HTML character reference: `&amp;`, `&#101;`, `&#x65;`. */
export const CHARACTER_REFERENCE =
	"&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});";

/**
 * The character a reference stands for, or null for a name HTML does not
 * define. Code points XML cannot hold (controls, surrogates, noncharacters)
 * become U+FFFD, as CommonMark replaces them.
 */
export const decodeCharacterReference = (reference: string): string | null => {
	const body = reference.slice(1, -1);
	if (!body.startsWith("#")) {
		const named = decodeNamedCharacterReference(body);
		return named === false ? null : named;
	}
	const code = /^#[xX]/.test(body)
		? Number.parseInt(body.slice(2), 16)
		: Number.parseInt(body.slice(1), 10);
	const invalid =
		(code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
		(code >= 0x7f && code < 0xa0) ||
		(code >= 0xd800 && code < 0xe000) ||
		(code >= 0xfdd0 && code < 0xfdf0) ||
		(code & 0xfffe) === 0xfffe ||
		code > 0x10ffff;
	return invalid ? "�" : String.fromCodePoint(code);
};

/** Text with its character references decoded; a name HTML does not define stays as written. */
export const decodeEntities = (value: string): string =>
	value.replace(
		new RegExp(CHARACTER_REFERENCE, "g"),
		(reference) => decodeCharacterReference(reference) ?? reference,
	);

/** An HTML or JSX tag (`<kbd>`, `</details>`, `<img src="…" />`); JSX values in braces are allowed. */
export const HTML_TAG =
	"</?[A-Za-z][\\w.:-]*(?:\\s+[^\\s\"'<>/=]+(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|\\{[^{}]*\\}|[^\\s\"'=<>`]+))?)*\\s*/?>";
export const IMG_TAG = "<img\\b[^>]*>";

const TAG_PARTS = /^<(\/?)([A-Za-z][\w.:-]*)([\s\S]*?)(\/?)>$/;
const ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[^{}]*\})|([^\s"'=<>`]+)))?/g;

/** A tag's parts: its name, and its attributes with their character references decoded. */
export type HtmlTag = {
	/**
	 * As written. A capitalized name is an MDX component (`<Callout>`), which
	 * no export renders, so it never matches an element name.
	 */
	name: string;
	closing: boolean;
	/** `<x />`, or an element that never has content (`<br>`, `<hr>`). */
	empty: boolean;
	/** Attribute values by lower-case name; JSX expression values are left out. */
	attributes: Record<string, string>;
};

/** The parts of a tag `HTML_TAG` matched. */
export const readTag = (source: string): HtmlTag | null => {
	const match = source.match(TAG_PARTS);
	if (!match) return null;
	const [, closing, name, rawAttributes, selfClosing] = match;
	const attributes: Record<string, string> = {};
	for (const [
		,
		key,
		double,
		single,
		expression,
		bare,
	] of rawAttributes.matchAll(ATTRIBUTE)) {
		if (expression !== undefined) continue;
		attributes[key.toLowerCase()] = decodeEntities(
			double ?? single ?? bare ?? "",
		);
	}
	return {
		name,
		closing: Boolean(closing),
		empty: Boolean(selfClosing) || VOID_ELEMENTS.has(name),
		attributes,
	};
};

/** An attribute's value in an HTML tag, with its character references decoded. */
export const tagAttribute = (tag: string, name: string): string | undefined =>
	readTag(tag)?.attributes[name.toLowerCase()];

/**
 * Elements that start blocks of their own in the exports: the block
 * elements import keeps, plus `<hr>`. Content between their tags is read as
 * Markdown blocks, or as one block of text for a paragraph, heading, caption,
 * term, or table cell.
 */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
	...BLOCK_ELEMENTS,
	"hr",
]);

/**
 * Elements kept inside a line of text. The others import keeps are either
 * blocks (above), images (handled with Markdown images), or wrappers whose
 * content is all that shows (`<picture>`, `<source>`, `<wbr>`, `<col>`).
 */
export const INLINE_TAGS: ReadonlySet<string> = new Set(
	[...KEPT_ELEMENTS].filter(
		(name) =>
			!BLOCK_TAGS.has(name) && !VOID_ELEMENTS.has(name) && name !== "picture",
	),
);

/** How a tag's `align` attribute sets its text: obsolete in HTML, so the EPUB writes it as a class. */
export const tagAlign = (
	attributes: Record<string, string>,
): "left" | "center" | "right" | null => {
	const align = attributes.align?.trim().toLowerCase();
	return align === "left" || align === "center" || align === "right"
		? align
		: null;
};
