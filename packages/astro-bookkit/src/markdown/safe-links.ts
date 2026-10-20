import {
	isAddressAttribute,
	isSafeLink,
	stringLiteralValue,
} from "../utils/links";

/**
 * The site's pages keep only links `isSafeLink` allows, as the PDF and EPUB
 * do: a Markdown link, or a reference to a definition, whose address would
 * run code or open a document it carries (`javascript:`, `vbscript:`,
 * `data:`) becomes its text. So does an HTML element in MDX with such an
 * address in an attribute `isAddressAttribute` names: an `<a href>` or
 * `<area href>`, an `<iframe src>`, `<embed src>`, or `<object data>`, a
 * `<form action>`, or a `formaction`. It becomes what it contains: a link
 * its words, an `<object>` its fallback, an `<iframe>` or `<embed>` nothing.
 * So does one whose address is an expression (`src={…}`) that is not a
 * plain string: the build cannot check what it will be.
 *
 * It runs on the Markdown tree (mdast), before HTML exists, because Astro 7's
 * default processor, Sätteri, runs no rehype plugins passed to `mdx()`.
 * `addSafeLinks` adds it to whichever processor the book's Astro config uses.
 */

type MdastNode = {
	type: string;
	url?: string;
	identifier?: string;
	name?: string | null;
	attributes?: JsxAttribute[];
	children?: MdastNode[];
};

type JsxAttribute = {
	type: string;
	name?: string;
	value?: string | null | { type: string; value: string };
};

/** The address an attribute holds, or null for an expression the build cannot read. */
const addressOf = (value: JsxAttribute["value"]): string | null => {
	if (value === null || value === undefined) return "";
	return typeof value === "string" ? value : stringLiteralValue(value.value);
};

/** Whether an attribute of `element` holds an address the page must not keep. */
const isUnsafeAddress = (element: string, attribute: JsxAttribute): boolean => {
	if (attribute.type !== "mdxJsxAttribute" || !attribute.name) return false;
	if (!isAddressAttribute(element, attribute.name)) return false;
	const address = addressOf(attribute.value);
	return address === null || !isSafeLink(address);
};

/**
 * Whether a node is a link the page must not keep: a Markdown link to an
 * unsafe address, or an HTML element with an unsafe address. A capitalized
 * JSX name is a component, whose props are not addresses.
 */
const isUnsafeLink = (node: MdastNode): boolean => {
	if (node.type === "link") return isUnsafeUrl(node);
	if (node.type !== "mdxJsxTextElement" && node.type !== "mdxJsxFlowElement") {
		return false;
	}
	const element = node.name;
	if (!element || !/^[a-z]/.test(element)) return false;
	return (node.attributes ?? []).some((attribute) =>
		isUnsafeAddress(element, attribute),
	);
};

const isUnsafeUrl = (node: MdastNode): boolean =>
	typeof node.url === "string" && !isSafeLink(node.url);

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

/** Whether a node goes, leaving what it contains: a link, reference, or element. */
const mustGo = (node: MdastNode, definitions: ReadonlySet<string>): boolean =>
	isUnsafeLink(node) ||
	(node.type === "linkReference" && definitions.has(node.identifier ?? ""));

/**
 * `nodes` with each unsafe definition removed, and each link, reference, or
 * element that must go replaced by what it contains, at any depth: a button
 * inside a form that goes is checked too. The same array when nothing
 * changes.
 */
const keptNodes = (
	nodes: MdastNode[],
	definitions: ReadonlySet<string>,
): MdastNode[] => {
	let changed = false;
	const kept = nodes.flatMap((node): MdastNode[] => {
		if (node.type === "definition" && isUnsafeUrl(node)) {
			changed = true;
			return [];
		}
		if (mustGo(node, definitions)) {
			changed = true;
			return keptNodes([...(node.children ?? [])], definitions);
		}
		if (!node.children) return [node];
		const children = keptNodes(node.children, definitions);
		if (children === node.children) return [node];
		changed = true;
		return [{ ...node, children }];
	});
	return changed ? kept : nodes;
};

/**
 * Replaces a link or element that must go with what it contains. Sätteri
 * does not visit the nodes a replacement brings, so they are cleaned here.
 */
const keepContents = (node: MdastNode, ctx: VisitorContext) => {
	const definitions = unsafeDefinitions(ctx);
	if (!mustGo(node, definitions)) return;
	ctx.replaceNode(node, keptNodes([...(node.children ?? [])], definitions));
};

/**
 * Sätteri mdast plugins. The first pass removes unsafe definitions and notes
 * them, since a reference may come before its definition; the second turns
 * links and references to them into their text, and elements with unsafe
 * addresses into what they contain.
 */
export const safeLinksMdastPlugins = [
	{
		name: "bookkit:unsafe-definitions",
		definition(node: MdastNode, ctx: VisitorContext) {
			if (!isUnsafeUrl(node)) return;
			unsafeDefinitions(ctx).add(node.identifier ?? "");
			ctx.removeNode(node);
		},
	},
	{
		name: "bookkit:safe-links",
		link: keepContents,
		linkReference: keepContents,
		mdxJsxTextElement: keepContents,
		mdxJsxFlowElement: keepContents,
	},
];

/** The same rules as a remark plugin, for a book that uses Astro's unified processor. */
export const remarkSafeLinks = () => (tree: MdastNode) => {
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
 * Adds the safe-link rules to the book's Markdown processor, which renders
 * its `.md` and `.mdx` pages, once however often the config is set up; false
 * for a processor it does not know. Astro keeps the processor's `options`
 * object as configured, and both processors read their plugins from it when
 * they render, so plugins added here run.
 */
export const addSafeLinks = (processor: MarkdownProcessor): boolean => {
	const options = processor.options as Record<string, unknown>;
	const [plugins, ours] =
		processor.name === "satteri"
			? [options.mdastPlugins, safeLinksMdastPlugins]
			: processor.name === "unified"
				? [options.remarkPlugins, [remarkSafeLinks]]
				: [undefined, []];
	if (!Array.isArray(plugins)) return false;
	if (!plugins.includes(ours[0])) plugins.push(...ours);
	return true;
};
