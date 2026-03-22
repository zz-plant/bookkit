import { appendHighlightedText, queryElement, toSafeUrl } from "./dom";
import { buildRankedResults } from "./search-ranking";
import type { SearchIndexStore } from "./search-index-store";

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
  const closeButton = queryElement(root, "[data-search-close]", HTMLButtonElement);
  const content = queryElement(root, "[data-search-content]", HTMLElement);
  const input = queryElement(root, "[data-search-input]", HTMLInputElement);
  const results = queryElement(root, "[data-search-results]", HTMLElement);
  const quickActions = queryElement(root, "[data-search-quick-actions]", HTMLElement);
  const status = queryElement(root, "[data-search-status]", HTMLElement);
  const empty = queryElement(root, "[data-search-empty]", HTMLElement);

  let lastFocused: HTMLElement | null = null;
  let query = "";
  let activeIndex = -1;
  let searchTimeout: number | null = null;
  let runId = 0;

  const setOpenState = (open: boolean) => {
    root.hidden = !open;
    root.classList.toggle("is-open", open);
    toggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
    mobileToggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const updateStatus = (message: string) => {
    if (status) status.textContent = message;
  };

  const getResultLinks = (): HTMLAnchorElement[] =>
    results ? Array.from(results.querySelectorAll("a.search-panel__item")) : [];

  const renderResults = (entries: ReturnType<typeof buildRankedResults>["results"], tokens: string[]) => {
    if (!results) return;
    results.replaceChildren();

    if (!entries.length) {
      empty?.removeAttribute("hidden");
      activeIndex = -1;
      return;
    }

    empty?.setAttribute("hidden", "true");
    const grouped = entries.reduce((groupMap, entry) => {
      const key = entry.label ?? entry.type;
      groupMap.set(key, [...(groupMap.get(key) ?? []), entry]);
      return groupMap;
    }, new Map<string, typeof entries>());

    const groupedEntries = Array.from(grouped.entries()).sort(([, aItems], [, bItems]) => {
      const aOrder = aItems[0]?.order ?? 999;
      const bOrder = bItems[0]?.order ?? 999;
      return aOrder - bOrder;
    });

    groupedEntries.forEach(([label, items]) => {
      const section = document.createElement("div");
      section.className = "search-panel__group";
      const heading = document.createElement("h3");
      heading.textContent = `${label} (${items.length})`;
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "search-panel__list";
      items.forEach((entry) => {
        const link = document.createElement("a");
        link.href = toSafeUrl(entry.url);
        link.className = "search-panel__item";
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
        const breadcrumb = entry.section ? `${entry.context} › ${entry.section}` : entry.context;
        meta.textContent = `${entry.label} • ${breadcrumb}`;

        link.append(title, snippet, meta);
        list.appendChild(link);
      });

      section.appendChild(list);
      results.appendChild(section);
    });

    const links = getResultLinks();
    activeIndex = links.length ? 0 : -1;
    links.forEach((link, index) => {
      link.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
    });
  };

  const runSearch = async (value: string) => {
    const currentRunId = ++runId;
    const index = await indexStore.load({ onStatus: updateStatus });
    if (currentRunId !== runId) return;

    query = value;
    const normalizedQuery = value.trim().toLowerCase();
    if (!normalizedQuery) {
      results?.replaceChildren();
      empty?.setAttribute("hidden", "true");
      quickActions?.removeAttribute("hidden");
      updateStatus("Type a word or phrase to find relevant sections.");
      return;
    }

    quickActions?.setAttribute("hidden", "true");
    const { tokens, results: rankedResults } = buildRankedResults(index, normalizedQuery);
    renderResults(rankedResults, tokens);
    updateStatus(`${rankedResults.length} result${rankedResults.length === 1 ? "" : "s"}`);

    if (normalizedQuery.length >= 2) {
      recordEvent({ type: "query", query: normalizedQuery, results: rankedResults.length });
      if (!rankedResults.length) {
        recordEvent({ type: "zero_results", query: normalizedQuery });
      }
    }
  };

  const moveActiveResult = (delta: number) => {
    const links = getResultLinks();
    if (!links.length) return;
    activeIndex = (activeIndex + delta + links.length) % links.length;
    links.forEach((link, index) => {
      link.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      if (index === activeIndex) {
        link.scrollIntoView({ block: "nearest" });
      }
    });
  };

  const open = async () => {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenState(true);
    await indexStore.load({ onStatus: updateStatus });
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
    if (event.target instanceof HTMLElement && !event.target.closest("[data-search-content]")) {
      close();
    }
  });
  input?.addEventListener("input", (event) => {
    const value = event.target instanceof HTMLInputElement ? event.target.value : "";
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
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
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
