import { createSlugger, stripMarkdown } from "../utils/markdown";

type HeadingNode = {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: HeadingNode[];
	value?: string;
};

const headingTags = new Set(["h1", "h2", "h3"]);

const extractText = (node: HeadingNode): string => {
	if (node.type === "text") {
		return typeof node.value === "string" ? node.value : "";
	}
	if (!node.children) return "";
	return node.children.map(extractText).join("");
};

/**
 * @deprecated Astro 7's default Markdown processor never runs rehype plugins
 * passed to `mdx()`, so this has had no effect; pages use Astro's GitHub-style
 * heading ids, and the search index now matches those. Kept so existing
 * configs still import; remove it from `astro.config.mjs`.
 */
export const rehypeBookkitHeadingIds = () => {
	return (tree: HeadingNode) => {
		const slugger = createSlugger();
		const visit = (node: HeadingNode) => {
			if (
				node.type === "element" &&
				node.tagName &&
				headingTags.has(node.tagName)
			) {
				node.properties ??= {};
				if (!("id" in node.properties)) {
					const headingText = stripMarkdown(extractText(node));
					node.properties.id = slugger(headingText);
				}
			}
			node.children?.forEach(visit);
		};
		visit(tree);
	};
};
