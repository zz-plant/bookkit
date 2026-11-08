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

export const initializeToolkitChecklists = (
	root: ParentNode = document,
): void => {
	const stepLists = root.querySelectorAll<HTMLOListElement>("ol.step-list");
	if (!stepLists.length) return;

	const pathParts = window.location.pathname.split("/").filter(Boolean);
	const toolSlug = pathParts[pathParts.length - 1] || "default";
	const storageKey = `bookkit:tool-steps:${toolSlug}`;

	stepLists.forEach((list) => {
		if (list.dataset.checklistInitialized === "true") return;
		list.dataset.checklistInitialized = "true";

		const heading = list.previousElementSibling?.matches("h2#steps")
			? (list.previousElementSibling as HTMLElement)
			: (list.closest("section")?.querySelector<HTMLElement>("h2#steps") ??
				null);

		const cards = Array.from(
			list.querySelectorAll<HTMLLIElement>("li.step-card"),
		);
		if (!cards.length) return;

		let savedIndices: number[] = [];
		try {
			const raw = localStorage.getItem(storageKey);
			if (raw) savedIndices = JSON.parse(raw);
		} catch {}

		let resetBtn: HTMLButtonElement | null = null;

		if (
			heading &&
			!heading.parentElement?.querySelector(".toolkit-steps-actions")
		) {
			const headerWrap = document.createElement("div");
			headerWrap.className = "toolkit-steps-header";

			heading.parentElement?.insertBefore(headerWrap, heading);
			headerWrap.appendChild(heading);

			const actionsBar = document.createElement("div");
			actionsBar.className = "toolkit-steps-actions";

			const copyBtn = document.createElement("button");
			copyBtn.type = "button";
			copyBtn.className = "toolkit-btn";
			copyBtn.textContent = "Copy checklist";
			copyBtn.title = "Copy steps as markdown checklist";
			copyBtn.setAttribute("aria-label", "Copy steps as markdown checklist");

			copyBtn.addEventListener("click", () => {
				const title =
					document.querySelector("h1")?.textContent?.trim() ||
					"Procedure Steps";
				const lines = cards.map((card, idx) => {
					const cb = card.querySelector<HTMLInputElement>(".step-checkbox");
					const stepText =
						card.querySelector(".step-card__text")?.textContent?.trim() ||
						card.lastElementChild?.textContent?.trim() ||
						"";
					return `- [${cb?.checked ? "x" : " "}] ${idx + 1}. ${stepText}`;
				});
				const markdown = `### ${title}\n\n${lines.join("\n")}\n`;
				navigator.clipboard?.writeText(markdown).catch(() => {});
				copyBtn.textContent = "✓ Copied!";
				setTimeout(() => {
					copyBtn.textContent = "Copy checklist";
				}, 2000);
			});

			resetBtn = document.createElement("button");
			resetBtn.type = "button";
			resetBtn.className = "toolkit-btn";
			resetBtn.textContent = "Reset";
			resetBtn.title = "Clear checked steps";
			resetBtn.setAttribute("aria-label", "Clear checked steps");
			resetBtn.hidden = !savedIndices.length;

			resetBtn.addEventListener("click", () => {
				cards.forEach((card) => {
					const cb = card.querySelector<HTMLInputElement>(".step-checkbox");
					if (cb) cb.checked = false;
					card.classList.remove("step-card--completed");
				});
				try {
					localStorage.removeItem(storageKey);
				} catch {}
				if (resetBtn) resetBtn.hidden = true;
			});

			actionsBar.appendChild(copyBtn);
			actionsBar.appendChild(resetBtn);
			headerWrap.appendChild(actionsBar);
		}

		cards.forEach((card, idx) => {
			const numberSpan = card.querySelector(".step-card__number");
			const textNode = card.lastElementChild;
			if (!numberSpan || !textNode) return;

			textNode.classList.add("step-card__text");

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.className = "step-checkbox";
			checkbox.setAttribute("aria-label", `Step ${idx + 1}`);

			if (savedIndices.includes(idx)) {
				checkbox.checked = true;
				card.classList.add("step-card--completed");
			}

			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					card.classList.add("step-card--completed");
				} else {
					card.classList.remove("step-card--completed");
				}
				const currentChecked = cards
					.map((c, i) =>
						c.querySelector<HTMLInputElement>(".step-checkbox")?.checked
							? i
							: -1,
					)
					.filter((i) => i >= 0);
				try {
					localStorage.setItem(storageKey, JSON.stringify(currentChecked));
				} catch {}
				if (resetBtn) resetBtn.hidden = !currentChecked.length;
			});

			card.insertBefore(checkbox, numberSpan);
		});
	});
};
