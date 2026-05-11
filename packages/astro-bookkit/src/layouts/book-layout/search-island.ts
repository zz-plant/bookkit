/**
 * Search island — lazy-loads only when search panel + toggle exist in DOM.
 */
import { createBufferedTracker } from "./analytics-buffer";
import { queryElement } from "./dom";
import { createSearchIndexStore } from "./search-index-store";

const root = document.querySelector<HTMLElement>("[data-search-panel]");
const toggle = document.querySelector<HTMLButtonElement>("[data-search-toggle]");
const mobileToggle = document.querySelector<HTMLButtonElement>("[data-mobile-search]");
if (!root) {
  // not a search page — nothing to wire
  throw new Error("search-island loaded on page without [data-search-panel]");
}

const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
const storage = window.localStorage;
const searchIndexStore = createSearchIndexStore(async () => {
  const response = await fetch("/search-index.json");
  const payload = await response.json();
  return payload.entries ?? [];
});
const recordSearchEvent = createBufferedTracker(
  storage,
  `${analyticsKeyPrefix}.search.analytics`,
  "book-search"
);

const { initializeSearchController } = await import("./search-controller");

export const search = initializeSearchController({
  root,
  toggleButton: toggle,
  mobileToggleButton: mobileToggle,
  indexStore: searchIndexStore,
  recordEvent: recordSearchEvent,
});