/**
 * UI orchestrator — checks DOM selectors and dynamically imports only the feature
 * islands needed for the current page. Shared dependencies (index store, analytics
 * buffers) are initialized once and passed to islands that request them.
 */
import { createBufferedTracker } from "./analytics-buffer";
import { queryElement } from "./dom";
import { getSharedIndexStore } from "./shared-index";

const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
const qaEnabled = document.body?.dataset?.qaEnabled === "true";
const qaEndpoint = document.body?.dataset?.qaEndpoint;
const storage = window.localStorage;

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

const recordSearchEvent = createBufferedTracker(
	storage,
	`${analyticsKeyPrefix}.search.analytics`,
	"book-search",
);

if (searchPanelRoot && (searchToggle || mobileSearchToggle)) {
	const searchPromise = import("./search-controller").then(
		({ initializeSearchController }) => {
			searchController = initializeSearchController({
				root: searchPanelRoot,
				toggleButton: searchToggle,
				mobileToggleButton: mobileSearchToggle,
				indexStore: getSharedIndexStore(),
				recordEvent: recordSearchEvent,
			});
			return searchController;
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

if (qaPanelRoot && qaToggle) {
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

if (helpPanelRoot) {
	Promise.all(controllerPromises).then(() => {
		import("./keyboard-shortcuts").then(({ initializeKeyboardShortcuts }) => {
			initializeKeyboardShortcuts({
				root: helpPanelRoot,
				toggleButton: helpToggle,
				mainRoot,
				search: searchController!,
				qa: qaController,
			});
		});
	});
}

// --- Reader prefs island (only on pages that carry density/font controls) ---
const hasReaderControls =
	headerRoot &&
	(queryElement(headerRoot, "[data-reader-density]", HTMLButtonElement) ||
		queryElement(headerRoot, "[data-reader-font]", HTMLButtonElement));

if (headerRoot && hasReaderControls) {
	import("./reader-prefs").then(({ initializeReaderPrefs }) => {
		initializeReaderPrefs({
			root: headerRoot,
			storage,
			storageKey: `${analyticsKeyPrefix}.reader.prefs`,
		});
	});
}

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
