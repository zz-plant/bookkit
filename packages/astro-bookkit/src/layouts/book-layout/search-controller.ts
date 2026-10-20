import { appendHighlightedText, queryElement, toSafeUrl } from "./dom";
import { createQueryEngine } from "./query-engine";
import type { SearchIndexStore } from "./search-index-store";
import type { RankedSearchResult } from "./search-ranking";

export type SearchEventPayload = {
	type: "query" | "zero_results" | "click";
	query: string;
	results?: number;
	id?: string;
};

export type SearchController = {
	open: () => Promise<void>;
	close: () => void;
	toggle: () => void;
	isOpen: () => boolean;
};

type SearchControllerOptions = {
	root: HTMLElement;
	toggleButton: HTMLButtonElement | null;
	mobileToggleButton: HTMLButtonElement | null;
	indexStore: SearchIndexStore;
	recordEvent: (payload: SearchEventPayload) => void;
};

export const initializeSearchController = ({
	root,
	toggleButton,
	mobileToggleButton,
	indexStore,
	recordEvent,
}: SearchControllerOptions): SearchController => {
	const closeButton = queryElement(
		root,
		"[data-search-close]",
		HTMLButtonElement,
	);
	const input = queryElement(root, "[data-search-input]", HTMLInputElement);
	const results = queryElement(root, "[data-search-results]", HTMLElement);
	const quickActions = queryElement(
		root,
		"[data-search-quick-actions]",
		HTMLElement,
	);
	const status = queryElement(root, "[data-search-status]", HTMLElement);
	const empty = queryElement(root, "[data-search-empty]", HTMLElement);

	let lastFocused: HTMLElement | null = null;
	let query = "";
	let activeIndex = -1;
	let searchTimeout: number | null = null;

	const setOpenState = (open: boolean) => {
		root.hidden = !open;
		root.classList.toggle("is-open", open);
		toggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
		mobileToggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
	};

	const updateStatus = (message: string) => {
		if (status) status.textContent = message;
	};

	const queryEngine = createQueryEngine({ indexStore, onStatus: updateStatus });
	const getResultLinks = (): HTMLAnchorElement[] =>
		results ? Array.from(results.querySelectorAll("a.search-panel__item")) : [];

	/**
	 * The field is a combobox and the results its listbox (WAI-ARIA APG,
	 * combobox with listbox popup). Focus stays in the field, so
	 * aria-activedescendant tells a screen reader which result the arrow
	 * keys selected; aria-selected marks it for the eye.
	 */
	const setActiveResult = (index: number) => {
		const links = getResultLinks();
		activeIndex = links.length ? index : -1;
		links.forEach((link, linkIndex) => {
			link.setAttribute(
				"aria-selected",
				linkIndex === activeIndex ? "true" : "false",
			);
		});
		const active = links[activeIndex];
		if (active) {
			input?.setAttribute("aria-activedescendant", active.id);
		} else {
			input?.removeAttribute("aria-activedescendant");
		}
		input?.setAttribute("aria-expanded", links.length ? "true" : "false");
		return active;
	};

	const renderResults = (entries: RankedSearchResult[], tokens: string[]) => {
		if (!results) return;
		results.replaceChildren();

		if (!entries.length) {
			empty?.removeAttribute("hidden");
			setActiveResult(-1);
			return;
		}

		empty?.setAttribute("hidden", "true");
		const grouped = entries.reduce((groupMap, entry) => {
			const key = entry.label ?? entry.type;
			groupMap.set(key, [...(groupMap.get(key) ?? []), entry]);
			return groupMap;
		}, new Map<string, typeof entries>());

		const groupedEntries = Array.from(grouped.entries()).sort(
			([, aItems], [, bItems]) => {
				const aOrder = aItems[0]?.order ?? 999;
				const bOrder = bItems[0]?.order ?? 999;
				return aOrder - bOrder;
			},
		);

		let optionIndex = 0;
		groupedEntries.forEach(([label, items], groupIndex) => {
			// A group of options in the listbox, named by its label. The label
			// keeps its heading style but not the heading role, which a listbox
			// may not contain.
			const section = document.createElement("div");
			section.className = "search-panel__group";
			section.setAttribute("role", "group");
			const heading = document.createElement("h3");
			heading.id = `search-group-${groupIndex}`;
			heading.setAttribute("role", "presentation");
			heading.textContent = `${label} (${items.length})`;
			section.setAttribute("aria-labelledby", heading.id);
			section.appendChild(heading);

			const list = document.createElement("div");
			list.className = "search-panel__list";
			items.forEach((entry) => {
				const link = document.createElement("a");
				link.href = toSafeUrl(entry.url);
				link.className = "search-panel__item";
				link.id = `search-option-${optionIndex++}`;
				link.dataset.searchId = entry.id;
				link.setAttribute("role", "option");

				const title = document.createElement("div");
				title.className = "search-panel__item-title";
				appendHighlightedText(title, entry.title, tokens);

				const snippet = document.createElement("div");
				snippet.className = "search-panel__item-snippet";
				appendHighlightedText(snippet, entry.snippet, tokens);

				const meta = document.createElement("div");
				meta.className = "search-panel__item-meta";
				const breadcrumb = entry.section
					? `${entry.context} › ${entry.section}`
					: entry.context;
				meta.textContent = `${entry.label} • ${breadcrumb}`;

				link.append(title, snippet, meta);
				list.appendChild(link);
			});

			section.appendChild(list);
			results.appendChild(section);
		});

		setActiveResult(0);
	};

	const runSearch = async (value: string) => {
		query = value;
		const runResult = await queryEngine.run(value);
		if (runResult.status === "stale") return;

		const { normalizedQuery, tokens, results: rankedResults } = runResult;
		if (!normalizedQuery) {
			results?.replaceChildren();
			setActiveResult(-1);
			empty?.setAttribute("hidden", "true");
			quickActions?.removeAttribute("hidden");
			updateStatus("Type a word or phrase to find relevant sections.");
			return;
		}

		quickActions?.setAttribute("hidden", "true");
		renderResults(rankedResults, tokens);
		updateStatus(
			`${rankedResults.length} result${rankedResults.length === 1 ? "" : "s"}`,
		);

		if (normalizedQuery.length >= 2) {
			recordEvent({
				type: "query",
				query: normalizedQuery,
				results: rankedResults.length,
			});
			if (!rankedResults.length) {
				recordEvent({ type: "zero_results", query: normalizedQuery });
			}
		}
	};

	const moveActiveResult = (delta: number) => {
		const count = getResultLinks().length;
		if (!count) return;
		setActiveResult((activeIndex + delta + count) % count)?.scrollIntoView({
			block: "nearest",
		});
	};

	const open = async () => {
		lastFocused =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		setOpenState(true);
		document.body.style.overflow = "hidden";
		await queryEngine.loadIndex();
		window.requestAnimationFrame(() => {
			if (!input) return;
			input.value = query;
			input.focus({ preventScroll: true });
			input.select();
			if (query) {
				void runSearch(query);
			}
		});
	};

	const close = () => {
		setOpenState(false);
		document.body.style.overflow = "";
		activeIndex = -1;
		lastFocused?.focus?.();
	};

	const toggle = () => {
		if (root.hidden) {
			void open();
			return;
		}
		close();
	};

	toggleButton?.addEventListener("click", () => toggle());
	mobileToggleButton?.addEventListener("click", () => toggle());
	closeButton?.addEventListener("click", close);
	root.addEventListener("click", (event) => {
		if (
			event.target instanceof HTMLElement &&
			!event.target.closest("[data-search-content]")
		) {
			close();
		}
	});
	root.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			close();
			return;
		}
		if (event.key === "Tab") {
			const focusables = Array.from(
				root.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
				),
			).filter((el) => !el.hidden && el.offsetParent !== null);
			if (!focusables.length) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		}
	});
	input?.addEventListener("input", (event) => {
		const value =
			event.target instanceof HTMLInputElement ? event.target.value : "";
		if (searchTimeout !== null) {
			window.clearTimeout(searchTimeout);
		}
		searchTimeout = window.setTimeout(() => {
			void runSearch(value);
		}, 160);
	});
	input?.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			moveActiveResult(1);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			moveActiveResult(-1);
			return;
		}
		if (event.key === "Enter") {
			const active = getResultLinks()[activeIndex];
			if (!active) return;
			event.preventDefault();
			active.click();
		}
	});
	results?.addEventListener("click", (event) => {
		const target =
			event.target instanceof HTMLElement ? event.target.closest("a") : null;
		if (!(target instanceof HTMLAnchorElement)) return;
		recordEvent({ type: "click", id: target.dataset.searchId, query });
		close();
	});

	return {
		open,
		close,
		toggle,
		isOpen: () => !root.hidden,
	};
};
