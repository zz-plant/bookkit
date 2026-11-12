import { isSitePath } from "../../utils/links";

export type ElementCtor<T extends Element> = abstract new (
	...args: never[]
) => T;

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

		// Under the list: how many steps are ticked, and Reset beside that count,
		// away from Copy so a thumb aiming at one does not clear the other.
		const status = document.createElement("p");
		status.className = "step-list__status";
		status.hidden = true;
		const statusText = document.createElement("span");
		statusText.setAttribute("role", "status");
		const resetBtn = document.createElement("button");
		resetBtn.type = "button";
		resetBtn.className = "toolkit-btn";
		resetBtn.textContent = "Reset";
		resetBtn.title = "Clear checked steps";
		status.append(statusText, resetBtn);
		list.after(status);

		const showProgress = (done: number) => {
			status.hidden = done === 0;
			statusText.textContent =
				done === cards.length
					? `All ${cards.length} steps done.`
					: `${done} of ${cards.length} steps done.`;
		};

		resetBtn.addEventListener("click", () => {
			cards.forEach((card) => {
				const cb = card.querySelector<HTMLInputElement>(".step-checkbox");
				if (cb) cb.checked = false;
				card.classList.remove("step-card--completed");
			});
			try {
				localStorage.removeItem(storageKey);
			} catch {}
			showProgress(0);
		});

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
				copyBtn.textContent = "Copied";
				setTimeout(() => {
					copyBtn.textContent = "Copy checklist";
				}, 2000);
			});

			actionsBar.appendChild(copyBtn);
			headerWrap.appendChild(actionsBar);
		}

		cards.forEach((card, idx) => {
			const numberSpan = card.querySelector(".step-card__number");
			const textNode = card.lastElementChild;
			if (!numberSpan || !textNode) return;

			textNode.classList.add("step-card__text");

			// The whole row is the label: a tap anywhere on the step ticks it, and
			// the checkbox is named by the step's number and text.
			const label = document.createElement("label");
			label.className = "step-card__label";
			card.classList.add("step-card--checkable");

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.className = "step-checkbox";

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
				showProgress(currentChecked.length);
			});

			label.append(checkbox, numberSpan, textNode);
			card.append(label);
		});

		showProgress(savedIndices.filter((index) => index < cards.length).length);
	});
};

/**
 * In-situ popover previews for inline references (mechanisms, glossary, toolkit).
 * When a reader hovers over or focuses a link pointing to an entry, a small floating
 * card shows its definition/snippet without breaking reading continuity.
 */
export const initializePreviewPopovers = (root: ParentNode): void => {
	const links = Array.from(
		root.querySelectorAll<HTMLAnchorElement>("a[href]"),
	).filter((a) => {
		const href = a.getAttribute("href") || "";
		return (
			href.includes("/read/mechanisms/") ||
			href.includes("/read/glossary/") ||
			href.includes("/read/toolkit/")
		);
	});

	if (!links.length) return;

	let popover: HTMLElement | null = null;
	let activeLink: HTMLAnchorElement | null = null;
	let hoverTimeout: number | null = null;
	let hideTimeout: number | null = null;

	const ensurePopover = (): HTMLElement => {
		let el = document.getElementById("bookkit-preview-popover");
		if (el) return el;
		el = document.createElement("div");
		el.id = "bookkit-preview-popover";
		el.className = "preview-popover";
		el.setAttribute("role", "tooltip");
		el.setAttribute("aria-hidden", "true");
		el.hidden = true;

		el.addEventListener("pointerenter", () => {
			if (hideTimeout !== null) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		});

		el.addEventListener("pointerleave", () => {
			hide();
		});

		document.body.appendChild(el);
		return el;
	};

	const hide = () => {
		if (hoverTimeout !== null) {
			window.clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		if (popover) {
			popover.hidden = true;
			popover.classList.remove("is-visible");
			popover.setAttribute("aria-hidden", "true");
		}
		activeLink = null;
	};

	const scheduleHide = () => {
		if (hideTimeout !== null) {
			window.clearTimeout(hideTimeout);
		}
		hideTimeout = window.setTimeout(hide, 200);
	};

	const showForLink = async (link: HTMLAnchorElement) => {
		activeLink = link;
		const href = link.getAttribute("href") || "";
		const targetPath = href.split("?")[0].split("#")[0].replace(/\/$/, "");

		try {
			const { getSharedIndexStore } = await import("./shared-index");
			const store = getSharedIndexStore();
			const entries = await store.load();
			if (activeLink !== link) return;

			const match = entries.find((e) => {
				const entryPath = e.url.split("?")[0].split("#")[0].replace(/\/$/, "");
				return entryPath === targetPath || targetPath.endsWith(entryPath);
			});

			if (!match?.snippet) {
				return;
			}

			popover = ensurePopover();
			while (popover.firstChild) {
				popover.removeChild(popover.firstChild);
			}

			const header = document.createElement("div");
			header.className = "preview-popover__header";

			const badge = document.createElement("span");
			badge.className = "preview-popover__badge";
			const rawType = match.type || match.section || "Reference";
			badge.textContent = rawType.charAt(0).toUpperCase() + rawType.slice(1);
			header.appendChild(badge);

			const title = document.createElement("strong");
			title.className = "preview-popover__title";
			title.textContent = match.title;
			header.appendChild(title);

			const snippet = document.createElement("p");
			snippet.className = "preview-popover__snippet";
			const text =
				match.snippet.length > 240
					? `${match.snippet.slice(0, 240)}…`
					: match.snippet;
			snippet.textContent = text;

			const footer = document.createElement("div");
			footer.className = "preview-popover__footer";
			const prompt = document.createElement("span");
			prompt.className = "preview-popover__prompt";
			prompt.textContent = "Click to inspect full entry →";
			footer.appendChild(prompt);

			popover.appendChild(header);
			popover.appendChild(snippet);
			popover.appendChild(footer);

			const rect = link.getBoundingClientRect();
			const popoverWidth = Math.min(360, window.innerWidth - 32);
			popover.style.width = `${popoverWidth}px`;

			let left = rect.left + window.scrollX;
			if (left + popoverWidth > window.innerWidth - 16) {
				left = window.innerWidth - popoverWidth - 16;
			}
			if (left < 16) left = 16;

			let top = rect.bottom + window.scrollY + 8;
			if (rect.bottom + 180 > window.innerHeight && rect.top > 180) {
				top = rect.top + window.scrollY - 180;
			}

			popover.style.top = `${top}px`;
			popover.style.left = `${left}px`;
			popover.hidden = false;
			popover.setAttribute("aria-hidden", "false");
			requestAnimationFrame(() => {
				if (popover && activeLink === link) {
					popover.classList.add("is-visible");
				}
			});
		} catch {
			// Quietly ignore if search index is unavailable
		}
	};

	for (const link of links) {
		link.addEventListener("pointerenter", () => {
			if (hideTimeout !== null) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}
			hoverTimeout = window.setTimeout(() => {
				void showForLink(link);
			}, 250);
		});

		link.addEventListener("pointerleave", () => {
			scheduleHide();
		});

		link.addEventListener("focusin", () => {
			void showForLink(link);
		});

		link.addEventListener("focusout", () => {
			scheduleHide();
		});
	}

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			hide();
		}
	});
};
