/**
 * What an UNSAFE_LINK or UNSAFE_HTML finding says: the message and fix for
 * each link, element, attribute, expression, or import/export block the site
 * leaves out. utils/markdown.ts finds them; utils/html-allowlist.ts decides.
 */

import {
	elementReason,
	extraPermissions,
	refusalReason,
} from "../../utils/html-allowlist";
import { SAFE_SCHEME_LIST } from "../../utils/links";
import type { UnsafeMarkupEntry } from "../../utils/markdown";
import type { ContentFinding } from "./contract";

/** A long value (a document in `srcdoc`, a spread) cut short at 60 characters. */
const shortened = (value: string): string =>
	value.length > 60 ? `${value.slice(0, 59)}…` : value;

/** An attribute as a message shows it: `<img onerror="alert(1)">`, `<a {...props}>`. */
const shownAttribute = (found: UnsafeMarkupEntry & { kind: "attribute" }) => {
	const { attribute, element, expression, value } = found;
	if (attribute === "{...}") return `<${element} ${shortened(value)}>`;
	if (!expression && !value) return `<${element} ${attribute}>`;
	return `<${element} ${attribute}=${expression ? shortened(value) : JSON.stringify(shortened(value))}>`;
};

/** How to do without an element the site leaves out, keeping what it holds. */
const unwrapFix = (element: string): string => {
	if (element === "svg") {
		return "Save the drawing as an .svg file and show it as an image: ![What it shows](/images/drawing.svg).";
	}
	if (element === "video" || element === "audio") {
		return `Link to the recording, or embed the page that plays it with an <iframe src="https://…">.`;
	}
	if (elementReason(element).includes("collects nothing")) {
		return "Link to the form where it is hosted.";
	}
	return `Remove the <${element}> tags, keeping what they hold, or write it in Markdown.`;
};

/** The fix for an attribute the site removes. */
const attributeFix = (found: UnsafeMarkupEntry & { kind: "attribute" }) => {
	const { attribute, element, value } = found;
	switch (found.refusal) {
		case "document":
			return `Point src at a web address or a page of the book in place of srcdoc, or remove the <${element}>.`;
		case "raw-html":
			return "Write the HTML out in the page, or remove set:html.";
		case "expression":
			return `Write ${attribute} as a plain string, as in ${attribute}="…".`;
		case "spread":
			return 'Write each attribute out with a plain string value, as in href="https://example.com".';
		case "permission":
			return `Remove ${extraPermissions(value).join(", ")} from allow.`;
		default:
			return `Remove ${attribute}.`;
	}
};

/**
 * What a finding says about something the site leaves out: a link to an
 * unsafe address (`UNSAFE_LINK`), which keeps its words; or raw HTML the
 * allowlist does not keep (`UNSAFE_HTML`): an element, an attribute, an
 * MDX expression, or an `import`/`export` block.
 */
export const unsafeMarkupFinding = (
	label: string,
	found: UnsafeMarkupEntry,
): Pick<ContentFinding, "code" | "message" | "fix"> => {
	const { line } = found;
	const linksOnly = `a book links only to ${SAFE_SCHEME_LIST} addresses and to its own pages`;
	if (found.kind === "link") {
		return {
			code: "UNSAFE_LINK",
			message: `${label} links to ${JSON.stringify(found.href)} on line ${line}, which the site shows only as words: ${linksOnly}`,
			fix: "Link to a web or mail address or a page of the book, or keep the words and remove the link.",
		};
	}
	if (found.kind === "attribute" && found.refusal === "address") {
		const { attribute, element, expression } = found;
		if (element === "a" && attribute === "href") {
			return expression
				? {
						code: "UNSAFE_LINK",
						message: `${label} has a link on line ${line} whose address is an expression (href=${found.value}), which the build cannot check, so the site shows only its words`,
						fix: 'Write the address as a plain string, as in href="https://example.com".',
					}
				: {
						code: "UNSAFE_LINK",
						message: `${label} links to ${JSON.stringify(found.value)} on line ${line}, which the site shows only as words: ${linksOnly}`,
						fix: "Link to a web or mail address or a page of the book, or keep the words and remove the link.",
					};
		}
		const embed = element === "iframe";
		return expression
			? {
					code: "UNSAFE_LINK",
					message: `${label} has ${shownAttribute(found)} on line ${line}, an address the build cannot check, so the site ${embed ? `leaves out the <${element}>` : `removes ${attribute}`}`,
					fix: `Write the address as a plain string, as in ${attribute}="https://example.com".`,
				}
			: {
					code: "UNSAFE_LINK",
					message: `${label} has ${shownAttribute(found)} on line ${line}, ${embed ? "which the site leaves out" : "an address the site removes"}: ${linksOnly}`,
					fix: `Point ${attribute} at a web address or a page of the book, or remove ${embed ? `the <${element}>` : "it"}.`,
				};
	}
	if (found.kind === "attribute") {
		return {
			code: "UNSAFE_HTML",
			message: `${label} has ${shownAttribute(found)} on line ${line}, and the site removes ${found.attribute === "{...}" ? "the spread" : found.attribute}: ${refusalReason(found.refusal, found.element, found.attribute, found.expression ? null : found.value)}`,
			fix: attributeFix(found),
		};
	}
	if (found.kind === "element") {
		const { element } = found;
		if (element === "iframe") {
			return {
				code: "UNSAFE_HTML",
				message: `${label} has an <iframe> with no src on line ${line}, which the site leaves out: it would show nothing`,
				fix: 'Give it the address of the page it embeds, as in <iframe src="https://www.youtube.com/embed/…">, or remove it.',
			};
		}
		return found.keeps === "nothing"
			? {
					code: "UNSAFE_HTML",
					message: `${label} has <${element}> on line ${line}, which the site leaves out with everything inside it: ${elementReason(element)}`,
					fix: `Remove the <${element}>.`,
				}
			: {
					code: "UNSAFE_HTML",
					message: `${label} has <${element}> on line ${line}, which the site leaves out, keeping what it holds: ${elementReason(element)}`,
					fix: unwrapFix(element),
				};
	}
	if (found.kind === "expression") {
		return {
			code: "UNSAFE_HTML",
			message: `${label} has an expression on line ${line} (${shortened(found.source)}), which the site leaves out: the build would run it, and what it writes is not checked`,
			fix: "Write it out as text or Markdown. To show braces, escape them: \\{ and \\}.",
		};
	}
	return {
		code: "UNSAFE_HTML",
		message: `${label} has an ${found.source.startsWith("import") ? "import" : "export"} block on line ${line}, code the build would run, which the site leaves out`,
		fix: "Remove it: content holds no code. Behavior comes from the engine or book.config.ts.",
	};
};
