/**
 * UI orchestrator — checks DOM selectors and dynamically imports only the feature
 * islands needed for the current page. Shared dependencies (index store, analytics
 * buffers) are initialized once and passed to islands that request them.
 */
import { createBufferedTracker } from "./analytics-buffer";
import {
	initializeHeadingAnchors,
	queryAllElements,
	queryElement,
} from "./dom";
import { initializeResumeReading } from "./resume-reading";
import { searchQueryFromPath } from "./search-from-path";
import { getSharedIndexStore } from "./shared-index";
import { deferredLocalStorage as storage } from "./storage";

const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
// Set by the bookkit() integration from site.runtime. Without request
// handlers there is no Q&A endpoint, so the Ask island, and the in-browser
// models it loads, are compiled out of the bundle.
const hasServerRuntime = import.meta.env.BOOKKIT_SERVER_RUNTIME === true;
const qaEnabled =
	hasServerRuntime && document.body?.dataset?.qaEnabled === "true";
const qaEndpoint = document.body?.dataset?.qaEndpoint;

const headerRoot = queryElement(document, ".site-header", HTMLElement);
const searchPanelRoot = queryElement(
	document,
	"[data-search-panel]",
	HTMLElement,
);
const helpPanelRoot = queryElement(document, "[data-kbd-panel]", HTMLElement);

// If no shell elements exist, this is a minimal or embedded page; exit gracefully.
const hasShell = headerRoot || searchPanelRoot || helpPanelRoot;
if (!hasShell) {
	console.debug?.(
		"UI orchestrator skipped: shell elements not present on current page",
	);
}

const recordExportEvent = createBufferedTracker(
	storage,
	`${analyticsKeyPrefix}.export.analytics`,
	"book-export",
);

// Collect promises for search + QA controllers so keyboard shortcuts can initialize after both.
const controllerPromises: Promise<unknown>[] = [];

// --- Search island ---
const searchToggle = queryElement(
	document,
	"[data-search-toggle]",
	HTMLButtonElement,
);
const mobileCtaRoot = queryElement(document, "[data-mobile-cta]", HTMLElement);
const mobileSearchToggle = mobileCtaRoot
	? queryElement(mobileCtaRoot, "[data-mobile-search]", HTMLButtonElement)
	: null;

let searchController: ReturnType<
	typeof import("./search-controller").initializeSearchController
> | null = null;

/**
 * Buttons that open search from the page (the 404 page has one), with the
 * query in `data-search-query`, or with the words of the address when they
 * carry `data-search-from-path`.
 */
const wireSearchButtons = (controller: {
	open: (query?: string) => Promise<void>;
}) => {
	for (const button of queryAllElements(
		document,
		"[data-search-open]",
		HTMLButtonElement,
	)) {
		const query =
			button.dataset.searchQuery ??
			("searchFromPath" in button.dataset
				? searchQueryFromPath(window.location.pathname)
				: "");
		if (query && "searchFromPath" in button.dataset) {
			button.textContent = `Search for “${query}”`;
		}
		button.addEventListener("click", () => {
			void controller.open(query);
		});
	}
};

const recordSearchEvent = createBufferedTracker(
	storage,
	`${analyticsKeyPrefix}.search.analytics`,
	"book-search",
);

if (searchPanelRoot && (searchToggle || mobileSearchToggle)) {
	const searchPromise = import("./search-controller").then(
		({ initializeSearchController }) => {
			const controller = initializeSearchController({
				root: searchPanelRoot,
				toggleButton: searchToggle,
				mobileToggleButton: mobileSearchToggle,
				indexStore: getSharedIndexStore(),
				recordEvent: recordSearchEvent,
			});
			searchController = controller;
			wireSearchButtons(controller);
			return controller;
		},
	);
	controllerPromises.push(searchPromise);
}

// --- QA island ---
const qaPanelRoot = qaEnabled
	? queryElement(document, "[data-qa-panel]", HTMLElement)
	: null;
const qaToggle = qaEnabled
	? queryElement(document, "[data-qa-toggle]", HTMLButtonElement)
	: null;

let qaController: ReturnType<
	typeof import("./qa-controller").initializeQaController
> | null = null;

if (hasServerRuntime && qaPanelRoot && qaToggle) {
	const recordQaEvent = createBufferedTracker(
		storage,
		`${analyticsKeyPrefix}.qa.analytics`,
		"book-qa",
	);

	const qaPromise = import("./qa-controller").then(
		({ initializeQaController }) => {
			qaController = initializeQaController({
				root: qaPanelRoot,
				toggleButton: qaToggle,
				indexStore: getSharedIndexStore(),
				recordEvent: recordQaEvent,
				storage,
				disabledKey: `${analyticsKeyPrefix}.qa.disabled`,
				displayModeKey: `${analyticsKeyPrefix}.qa.display.mode`,
				apiEndpoint: qaEndpoint,
				memoryKey: `${analyticsKeyPrefix}.qa.memory`,
				signalsKey: `${analyticsKeyPrefix}.qa.signals`,
			});
			return qaController;
		},
	);
	controllerPromises.push(qaPromise);
}

// --- Keyboard shortcuts island — waits for search/QA to be ready ---
const helpToggle = queryElement(
	document,
	"[data-kbd-toggle]",
	HTMLButtonElement,
);
const mainRoot = queryElement(document, "#main-content", HTMLElement);
initializeHeadingAnchors(mainRoot ?? document);

if (helpPanelRoot) {
	Promise.all(controllerPromises).then(() => {
		import("./keyboard-shortcuts").then(({ initializeKeyboardShortcuts }) => {
			initializeKeyboardShortcuts({
				root: helpPanelRoot,
				toggleButton: helpToggle,
				mainRoot,
				search: searchController,
				qa: qaController,
			});
		});
	});
}

// --- Reader prefs island (only on pages that carry density/font controls) ---
const hasReaderControls =
	headerRoot &&
	(queryElement(headerRoot, "[data-reader-density]", HTMLButtonElement) ||
		queryElement(headerRoot, "[data-reader-font]", HTMLButtonElement) ||
		queryElement(headerRoot, "[data-reader-theme]", HTMLButtonElement));

if (headerRoot && hasReaderControls) {
	import("./reader-prefs").then(({ initializeReaderPrefs }) => {
		initializeReaderPrefs({
			root: headerRoot,
			storage,
			storageKey: `${analyticsKeyPrefix}.reader.prefs`,
		});
	});
}

// --- Resume reading: a chapter page records itself; home and the hub offer it ---
// Loaded with the page, not as an island, so the link shows without a
// second request moving the page under the reader.
initializeResumeReading({
	root: document,
	storage,
	storageKey: `${analyticsKeyPrefix}.reader.lastChapter`,
});

// --- Mobile nav island ---
if (headerRoot && mobileCtaRoot) {
	import("./mobile-nav").then(({ initializeMobileNav }) => {
		initializeMobileNav({ headerRoot, mobileCtaRoot });
	});
}

// --- Export tracking island (only when endpoint is present) ---
const exportAnalyticsEndpoint = document.body?.dataset?.exportAnalyticsEndpoint;
if (exportAnalyticsEndpoint) {
	import("./export-tracking").then(({ initializeExportTracking }) => {
		initializeExportTracking({
			endpoint: exportAnalyticsEndpoint,
			recordEvent: recordExportEvent,
		});
	});
}
