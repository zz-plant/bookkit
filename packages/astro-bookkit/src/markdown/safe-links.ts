import { isSafeLink, stringLiteralValue } from "../utils/links";

/**
 * The site's pages keep only links `isSafeLink` allows, as the PDF and EPUB
 * do: a Markdown link, or a reference to a definition, whose address would
 * run code or open a document it carries (`javascript:`, `vbscript:`,
 * `data:`) becomes its text, and so does an HTML element in MDX (`<a>`,
 * `<area>`) with such an `href`. So does one with an `href={…}` that is not
 * a plain string: the build cannot check what it will be.
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

/** The address an `href` holds, or null for an expression the build cannot read. */
const hrefOf = (value: JsxAttribute["value"]): string | null => {
	if (value === null || value === undefined) return "";
	return typeof value === "string" ? value : stringLiteralValue(value.value);
};

/** Whether an attribute is an `href` the page must not keep. */
const isUnsafeHref = (attribute: JsxAttribute): boolean => {
	if (attribute.type !== "mdxJsxAttribute") return false;
	if (attribute.name?.toLowerCase() !== "href") return false;
	const href = hrefOf(attribute.value);
	return href === null || !isSafeLink(href);
};

/**
 * Whether a node is a link the page must not keep: a Markdown link to an
 * unsafe address, or an HTML element with an unsafe `href`. A capitalized
 * JSX name is a component, whose props are not links.
 */
const isUnsafeLink = (node: MdastNode): boolean => {
	if (node.type === "link") return isUnsafeUrl(node);
	if (node.type !== "mdxJsxTextElement" && node.type !== "mdxJsxFlowElement") {
		return false;
	}
	return (
		Boolean(node.name && /^[a-z]/.test(node.name)) &&
		(node.attributes ?? []).some(isUnsafeHref)
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

const keepTextOfUnsafeLink = (node: MdastNode, ctx: VisitorContext) => {
	if (isUnsafeLink(node)) ctx.replaceNode(node, [...(node.children ?? [])]);
};

/**
 * Sätteri mdast plugins. The first pass removes unsafe definitions and notes
 * them, since a reference may come before its definition; the second turns
 * links and references to them into their text.
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
		link: keepTextOfUnsafeLink,
		linkReference(node: MdastNode, ctx: VisitorContext) {
			if (unsafeDefinitions(ctx).has(node.identifier ?? "")) {
				ctx.replaceNode(node, [...(node.children ?? [])]);
			}
		},
		mdxJsxTextElement: keepTextOfUnsafeLink,
		mdxJsxFlowElement: keepTextOfUnsafeLink,
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
	const clean = (node: MdastNode) => {
		if (!node.children) return;
		node.children = node.children.flatMap((child) => {
			clean(child);
			if (child.type === "definition" && isUnsafeUrl(child)) return [];
			const unsafeLink =
				isUnsafeLink(child) ||
				(child.type === "linkReference" && unsafe.has(child.identifier ?? ""));
			return unsafeLink ? (child.children ?? []) : [child];
		});
	};
	clean(tree);
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
