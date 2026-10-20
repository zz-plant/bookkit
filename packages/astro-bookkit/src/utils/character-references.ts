import { decodeNamedCharacterReference } from "decode-named-character-reference";

/** HTML character references, decoded as a browser and CommonMark decode them. */

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
