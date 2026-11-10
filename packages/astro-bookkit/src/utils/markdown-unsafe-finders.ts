import { decodeEntities } from "./character-references";
import {
	type AttributeRefusal,
	attributeRefusal,
	componentPropRefusal,
	elementVerdict,
	isAddressAttribute,
	isCommentExpression,
	literalValue,
	VOID_ELEMENTS,
} from "./html-allowlist";
import { isSafeLink } from "./links";
import {
	closingBrace,
	readTag,
	type Tag,
	type TagAttribute,
} from "./markdown-tag-scan";
import { normalizeLabel } from "./markdown-text";

/**
 * What `findUnsafeMarkup` looks for: Markdown links to addresses the site
 * refuses (`unsafeMarkdownLinks`), and raw HTML, MDX expressions, and code
 * the allowlist does not keep (`unsafeHtml`). Each finding says where it is
 * and what changes in the source to leave it out.
 */

/** A change to source text: `start..end` becomes `text`. */
export type Edit = { start: number; end: number; text: string };

/** What `findUnsafeMarkup` finds, by kind. */
export type MarkupKind =
	| {
			/** A Markdown link, reference, or definition to an address `isSafeLink` refuses. */
			kind: "link";
			/** The address, decoded. */
			href: string;
	  }
	| {
			/** An attribute of a kept element, or a component's prop. */
			kind: "attribute";
			/** Lower case for an HTML element; a component's name as written. */
			element: string;
			/** Lower case for an HTML element; `{...}` for a spread. */
			attribute: string;
			/** Its value, decoded; an expression or a spread as written, braces included. */
			value: string;
			/** Whether the value is an expression or a spread, which the build cannot read. */
			expression: boolean;
			refusal: AttributeRefusal;
	  }
	| {
			/** An element the site leaves out (`elementVerdict`), or an `<iframe>` with no `src`. */
			kind: "element";
			/** Lower case. */
			element: string;
			/** What the site keeps of it: what it holds, or nothing. */
			keeps: "contents" | "nothing";
	  }
	| {
			/** An MDX expression (`{…}`) that is not a comment or a plain literal, or an `import`/`export` block. */
			kind: "expression" | "code";
			/** As written. */
			source: string;
	  };

export type Found = {
	/** Where it is in the source: the link, definition, attribute, tag, expression, or block. */
	start: number;
	end: number;
	/** What changes in the source to leave it out. */
	edits: Edit[];
} & MarkupKind;

