import {
	attributeRefusal,
	componentPropRefusal,
	elementVerdict,
	isCommentExpression,
	literalValue,
	opensNewWindow,
	withNoopener,
} from "../utils/html-allowlist";
import { isSafeLink } from "../utils/links";

/**
 * The site's pages keep only the raw HTML the allowlist keeps
 * (`utils/html-allowlist.ts`) and the links `isSafeLink` allows, as the
 * PDF, EPUB, and `bookkit check` do:
 *
 * - A Markdown link, or a reference to a definition, whose address would
 *   run code or open a document it carries (`javascript:`, `vbscript:`,
 *   `data:`) becomes its text.
 * - An HTML element in MDX is kept, left out with what it holds (a
 *   `<script>`, a `<style>`), or left out keeping what it holds (a `<form>`,
 *   an `<svg>`), each part checked in turn. A kept element loses the
 *   attributes it may not carry: event handlers, `style`, `srcdoc`,
 *   `set:html`, an unsafe address, an expression that is not a plain
 *   string, a spread. An `<a>` whose address goes becomes its words; an
 *   `<iframe>` with no safe `src` goes, and what it holds always does (a
 *   browser never shows it); a link that opens a new window gets
 *   `rel="noopener"`.
 * - A component (`<Callout>`) is kept, but loses `set:html`, expressions,
 *   and spreads.
 * - An MDX expression (`{…}`) that is not a comment or a plain literal, and
 *   an `import` or `export` block, go: the build would run them, and what
 *   they write is not checked.
 *
 * It runs on the Markdown tree (mdast), before HTML exists, because Astro 7's
 * default processor, Sätteri, runs no rehype plugins passed to `mdx()`.
 * `addSafeHtml` adds it to whichever processor the book's Astro config uses.
 */

type MdastNode = {
	type: string;
	url?: string;
	identifier?: string;
	name?: string | null;
	value?: string;
	attributes?: JsxAttribute[];
	children?: MdastNode[];
};

/** `mdxJsxAttribute` (`name="value"`, `name={…}`), or `mdxJsxExpressionAttribute` (`{...props}`). */
type JsxAttribute = {
	type: string;
	name?: string;
	value?: string | null | { type: string; value: string };
};

/** What an attribute holds: its text, or null for an expression the build cannot read. */
const attributeValue = (value: JsxAttribute["value"]): string | null => {
	if (value === null || value === undefined) return "";
	return typeof value === "string" ? value : literalValue(value.value);
};

const isJsxElement = (node: MdastNode): boolean =>
	node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement";

/** A component: a JSX name that does not start with a lower-case letter. */
const isComponent = (name: string): boolean => !/^[a-z]/.test(name);

const isUnsafeUrl = (node: MdastNode): boolean =>
	typeof node.url === "string" && !isSafeLink(node.url);

/** An expression the page may keep: a comment, or a plain literal. */
const isKeptExpression = (node: MdastNode): boolean =>
	isCommentExpression(node.value ?? "") ||
	literalValue(node.value ?? "") !== null;

/**
 * An element's attributes as the page keeps them, or the same array when
 * none goes; `lostAddress` when an `<a>` loses its `href`. A literal written
 * as an expression (`title={"x"}`) is kept as the plain string it is.
 */
const keptAttributes = (
	element: string,
	attributes: JsxAttribute[],
): { attributes: JsxAttribute[]; lostAddress: boolean } => {
	const component = isComponent(element);
	const name = element.toLowerCase();
	let changed = false;
	let lostAddress = false;
	const kept = attributes.flatMap((attribute): JsxAttribute[] => {
		if (attribute.type !== "mdxJsxAttribute" || !attribute.name) {
			changed = true;
			return [];
		}
		const value = attributeValue(attribute.value);
		const refusal = component
			? componentPropRefusal(attribute.name, value)
			: attributeRefusal(name, attribute.name, value);
		if (refusal) {
			changed = true;
			lostAddress ||= name === "a" && attribute.name.toLowerCase() === "href";
			return [];
		}
		if (component || typeof attribute.value !== "object" || !attribute.value) {
			return [attribute];
		}
		changed = true;
		return [{ type: "mdxJsxAttribute", name: attribute.name, value }];
	});
	return { attributes: changed ? kept : attributes, lostAddress };
};

/** `rel="noopener"` on a link that opens a new window (`target="_blank"`), or the same array. */
const withSafeTarget = (attributes: JsxAttribute[]): JsxAttribute[] => {
	const named = (key: string) =>
		attributes.find((attribute) => attribute.name?.toLowerCase() === key);
	const target = named("target");
	if (!target || !opensNewWindow(String(target.value ?? ""))) {
		return attributes;
	}
	const rel = named("rel");
	const value = withNoopener(String(rel?.value ?? ""));
	if (rel?.value === value) return attributes;
	return [
		...attributes.filter((attribute) => attribute !== rel),
		{ type: "mdxJsxAttribute", name: "rel", value },
	];
};

/**
 * What the page keeps of an element: nothing, what it holds, or the element
 * with the attributes it may carry; null when it is kept as it is.
 */
