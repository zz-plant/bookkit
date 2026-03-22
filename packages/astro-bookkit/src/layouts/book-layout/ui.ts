import { createBufferedTracker } from "./analytics-buffer";
import { queryElement } from "./dom";
import { initializeExportTracking } from "./export-tracking";
import { initializeKeyboardShortcuts } from "./keyboard-shortcuts";
import { initializeMobileNav } from "./mobile-nav";
import { initializeQaController } from "./qa-controller";
import { initializeReaderPrefs } from "./reader-prefs";
import { initializeSearchController } from "./search-controller";
import { createSearchIndexStore } from "./search-index-store";

const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
const qaEnabled = document.body?.dataset?.qaEnabled === "true";
const headerRoot = queryElement(document, ".site-header", HTMLElement);
const mainRoot = queryElement(document, "#main-content", HTMLElement);
const searchPanelRoot = queryElement(document, "[data-search-panel]", HTMLElement);
const qaPanelRoot = qaEnabled ? queryElement(document, "[data-qa-panel]", HTMLElement) : null;
const helpPanelRoot = queryElement(document, "[data-kbd-panel]", HTMLElement);
const mobileCtaRoot = queryElement(document, "[data-mobile-cta]", HTMLElement);
const searchToggle = queryElement(document, "[data-search-toggle]", HTMLButtonElement);
const mobileSearchToggle = mobileCtaRoot
  ? queryElement(mobileCtaRoot, "[data-mobile-search]", HTMLButtonElement)
  : null;
const qaToggle = qaEnabled ? queryElement(document, "[data-qa-toggle]", HTMLButtonElement) : null;
const helpToggle = queryElement(document, "[data-kbd-toggle]", HTMLButtonElement);
const exportAnalyticsEndpoint = document.body?.dataset?.exportAnalyticsEndpoint;

if (headerRoot && searchPanelRoot && helpPanelRoot) {
  const storage = window.localStorage;
  const searchIndexStore = createSearchIndexStore(async () => {
    const response = await fetch("/search-index.json");
    const payload = await response.json();
    return payload.entries ?? [];
  });

  const recordSearchEvent = createBufferedTracker(storage, `${analyticsKeyPrefix}.search.analytics`, "book-search");
  const recordExportEvent = createBufferedTracker(storage, `${analyticsKeyPrefix}.export.analytics`, "book-export");
  const recordQaEvent = createBufferedTracker(storage, `${analyticsKeyPrefix}.qa.analytics`, "book-qa");

  const search = initializeSearchController({
    root: searchPanelRoot,
    toggleButton: searchToggle,
    mobileToggleButton: mobileSearchToggle,
    indexStore: searchIndexStore,
    recordEvent: recordSearchEvent,
  });

  const qa = qaPanelRoot && qaToggle
    ? initializeQaController({
        root: qaPanelRoot,
        toggleButton: qaToggle,
        indexStore: searchIndexStore,
        recordEvent: recordQaEvent,
        storage,
        disabledKey: `${analyticsKeyPrefix}.qa.disabled`,
        displayModeKey: `${analyticsKeyPrefix}.qa.display.mode`,
      })
    : null;

  initializeReaderPrefs({
    root: headerRoot,
    storage,
    storageKey: `${analyticsKeyPrefix}.reader.prefs`,
  });

  initializeMobileNav({ headerRoot, mobileCtaRoot });
  initializeKeyboardShortcuts({
    root: helpPanelRoot,
    toggleButton: helpToggle,
    mainRoot,
    search,
    qa,
  });
  initializeExportTracking({ endpoint: exportAnalyticsEndpoint, recordEvent: recordExportEvent });
}