/** A Markdown link destination as CommonMark reads it: escapes and character references decoded. */
const readDestination = (raw: string): string =>
	decodeEntities(
		(raw.startsWith("<") ? raw.slice(1, -1) : raw).replace(
			/\\([!-/:-@[-`{-~])/g,
			"$1",
		),
	);

/** The index of the `[` that opens the bracket closing at `close`, or -1. */
const openingBracket = (text: string, close: number): number => {
	let depth = 0;
	for (let index = close; index >= 0; index -= 1) {
		if (text[index - 1] === "\\") continue;
		if (text[index] === "]") depth += 1;
		else if (text[index] === "[" && --depth === 0) return index;
		else if (text[index] === "\n" && text[index - 1] === "\n") return -1;
	}
	return -1;
};

/**
 * Where an inline link's `(destination "title")` that opens at `open` ends,
 * and its destination; null when it is not one.
 */
const inlineDestination = (
	text: string,
	open: number,
): { raw: string; end: number } | null => {
	const rest = text.slice(open + 1);
	const match = rest.match(
		/^[ \t]*\n?[ \t]*(<[^<>\n]*>|(?:[^\s()\\]|\\.|\((?:[^\s()\\]|\\.)*\))*)(?:[ \t]*\n?[ \t]*(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*\n?[ \t]*\)/,
	);
	return match ? { raw: match[1], end: open + 1 + match[0].length } : null;
};

// `[label]: destination` at the start of a line; `[^1]:` is a footnote.
const DEFINITION =
	/^ {0,3}\[(?!\^)((?:[^\]\\\n]|\\.)+)\]:[ \t]*(<[^<>\n]*>|\S+)[^\n]*(?:\n|$)/gm;
// `[text][label]`, `[label][]`, or `[label]`, not followed by `(` or `:`.
const REFERENCE =
	/(?<![!\]\\])\[((?:[^\]\\\n]|\\.)+)\](?:\[((?:[^\]\\\n]|\\.)*)\])?(?![(:[])/g;

/** Markdown links, references, and definitions to addresses `isSafeLink` refuses. */
export const unsafeMarkdownLinks = (
	markdown: string,
	masked: string,
): Found[] => {
	const found: Found[] = [];
	const link = (start: number, end: number, text: string, href: string) =>
		found.push({
			kind: "link",
			start,
			end,
			href,
			edits: [{ start, end, text }],
		});

	// The address each unsafe definition's label stands for.
	const unsafeLabels = new Map<string, string>();
	for (const match of masked.matchAll(DEFINITION)) {
		const href = readDestination(match[2]);
		if (isSafeLink(href)) continue;
		unsafeLabels.set(normalizeLabel(match[1]), href);
		const start = match.index ?? 0;
		link(start, start + match[0].length, "", href);
	}

	for (const match of masked.matchAll(/\]\(/g)) {
		const close = match.index ?? 0;
		const open = openingBracket(masked, close);
		if (open < 0 || masked[open - 1] === "!") continue;
		const destination = inlineDestination(masked, close + 1);
		if (!destination) continue;
		const href = readDestination(destination.raw);
		if (isSafeLink(href)) continue;
		link(open, destination.end, markdown.slice(open + 1, close), href);
	}

	if (unsafeLabels.size > 0) {
		for (const match of masked.matchAll(REFERENCE)) {
			const href = unsafeLabels.get(normalizeLabel(match[2] || match[1]));
			if (href === undefined) continue;
			const start = match.index ?? 0;
			link(
				start,
				start + match[0].length,
				markdown.slice(start + 1, start + 1 + match[1].length),
				href,
			);
		}
	}
	return found;
};

/** An `import` or `export` line opening a block of MDX, which the build would run as code. */
const ESM_BLOCK =
	/(?<=^|\n[ \t]*\n)(?:import|export)(?=[\s{*])[\s\S]*?(?=\n[ \t]*\n|$)/g;

/**
 * Raw HTML, MDX expressions, and code the allowlist does not keep
 * (`html-allowlist.ts`): elements left out, attributes removed (an unsafe
 * address among them), and, in MDX, expressions and `import`/`export`
 * blocks. `holds` gets, for each finding that leaves out a whole region
 * (an element and what it holds, an expression, a block), that region;
 * `wraps`, for each element left out keeping what it holds, its extent.
 */
export const unsafeHtml = (
	masked: string,
	jsx: boolean,
	holds: Map<Found, Edit>,
	wraps: Map<Found, Edit>,
): Found[] => {
	const found: Found[] = [];
	const remove = (start: number, end: number): Edit => ({
		start,
		end,
		text: "",
	});
	const leaveOut = (each: Found, region: Edit) => {
		found.push(each);
		holds.set(each, region);
	};

	const tags: Tag[] = [];
	for (let index = 0; index < masked.length; index += 1) {
		const char = masked[index];
		if (char === "\\") {
			index += 1;
		} else if (char === "<") {
			const tag = readTag(masked, index, jsx);
			if (!tag) continue;
			tags.push(tag);
			index = tag.end - 1;
		} else if (jsx && char === "{") {
			const end = closingBrace(masked, index);
			if (end < 0) continue;
			const source = masked.slice(index, end + 1);
			const inner = source.slice(1, -1);
			if (!isCommentExpression(inner) && literalValue(inner) === null) {
				const region = remove(index, end + 1);
				leaveOut(
					{
						kind: "expression",
						start: index,
						end: end + 1,
						source,
						edits: [region],
					},
					region,
				);
			}
			index = end;
		}
	}
	if (jsx) {
		for (const match of masked.matchAll(ESM_BLOCK)) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			const region = remove(start, end);
			leaveOut(
				{ kind: "code", start, end, source: match[0], edits: [region] },
				region,
			);
		}
	}

	// Each opening tag's closing tag, as the source nests them.
	const closes = new Map<Tag, Tag>();
	const open: Tag[] = [];
	const key = (tag: Tag) => (jsx ? tag.name : tag.name.toLowerCase());
	for (const tag of tags) {
		if (tag.selfClosing) continue;
		if (!tag.closing) {
			if (jsx || !VOID_ELEMENTS.has(tag.name.toLowerCase())) open.push(tag);
			continue;
		}
		const at = open.map(key).lastIndexOf(key(tag));
		if (at < 0) continue;
		closes.set(open[at], tag);
		open.length = at;
	}

	for (const tag of tags) {
		if (tag.closing || !tag.name) continue;
		const close = closes.get(tag);
		const whole = remove(tag.start, close?.end ?? tag.end);
		const unwrap = [
			remove(tag.start, tag.end),
			...(close ? [remove(close.start, close.end)] : []),
		];
		const component = jsx && !/^[a-z]/.test(tag.name);
		const element = component ? tag.name : tag.name.toLowerCase();
		/** An attribute that goes: by itself, or with `edits` (its link's tags). */
		const refuse = (
			{ start, end, name, value, source }: TagAttribute,
			refusal: AttributeRefusal,
			edits: Edit[] = [remove(start, end)],
		) =>
			found.push({
				kind: "attribute",
				start,
				end,
				element,
				attribute:
					name === null ? "{...}" : component ? name : name.toLowerCase(),
				value: value ?? source ?? "",
				expression: value === null,
				refusal,
				edits,
			});

		if (component) {
			// Its props are its own, but for these.
			for (const each of tag.attributes) {
				const refusal =
					each.name === null
						? "spread"
						: componentPropRefusal(each.name, each.value);
				if (refusal) refuse(each, refusal);
			}
			continue;
		}

		const verdict = elementVerdict(element);
		if (verdict === "drop") {
			leaveOut(
				{
					kind: "element",
					start: tag.start,
					end: tag.end,
					element,
					keeps: "nothing",
					edits: [whole],
				},
				whole,
			);
			continue;
		}
		if (verdict === "unwrap" && jsx) {
			const each: Found = {
				kind: "element",
				start: tag.start,
				end: tag.end,
				element,
				keeps: "contents",
				edits: unwrap,
			};
			found.push(each);
			wraps.set(each, whole);
			continue;
		}
		if (verdict === "unwrap") {
			// A note's tag that import shows as text: only an unsafe address goes.
			for (const each of tag.attributes) {
				if (
					each.name !== null &&
					isAddressAttribute(element, each.name) &&
					!isSafeLink(each.value ?? "")
				) {
					refuse(each, "address");
				}
			}
			continue;
		}

		// A kept element loses the attributes it may not carry. A link whose
		// address goes becomes its words. An embed whose source goes, or that
		// has none, goes too, named by its source, or else by the first
		// attribute it may not carry.
		let source = false;
		const first = found.length;
		for (const each of tag.attributes) {
			const name = each.name?.toLowerCase();
			const refusal =
				each.name === null
					? "spread"
					: attributeRefusal(element, each.name, each.value);
			if (!refusal) {
				source ||= name === "src" && Boolean(each.value?.trim());
			} else if (element === "a" && name === "href") {
				refuse(each, refusal, unwrap);
			} else {
				refuse(each, refusal);
			}
		}
		if (element === "iframe" && !source) {
			const refused = found.slice(first);
			const named =
				refused.find(
					(each) => each.kind === "attribute" && each.attribute === "src",
				) ?? refused[0];
			if (named) {
				named.edits = [whole];
				holds.set(named, whole);
			} else {
				leaveOut(
					{
						kind: "element",
						start: tag.start,
						end: tag.end,
						element,
						keeps: "nothing",
						edits: [whole],
					},
					whole,
				);
			}
		}
	}
	return found;
};
