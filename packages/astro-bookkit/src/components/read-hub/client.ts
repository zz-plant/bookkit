const safeGet = (key: string): string | null => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};

const safeSet = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// no-op: private mode or disabled storage
	}
};

const toggleUpdateFilter = (): void => {
	const filterButton = document.querySelector("[data-read-updates-filter]");
	const readCards = Array.from(document.querySelectorAll("[data-section-key]"));
	const analyticsKey = document.body?.dataset?.analyticsKey || "book";
	const visitStorageKey = `${analyticsKey}:read:lastVisit`;
	const previousVisit = safeGet(visitStorageKey);
	const previousVisitMs = previousVisit
		? new Date(previousVisit).getTime()
		: Number.NaN;
	const nowIso = new Date().toISOString();

	if (
		Number.isFinite(previousVisitMs) &&
		filterButton instanceof HTMLButtonElement &&
		readCards.length > 0
	) {
		filterButton.hidden = false;

		const defaultLabel =
			filterButton.dataset.filterDefaultLabel ||
			filterButton.textContent ||
			"Show updates";
		const activeLabel =
			filterButton.dataset.filterActiveLabel || "Show all sections";
		let isFiltered = false;
		filterButton.addEventListener("click", () => {
			isFiltered = !isFiltered;
			readCards.forEach((card) => {
				const dateValue = card.getAttribute("data-change-date");
				const changeMs = dateValue ? new Date(dateValue).getTime() : Number.NaN;
				const isNew = Number.isFinite(changeMs) && changeMs > previousVisitMs;
				card.toggleAttribute("hidden", isFiltered ? !isNew : false);
			});
			filterButton.textContent = isFiltered ? activeLabel : defaultLabel;
		});
	}

	safeSet(visitStorageKey, nowIso);
};

const setupBucketTabs = (): void => {
	const bucketTabs = Array.from(document.querySelectorAll("[data-bucket-tab]"));
	const bucketPanels = Array.from(
		document.querySelectorAll("[data-bucket-panel]"),
	);
	if (bucketTabs.length === 0 || bucketPanels.length === 0) {
		return;
	}

	const tabs = bucketTabs.filter(
		(entry): entry is HTMLButtonElement => entry instanceof HTMLButtonElement,
	);
	const panels = bucketPanels.filter(
		(entry): entry is HTMLElement => entry instanceof HTMLElement,
	);

	const setActiveBucket = (key: string) => {
		tabs.forEach((tab) => {
			const active = tab.dataset.bucketTab === key;
			tab.setAttribute("aria-selected", active ? "true" : "false");
			tab.tabIndex = active ? 0 : -1;
		});
		panels.forEach((panel) => {
			panel.hidden = panel.dataset.bucketPanel !== key;
		});
	};

	const syncBucketFromHash = () => {
		const key = window.location.hash.replace(/^#/, "").toLowerCase();
		if (!key) {
			return;
		}
		const hasMatchingPanel = panels.some(
			(panel) => panel.dataset.bucketPanel === key,
		);
		if (hasMatchingPanel) {
			setActiveBucket(key);
		}
	};

	syncBucketFromHash();
	window.addEventListener("hashchange", syncBucketFromHash);

	tabs.forEach((tab) => {
		tab.addEventListener("click", () => {
			const key = tab.dataset.bucketTab;
			if (key) {
				setActiveBucket(key);
			}
		});
		tab.addEventListener("keydown", (event) => {
			if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
				return;
			}
			event.preventDefault();
			const currentIndex = tabs.indexOf(tab);
			const nextIndex =
				event.key === "ArrowRight"
					? (currentIndex + 1) % tabs.length
					: (currentIndex - 1 + tabs.length) % tabs.length;
			const nextTab = tabs[nextIndex];
			nextTab.focus();
			const key = nextTab.dataset.bucketTab;
			if (key) {
				setActiveBucket(key);
			}
		});
	});
};

const setupAccordion = (): void => {
	const accordionToggle = document.querySelector("[data-accordion-toggle]");
	const accordionPanel = document.querySelector("[data-accordion-panel]");
	if (
		!(accordionToggle instanceof HTMLButtonElement) ||
		!(accordionPanel instanceof HTMLElement)
	) {
		return;
	}

	accordionToggle.addEventListener("click", () => {
		const expanded = accordionToggle.getAttribute("aria-expanded") === "true";
		accordionToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
		accordionPanel.hidden = expanded;
	});
};

const markReadHubStarted = (): void => {
	const analyticsKey = document.body?.dataset?.analyticsKey || "book";
	safeSet(`${analyticsKey}.reader.started`, "true");
};

const setupReleaseCard = (): void => {
	const analyticsKey = document.body?.dataset?.analyticsKey || "book";
	const onboardingKey = `${analyticsKey}.reader.started`;
	const releaseCard = document.querySelector("[data-release-card='true']");
	if (
		!(releaseCard instanceof HTMLElement) ||
		safeGet(onboardingKey) === "true"
	) {
		return;
	}

	releaseCard.classList.add("read-tools-card--deemphasized");
	const noteText = releaseCard.dataset.releaseSecondaryNote;
	if (!noteText || releaseCard.querySelector("[data-release-note='true']")) {
		return;
	}

	const note = document.createElement("p");
	note.className = "meta";
	note.dataset.releaseNote = "true";
	note.textContent = noteText;
	releaseCard.appendChild(note);
};

const setupAnalyticsFunnel = (): void => {
	const funnelLinks = document.querySelectorAll("[data-funnel-step]");
	funnelLinks.forEach((link) => {
		link.addEventListener("click", () => {
			const step = link.getAttribute("data-funnel-step");
			if (!step) {
				return;
			}
			markReadHubStarted();
			const payload = JSON.stringify({
				type: "engagement",
				title: `funnel:${step}`,
				path: window.location.pathname,
				durationSeconds: 0,
				scrollDepth: 0,
				timestamp: Date.now(),
			});
			if (navigator.sendBeacon) {
				navigator.sendBeacon(
					"/api/analytics.json",
					new Blob([payload], { type: "application/json" }),
				);
				return;
			}
			fetch("/api/analytics.json", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: payload,
				keepalive: true,
			}).catch(() => undefined);
		});
	});
};

toggleUpdateFilter();
setupBucketTabs();
setupAccordion();
setupReleaseCard();
setupAnalyticsFunnel();