const keptElement = (
	node: MdastNode,
	definitions: ReadonlySet<string>,
): MdastNode[] | null => {
	const children = node.children ?? [];
	const name = node.name;
	// A fragment (`<>…</>`) holds only what is in it.
	if (!name) return keptNodes([...children], definitions);
	const verdict = isComponent(name) ? "keep" : elementVerdict(name);
	if (verdict === "drop") return [];
	if (verdict === "unwrap") return keptNodes([...children], definitions);
	const kept = keptAttributes(name, node.attributes ?? []);
	const element = name.toLowerCase();
	if (element === "a" && kept.lostAddress) {
		return keptNodes([...children], definitions);
	}
	let attributes = kept.attributes;
	let keptChildren = keptNodes(children, definitions);
	if (element === "iframe") {
		const source = attributes.find(
			(attribute) => attribute.name?.toLowerCase() === "src",
		);
		if (!String(source?.value ?? "").trim()) return [];
		keptChildren = keptChildren.length ? [] : keptChildren;
	}
	if (element === "a") attributes = withSafeTarget(attributes);
	if (attributes === node.attributes && keptChildren === children) return null;
	return [{ ...node, attributes, children: keptChildren }];
};

/**
 * What the page keeps of a node: a link's or reference's words, an
 * element's kept form, nothing for an expression or code it may not keep;
 * null when the node is kept as it is. Its children are not looked at.
 */
const keptNode = (
	node: MdastNode,
	definitions: ReadonlySet<string>,
): MdastNode[] | null => {
	switch (node.type) {
		case "link":
			return isUnsafeUrl(node)
				? keptNodes([...(node.children ?? [])], definitions)
				: null;
		case "linkReference":
			return definitions.has(node.identifier ?? "")
				? keptNodes([...(node.children ?? [])], definitions)
				: null;
		case "definition":
			return isUnsafeUrl(node) ? [] : null;
		case "mdxjsEsm":
			return [];
		case "mdxFlowExpression":
		case "mdxTextExpression":
			return isKeptExpression(node) ? null : [];
	}
	return isJsxElement(node) ? keptElement(node, definitions) : null;
};

/**
 * `nodes` as the page keeps them, at any depth: a button inside a form that
 * goes is checked too. The same array when nothing changes.
 */
const keptNodes = (
	nodes: MdastNode[],
	definitions: ReadonlySet<string>,
): MdastNode[] => {
	let changed = false;
	const kept = nodes.flatMap((node): MdastNode[] => {
		const replacement = keptNode(node, definitions);
		if (replacement) {
			changed = true;
			return replacement;
		}
		// An element's children were looked at with it.
		if (!node.children || isJsxElement(node)) return [node];
		const children = keptNodes(node.children, definitions);
		if (children === node.children) return [node];
		changed = true;
		return [{ ...node, children }];
	});
	return changed ? kept : nodes;
};

/** Where the first plugin leaves the identifiers of unsafe definitions for the second. */
const UNSAFE_DEFINITIONS = "bookkit:unsafeDefinitions";

type VisitorContext = {
	data: Record<string, unknown>;
	replaceNode: (node: MdastNode, replacement: MdastNode[]) => void;
	removeNode: (node: MdastNode) => void;
};

const unsafeDefinitions = (ctx: VisitorContext): Set<string> => {
	ctx.data[UNSAFE_DEFINITIONS] ??= new Set<string>();
	return ctx.data[UNSAFE_DEFINITIONS] as Set<string>;
};

/**
 * Replaces a node the page does not keep as it is with what it keeps.
 * Sätteri does not visit the nodes a replacement brings, so they are
 * checked here, at any depth.
 */
const keepSafe = (node: MdastNode, ctx: VisitorContext) => {
	const replacement = keptNode(node, unsafeDefinitions(ctx));
	if (replacement) ctx.replaceNode(node, replacement);
};

/**
 * Sätteri mdast plugins. The first pass removes unsafe definitions and notes
 * them, since a reference may come before its definition; the second keeps
 * what the allowlist and the link rule keep.
 */
export const safeHtmlMdastPlugins = [
	{
		name: "bookkit:unsafe-definitions",
		definition(node: MdastNode, ctx: VisitorContext) {
			if (!isUnsafeUrl(node)) return;
			unsafeDefinitions(ctx).add(node.identifier ?? "");
			ctx.removeNode(node);
		},
	},
	{
		name: "bookkit:safe-html",
		link: keepSafe,
		linkReference: keepSafe,
		mdxJsxTextElement: keepSafe,
		mdxJsxFlowElement: keepSafe,
		mdxFlowExpression: keepSafe,
		mdxTextExpression: keepSafe,
		mdxjsEsm: keepSafe,
	},
];

/** The same rules as a remark plugin, for a book that uses Astro's unified processor. */
export const remarkSafeHtml = () => (tree: MdastNode) => {
	const unsafe = new Set<string>();
	const collect = (node: MdastNode) => {
		if (node.type === "definition" && isUnsafeUrl(node)) {
			unsafe.add(node.identifier ?? "");
		}
		node.children?.forEach(collect);
	};
	collect(tree);
	if (tree.children) tree.children = keptNodes(tree.children, unsafe);
};

/** The Markdown processor in an Astro config (`markdown.processor`), as far as this reads it. */
type MarkdownProcessor = { name: string; options: object };

/**
 * Adds these rules to the book's Markdown processor, which renders its `.md`
 * and `.mdx` pages, once however often the config is set up; false for a
 * processor it does not know. Astro keeps the processor's `options` object
 * as configured, and both processors read their plugins from it when they
 * render, so plugins added here run.
 */
export const addSafeHtml = (processor: MarkdownProcessor): boolean => {
	const options = processor.options as Record<string, unknown>;
	const [plugins, ours] =
		processor.name === "satteri"
			? [options.mdastPlugins, safeHtmlMdastPlugins]
			: processor.name === "unified"
				? [options.remarkPlugins, [remarkSafeHtml]]
				: [undefined, []];
	if (!Array.isArray(plugins)) return false;
	if (!plugins.includes(ours[0])) plugins.push(...ours);
	return true;
};
