import { isSitePath } from "../../utils/links";

export type ElementCtor<T extends Element> = abstract new (...args: any[]) => T;

const isElementOfType = <T extends Element>(
	value: Element | null,
	ctor: ElementCtor<T>,
): value is T => value instanceof ctor;

export const queryElement = <T extends Element>(
	root: ParentNode,
	selector: string,
	ctor: ElementCtor<T>,
): T | null => {
	const value = root.querySelector(selector);
	return isElementOfType(value, ctor) ? value : null;
};

export const queryAllElements = <T extends Element>(
	root: ParentNode,
	selector: string,
	ctor: ElementCtor<T>,
): T[] =>
	Array.from(root.querySelectorAll(selector)).filter(
		(value): value is T => value instanceof ctor,
	);

export const isEditableTarget = (
	target: EventTarget | null,
): target is HTMLElement =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * `value` as a link to a page of this book, or null when it is not a path
 * from the site's root (see `isSitePath`). Search results and the passages
 * an answer cites are always the book's own pages, so any other address (an
 * absolute URL, even to this site, `javascript:`, a relative path) is
 * refused: the caller shows the text with no link.
 */
export const sitePath = (value: unknown): string | null =>
	typeof value === "string" && isSitePath(value) ? value : null;

export const appendHighlightedText = (
	element: HTMLElement,
	value: string,
	tokens: string[],
): void => {
	const escapedTokens = tokens
		.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.filter(Boolean);

	if (!escapedTokens.length) {
		element.textContent = value;
		return;
	}

	const matcher = new RegExp(`(${escapedTokens.join("|")})`, "gi");
	value.split(matcher).forEach((fragment) => {
		if (!fragment) return;
		if (
			escapedTokens.some((token) =>
				new RegExp(`^${token}$`, "i").test(fragment),
			)
		) {
			const mark = document.createElement("mark");
			mark.textContent = fragment;
			element.appendChild(mark);
			return;
		}
		element.appendChild(document.createTextNode(fragment));
	});
};

export const initializeHeadingAnchors = (root: ParentNode = document): void => {
	const headings = root.querySelectorAll<HTMLElement>("h2[id], h3[id], h4[id]");
	headings.forEach((heading) => {
		if (heading.querySelector(".heading-anchor")) return;
		const anchor = document.createElement("a");
		anchor.className = "heading-anchor";
		anchor.href = `#${heading.id}`;
		anchor.setAttribute(
			"aria-label",
			`Direct link to ${heading.textContent?.trim() || "section"}`,
		);
		anchor.textContent = "#";
		anchor.title = "Copy direct link to section";
		anchor.addEventListener("click", (e) => {
			e.preventDefault();
			const url = new URL(window.location.href);
			url.hash = heading.id;
			window.history.pushState(null, "", url.toString());
			navigator.clipboard?.writeText(url.toString()).catch(() => {});
			anchor.textContent = "✓";
			setTimeout(() => {
				anchor.textContent = "#";
			}, 1500);
			heading.scrollIntoView({ behavior: "smooth" });
		});
		heading.appendChild(anchor);
	});
};
