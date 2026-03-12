      const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
      const qaEnabled = document.body?.dataset?.qaEnabled === "true";
      const helpPanel = document.querySelector("[data-kbd-panel]");
      const helpToggle = document.querySelector("[data-kbd-toggle]");
      const helpClose = document.querySelector("[data-kbd-close]");
      const searchPanel = document.querySelector("[data-search-panel]");
      const searchToggle = document.querySelector("[data-search-toggle]");
      const searchClose = document.querySelector("[data-search-close]");
      const searchInput = document.querySelector("[data-search-input]");
      const searchResults = document.querySelector("[data-search-results]");
      const searchQuickActions = document.querySelector("[data-search-quick-actions]");
      const searchStatus = document.querySelector("[data-search-status]");
      const searchEmpty = document.querySelector("[data-search-empty]");
      const qaPanel = qaEnabled ? document.querySelector("[data-qa-panel]") : null;
      const qaToggle = qaEnabled ? document.querySelector("[data-qa-toggle]") : null;
      const qaClose = qaEnabled ? document.querySelector("[data-qa-close]") : null;
      const qaForm = qaEnabled ? document.querySelector("[data-qa-form]") : null;
      const qaInput = qaEnabled ? document.querySelector("[data-qa-input]") : null;
      const qaAnswer = qaEnabled ? document.querySelector("[data-qa-answer]") : null;
      const qaCitations = qaEnabled ? document.querySelector("[data-qa-citations]") : null;
      const qaStatus = qaEnabled ? document.querySelector("[data-qa-status]") : null;
      const qaBody = qaEnabled ? document.querySelector("[data-qa-body]") : null;
      const qaDisabledPanel = qaEnabled ? document.querySelector("[data-qa-disabled]") : null;
      const qaDisableButton = qaEnabled ? document.querySelector("[data-qa-disable]") : null;
      const qaEnableButton = qaEnabled ? document.querySelector("[data-qa-enable]") : null;
      const qaSuggestions = qaEnabled ? Array.from(document.querySelectorAll("[data-qa-suggestion]")) : [];
      const qaDisplayToggle = qaEnabled ? document.querySelector("[data-qa-display-toggle]") : null;
      const siteNavMore = document.querySelector("[data-site-nav-more]");
      const siteNavMoreToggle = document.querySelector("[data-site-nav-more-toggle]");
      const siteNavMoreOverflow = document.querySelector("[data-site-nav-overflow]");
      const siteSettings = document.querySelector("[data-site-settings]");
      const mobileSearchToggle = document.querySelector("[data-mobile-search]");
      const mobileMenuToggle = document.querySelector("[data-mobile-menu]");
      const mobileCta = document.querySelector("[data-mobile-cta]");
      const readerDensityButtons = Array.from(document.querySelectorAll("[data-reader-density]"));
      const readerFontButtons = Array.from(document.querySelectorAll("[data-reader-font]"));
      const readerDensitySelect = document.querySelector("[data-reader-density-select]");
      const readerFontSelect = document.querySelector("[data-reader-font-select]");
      const desktopNavMedia = window.matchMedia("(min-width: 721px)");
      const readerPrefsKey = `${analyticsKeyPrefix}.reader.prefs`;
      let lastFocused = null;
      let pendingSequence = null;
      let sequenceTimeout = null;
      let activeHeadingIndex = 0;
      let searchIndex = null;
      let searchQuery = "";
      let searchActiveIndex = -1;
      let searchTimeout = null;
      let qaQuery = "";
      let lastScrollY = window.scrollY;
      let searchRunId = 0;
      let qaRunId = 0;
      const searchAnalyticsKey = `${analyticsKeyPrefix}.search.analytics`;
      const exportAnalyticsKey = `${analyticsKeyPrefix}.export.analytics`;
      const qaAnalyticsKey = `${analyticsKeyPrefix}.qa.analytics`;
      const qaDisabledKey = `${analyticsKeyPrefix}.qa.disabled`;
      const qaDisplayModeKey = `${analyticsKeyPrefix}.qa.display.mode`;
      const getStoredValue = (key) => {
        try {
          return localStorage.getItem(key);
        } catch (error) {
          return null;
        }
      };

      const setStoredValue = (key, value) => {
        try {
          localStorage.setItem(key, value);
        } catch (error) {
          // Ignore storage write failures so UI initialization keeps running.
        }
      };

      let qaDisplayMode =
        getStoredValue(qaDisplayModeKey) === "citations-first" ? "citations-first" : "answer-first";
      const exportAnalyticsEndpoint = document.body?.dataset?.exportAnalyticsEndpoint;
      const previewAnalyticsEndpoint = document.body?.dataset?.previewAnalyticsEndpoint;

      const headingSelector = "main h2, main h3";
      const headings = Array.from(document.querySelectorAll(headingSelector));
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const setHeadingHighlight = (target) => {
        if (!target) return;
        target.classList.add("viewport-highlight");
        window.setTimeout(() => target.classList.remove("viewport-highlight"), 1200);
      };

      const goToHeading = (index) => {
        if (!headings.length) return;
        const clamped = Math.max(0, Math.min(index, headings.length - 1));
        activeHeadingIndex = clamped;
        const target = headings[clamped];
        target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
        target.focus?.({ preventScroll: true });
        setHeadingHighlight(target);
      };

      const updateActiveHeading = () => {
        const visible = headings.findIndex((heading) => {
          const rect = heading.getBoundingClientRect();
          return rect.top >= 0 && rect.top <= window.innerHeight * 0.35;
        });
        if (visible >= 0) {
          activeHeadingIndex = visible;
        }
      };

      const setSiteNavMenuOpen = (open) => {
        if (!(siteNavMore instanceof HTMLElement)) return;
        siteNavMore.classList.toggle("is-open", open);
        if (siteNavMoreToggle instanceof HTMLButtonElement) {
          siteNavMoreToggle.setAttribute("aria-expanded", open ? "true" : "false");
        }
        if (siteNavMoreOverflow instanceof HTMLElement) {
          siteNavMoreOverflow.hidden = !open;
        }
      };

      const isSiteNavMenuOpen = () =>
        siteNavMore instanceof HTMLElement && siteNavMore.classList.contains("is-open");

      const syncSiteNavOverflow = (matchesDesktop) => {
        if (!siteNavMore) return;
        if (matchesDesktop) {
          mobileMenuToggle?.setAttribute("aria-expanded", "false");
          return;
        }
        setSiteNavMenuOpen(false);
        siteSettings?.removeAttribute("open");
        mobileMenuToggle?.setAttribute("aria-expanded", "false");
      };

      const openHelp = () => {
        if (!helpPanel) return;
        lastFocused = document.activeElement;
        helpPanel.hidden = false;
        helpPanel.classList.add("is-open");
        helpToggle?.setAttribute("aria-expanded", "true");
        helpClose?.focus({ preventScroll: true });
      };

      const closeHelp = () => {
        if (!helpPanel) return;
        helpPanel.hidden = true;
        helpPanel.classList.remove("is-open");
        helpToggle?.setAttribute("aria-expanded", "false");
        lastFocused?.focus?.();
      };

      const toggleHelp = () => {
        if (!helpPanel) return;
        if (helpPanel.hidden) {
          openHelp();
        } else {
          closeHelp();
        }
      };

      const resetSequence = () => {
        pendingSequence = null;
        if (sequenceTimeout) {
          window.clearTimeout(sequenceTimeout);
          sequenceTimeout = null;
        }
      };

      const setSequence = () => {
        pendingSequence = "g";
        if (sequenceTimeout) {
          window.clearTimeout(sequenceTimeout);
        }
        sequenceTimeout = window.setTimeout(resetSequence, 1200);
      };

      const navigateTo = (path) => {
        if (!path) return;
        window.location.href = path;
      };

      const inEditable = (target) => {
        return (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        );
      };

      const updateReaderButtonState = (buttons, selectedValue) => {
        buttons.forEach((button) => {
          const isActive =
            button instanceof HTMLElement &&
            (button.dataset.readerDensity === selectedValue || button.dataset.readerFont === selectedValue);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
          button.classList.toggle("is-active", isActive);
        });
      };

      const loadReaderPreferences = () => {
        try {
          const stored = localStorage.getItem(readerPrefsKey);
          const parsed = stored ? JSON.parse(stored) : null;
          return {
            density: parsed?.density,
            font: parsed?.font,
          };
        } catch (error) {
          return { density: null, font: null };
        }
      };

      const saveReaderPreferences = (prefs) => {
        try {
          localStorage.setItem(readerPrefsKey, JSON.stringify(prefs));
        } catch (error) {
          // Ignore storage write failures so reader setup continues.
        }
      };

      const setReaderDensity = (density) => {
        if (!["compact", "comfortable", "relaxed"].includes(density)) return;
        document.body.dataset.readerDensity = density;
        const prefs = loadReaderPreferences();
        saveReaderPreferences({ ...prefs, density });
        updateReaderButtonState(readerDensityButtons, density);
        if (readerDensitySelect instanceof HTMLSelectElement) readerDensitySelect.value = density;
      };

      const setReaderFont = (font) => {
        if (!["serif", "sans"].includes(font)) return;
        document.body.dataset.readerFont = font;
        const prefs = loadReaderPreferences();
        saveReaderPreferences({ ...prefs, font });
        updateReaderButtonState(readerFontButtons, font);
        if (readerFontSelect instanceof HTMLSelectElement) readerFontSelect.value = font;
      };

      const initializeReaderPreferences = () => {
        const prefs = loadReaderPreferences();
        const density =
          prefs.density ??
          (window.matchMedia("(max-width: 720px)").matches ? "compact" : "comfortable");
        const font = prefs.font ?? "serif";
        setReaderDensity(density);
        setReaderFont(font);
      };

      const toSafeUrl = (value) => {
        if (typeof value !== "string") return "#";
        try {
          const parsed = new URL(value, window.location.origin);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href;
          }
        } catch (error) {
          // Ignore invalid URLs.
        }
        return "#";
      };
      const appendHighlightedText = (element, value, tokens) => {
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
          if (escapedTokens.some((token) => new RegExp(`^${token}$`, "i").test(fragment))) {
            const mark = document.createElement("mark");
            mark.textContent = fragment;
            element.appendChild(mark);
            return;
          }
          element.appendChild(document.createTextNode(fragment));
        });
      };

      const sendExportAnalytics = (payload) => {
        if (!exportAnalyticsEndpoint) return;
        const body = JSON.stringify(payload);
        if ("sendBeacon" in navigator) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(exportAnalyticsEndpoint, blob);
          return;
        }
        fetch(exportAnalyticsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      };

      const sendPreviewAnalytics = (payload) => {
        if (!previewAnalyticsEndpoint) return;
        const body = JSON.stringify(payload);
        if ("sendBeacon" in navigator) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(previewAnalyticsEndpoint, blob);
          return;
        }
        fetch(previewAnalyticsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      };

      const buildRankedResults = (index, query) => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
          return { tokens: [], results: [] };
        }
        const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
        const results = index
          .map((entry) => ({
            ...entry,
            searchText: `${entry.title} ${entry.snippet} ${entry.context}`.toLowerCase(),
          }))
          .filter((entry) => tokens.every((token) => entry.searchText.includes(token)))
          .map((entry) => {
            const score = tokens.reduce((total, token) => {
              const titleBoost = entry.title.toLowerCase().includes(token) ? 4 : 0;
              const contextBoost = entry.context.toLowerCase().includes(token) ? 2 : 0;
              return total + titleBoost + contextBoost + 1;
            }, 0);
            return { ...entry, score };
          })
          .sort((a, b) => b.score - a.score);
        return { tokens, results };
      };

      const createBufferedTracker = (storageKey, eventName) => {
        let queue = [];
        let flushTimer = null;
        const flush = () => {
          flushTimer = null;
          if (!queue.length) return;
          const pending = queue;
          queue = [];
          try {
            const existing = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
            const merged = Array.isArray(existing) ? existing.concat(pending) : pending;
            localStorage.setItem(storageKey, JSON.stringify(merged.slice(-120)));
          } catch (error) {
            // Ignore storage failures so tracking cannot break core UX.
          }
          pending.forEach((event) => window.dispatchEvent(new CustomEvent(eventName, { detail: event })));
        };

        const record = (payload) => {
          queue.push({ ...payload, ts: Date.now() });
          if (flushTimer) return;
          flushTimer = window.setTimeout(flush, 200);
        };

        window.addEventListener("beforeunload", flush);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") {
            flush();
          }
        });

        return record;
      };

      const recordSearchEvent = createBufferedTracker(searchAnalyticsKey, "book-search");
      const recordExportEvent = createBufferedTracker(exportAnalyticsKey, "book-export");
      const recordQaEvent = createBufferedTracker(qaAnalyticsKey, "book-qa");

      const updateSearchStatus = (message) => {
        if (searchStatus) searchStatus.textContent = message;
      };

      const loadSearchIndex = async () => {
        if (searchIndex) return searchIndex;
        updateSearchStatus("Loading index…");
        try {
          const response = await fetch("/search-index.json");
          const payload = await response.json();
          searchIndex = payload.entries ?? [];
          updateSearchStatus("Type a word or phrase to find relevant sections.");
        } catch (error) {
          updateSearchStatus("Search is unavailable right now.");
          searchIndex = [];
        }
        return searchIndex;
      };

      const isQaDisabled = () => localStorage.getItem(qaDisabledKey) === "true";

      const setQaDisabled = (value) => {
        localStorage.setItem(qaDisabledKey, value ? "true" : "false");
      };

      const updateQaState = () => {
        if (!qaEnabled || !qaPanel) return;
        const disabled = isQaDisabled();
        qaPanel.classList.toggle("is-disabled", disabled);
        qaBody?.toggleAttribute("hidden", disabled);
        qaDisabledPanel?.toggleAttribute("hidden", !disabled);
        qaDisableButton?.toggleAttribute("disabled", disabled);
      };

      const updateQaStatus = (message) => {
        if (qaStatus) qaStatus.textContent = message;
      };

      const renderQaAnswer = (results, tokens) => {
        if (!qaAnswer || !qaCitations) return;
        qaAnswer.replaceChildren();
        qaCitations.replaceChildren();
        if (!results.length) {
          const empty = document.createElement("p");
          empty.textContent = "No answer found. Try rephrasing or using fewer words.";
          qaAnswer.appendChild(empty);
          return;
        }

        const answerText = results[0]?.snippet ?? "No answer found.";
        const answerParagraph = document.createElement("p");
        answerParagraph.textContent = answerText;
        const metaParagraph = document.createElement("p");
        metaParagraph.className = "meta";
        metaParagraph.textContent = `Answer assembled from ${results.length} cited passage${results.length === 1 ? "" : "s"}.`;
        qaAnswer.append(answerParagraph, metaParagraph);

        const heading = document.createElement("h3");
        heading.textContent = "Sources";
        const list = document.createElement("ol");
        list.className = "qa-panel__citation-list";
        results.forEach((entry) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = toSafeUrl(entry.url);
          link.dataset.qaCitationId = entry.id;
          link.textContent = `${entry.context} — ${entry.title}`;

          const snippet = document.createElement("p");
          appendHighlightedText(snippet, entry.snippet, tokens);

          item.append(link, snippet);
          list.appendChild(item);
        });
        qaCitations.append(heading, list);
      };

      const updateQaDisplayMode = () => {
        if (!qaDisplayToggle || !qaPanel) return;
        const isCitationsFirst = qaDisplayMode === "citations-first";
        qaPanel.dataset.qaDisplayMode = qaDisplayMode;
        qaDisplayToggle.textContent = isCitationsFirst ? "Show answer first" : "Show citations first";
        setStoredValue(qaDisplayModeKey, qaDisplayMode);
      };

      const runQa = async (value) => {
        if (!qaEnabled) return;
        if (isQaDisabled()) {
          updateQaStatus("AI Q&A is disabled.");
          return;
        }
        const runId = ++qaRunId;
        const index = await loadSearchIndex();
        if (runId !== qaRunId) return;
        qaQuery = value;
        const query = value.trim().toLowerCase();
        if (!query) {
          updateQaStatus("Ask a question to see answers.");
          if (qaAnswer) {
            const idle = document.createElement("p");
            idle.className = "meta";
            idle.textContent = "No answer yet.";
            qaAnswer.replaceChildren(idle);
          }
          qaCitations?.replaceChildren();
          return;
        }
        const { tokens, results } = buildRankedResults(index, query);
        const topResults = results.slice(0, 3);

        renderQaAnswer(topResults, tokens);
        updateQaStatus(
          topResults.length
            ? `${topResults.length} cited passage${topResults.length === 1 ? "" : "s"} returned.`
            : "No citations found."
        );
        recordQaEvent({ type: "question", query, matches: topResults.length });
      };

      const openSearch = async () => {
        if (!searchPanel) return;
        lastFocused = document.activeElement;
        searchPanel.hidden = false;
        searchPanel.classList.add("is-open");
        searchToggle?.setAttribute("aria-expanded", "true");
        mobileSearchToggle?.setAttribute("aria-expanded", "true");
        await loadSearchIndex();
        window.requestAnimationFrame(() => {
          if (searchInput) {
            searchInput.value = searchQuery;
            searchInput.focus({ preventScroll: true });
            searchInput.select?.();
            if (searchQuery) {
              runSearch(searchQuery);
            }
          }
        });
      };


      const syncMobileToggleState = () => {
        const menuOpen = isSiteNavMenuOpen();
        mobileMenuToggle?.setAttribute("aria-expanded", menuOpen ? "true" : "false");
        if (mobileMenuToggle) {
          mobileMenuToggle.textContent = menuOpen ? "Close menu" : "Menu";
        }
      };

      const updateMobileCtaVisibility = () => {
        if (!(mobileCta instanceof HTMLElement)) return;
        const setMobileCtaHidden = (hidden) => {
          mobileCta.classList.toggle("mobile-cta--hidden", hidden);
          mobileCta.setAttribute("aria-hidden", hidden ? "true" : "false");
          if ("inert" in mobileCta) {
            mobileCta.inert = hidden;
          } else {
            const focusables = mobileCta.querySelectorAll("a, button, input, select, textarea, [tabindex]");
            focusables.forEach((focusable) => {
              if (!(focusable instanceof HTMLElement)) return;
              if (hidden) {
                if (focusable.dataset.mobileCtaPrevTabindex === undefined) {
                  focusable.dataset.mobileCtaPrevTabindex = focusable.getAttribute("tabindex") ?? "";
                }
                focusable.setAttribute("tabindex", "-1");
              } else if (focusable.dataset.mobileCtaPrevTabindex !== undefined) {
                const previousTabindex = focusable.dataset.mobileCtaPrevTabindex;
                if (previousTabindex) {
                  focusable.setAttribute("tabindex", previousTabindex);
                } else {
                  focusable.removeAttribute("tabindex");
                }
                delete focusable.dataset.mobileCtaPrevTabindex;
              }
            });
          }

          if (hidden && document.activeElement instanceof HTMLElement && mobileCta.contains(document.activeElement)) {
            const mainContent = document.getElementById("main-content");
            (mainContent instanceof HTMLElement ? mainContent : document.body)?.focus?.({ preventScroll: true });
          }
        };

        if (!window.matchMedia("(max-width: 720px)").matches) {
          setMobileCtaHidden(false);
          lastScrollY = window.scrollY;
          return;
        }
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;
        const nearTop = currentY < 80;
        const scrollingDown = delta > 6;
        const scrollingUp = delta < -6;
        if (nearTop || scrollingUp) {
          setMobileCtaHidden(false);
        } else if (scrollingDown) {
          setMobileCtaHidden(true);
        }
        lastScrollY = currentY;
      };

      const closeSearch = () => {
        if (!searchPanel) return;
        searchPanel.hidden = true;
        searchPanel.classList.remove("is-open");
        searchActiveIndex = -1;
        searchToggle?.setAttribute("aria-expanded", "false");
        mobileSearchToggle?.setAttribute("aria-expanded", "false");
        lastFocused?.focus?.();
      };

      const toggleSearch = () => {
        if (!searchPanel) return;
        if (searchPanel.hidden) {
          openSearch();
        } else {
          closeSearch();
        }
      };

      const openQa = async () => {
        if (!qaEnabled || !qaPanel) return;
        lastFocused = document.activeElement;
        qaPanel.hidden = false;
        qaPanel.classList.add("is-open");
        qaToggle?.setAttribute("aria-expanded", "true");
        updateQaState();
        await loadSearchIndex();
        window.requestAnimationFrame(() => {
          if (qaInput && !isQaDisabled()) {
            qaInput.value = qaQuery;
            qaInput.focus({ preventScroll: true });
            qaInput.select?.();
          }
        });
      };

      const closeQa = () => {
        if (!qaPanel) return;
        qaPanel.hidden = true;
        qaPanel.classList.remove("is-open");
        qaToggle?.setAttribute("aria-expanded", "false");
        lastFocused?.focus?.();
      };

      const toggleQa = () => {
        if (!qaPanel) return;
        if (qaPanel.hidden) {
          openQa();
        } else {
          closeQa();
        }
      };

      const renderSearchResults = (results, tokens) => {
        if (!searchResults) return;
        searchResults.replaceChildren();
        if (!results.length) {
          searchEmpty?.removeAttribute("hidden");
          searchActiveIndex = -1;
          return;
        }
        searchEmpty?.setAttribute("hidden", "true");
        const grouped = results.reduce((groupMap, entry) => {
          const key = entry.label ?? entry.type;
          groupMap.set(key, [...(groupMap.get(key) ?? []), entry]);
          return groupMap;
        }, new Map());

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
          searchResults.appendChild(section);
        });

        const links = Array.from(searchResults.querySelectorAll("a.search-panel__item"));
        searchActiveIndex = links.length ? 0 : -1;
        links.forEach((link, index) => {
          link.setAttribute("aria-selected", index === searchActiveIndex ? "true" : "false");
        });
      };

      const moveActiveSearchResult = (delta) => {
        if (!searchResults) return;
        const links = Array.from(searchResults.querySelectorAll("a.search-panel__item"));
        if (!links.length) return;
        searchActiveIndex = (searchActiveIndex + delta + links.length) % links.length;
        links.forEach((link, index) => {
          link.setAttribute("aria-selected", index === searchActiveIndex ? "true" : "false");
          if (index === searchActiveIndex) {
            link.scrollIntoView({ block: "nearest" });
          }
        });
      };

      const runSearch = async (value) => {
        const runId = ++searchRunId;
        const index = await loadSearchIndex();
        if (runId !== searchRunId) return;
        searchQuery = value;
        const query = value.trim().toLowerCase();
        if (!query) {
          searchResults?.replaceChildren();
          searchEmpty?.setAttribute("hidden", "true");
          searchQuickActions?.removeAttribute("hidden");
          updateSearchStatus("Type a word or phrase to find relevant sections.");
          return;
        }
        searchQuickActions?.setAttribute("hidden", "true");
        const { tokens, results } = buildRankedResults(index, query);

        renderSearchResults(results, tokens);
        updateSearchStatus(`${results.length} result${results.length === 1 ? "" : "s"}`);

        if (query.length >= 2) {
          recordSearchEvent({ type: "query", query, results: results.length });
          if (!results.length) {
            recordSearchEvent({ type: "zero_results", query });
          }
        }
      };

      helpToggle?.addEventListener("click", toggleHelp);
      helpClose?.addEventListener("click", closeHelp);
      helpPanel?.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && !event.target.closest("[data-kbd-content]")) {
          closeHelp();
        }
      });
      searchToggle?.addEventListener("click", toggleSearch);
      mobileSearchToggle?.addEventListener("click", () => {
        toggleSearch();
        const expanded = searchPanel && !searchPanel.hidden;
        mobileSearchToggle?.setAttribute("aria-expanded", expanded ? "true" : "false");
      });
      searchClose?.addEventListener("click", closeSearch);
      searchPanel?.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && !event.target.closest("[data-search-content]")) {
          closeSearch();
        }
      });
      searchInput?.addEventListener("input", (event) => {
        const value = event.target instanceof HTMLInputElement ? event.target.value : "";
        if (searchTimeout) window.clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => runSearch(value), 160);
      });
      searchInput?.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActiveSearchResult(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActiveSearchResult(-1);
          return;
        }
        if (event.key === "Enter") {
          const links = searchResults ? Array.from(searchResults.querySelectorAll("a.search-panel__item")) : [];
          const active = links[searchActiveIndex] as HTMLAnchorElement | undefined;
          if (active) {
            event.preventDefault();
            active.click();
          }
        }
      });
      searchResults?.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
        if (!target) return;
        recordSearchEvent({ type: "click", id: target.dataset.searchId, query: searchQuery });
        closeSearch();
      });
      qaToggle?.addEventListener("click", toggleQa);
      qaClose?.addEventListener("click", closeQa);
      qaPanel?.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && !event.target.closest("[data-qa-content]")) {
          closeQa();
        }
      });
      qaForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = qaInput instanceof HTMLTextAreaElement ? qaInput.value : "";
        runQa(value);
      });
      qaInput?.addEventListener("input", (event) => {
        qaQuery = event.target instanceof HTMLTextAreaElement ? event.target.value : "";
      });
      qaDisableButton?.addEventListener("click", () => {
        setQaDisabled(true);
        updateQaState();
        recordQaEvent({ type: "opt_out", enabled: false });
      });
      qaEnableButton?.addEventListener("click", () => {
        setQaDisabled(false);
        updateQaState();
        recordQaEvent({ type: "opt_in", enabled: true });
        if (qaInput && qaInput instanceof HTMLTextAreaElement) {
          qaInput.focus({ preventScroll: true });
        }
      });
      qaSuggestions.forEach((button) => {
        button.addEventListener("click", () => {
          if (!qaInput || !(qaInput instanceof HTMLTextAreaElement)) return;
          qaInput.value = button.textContent?.trim() ?? "";
          runQa(qaInput.value);
          qaInput.focus({ preventScroll: true });
        });
      });
      qaDisplayToggle?.addEventListener("click", () => {
        qaDisplayMode = qaDisplayMode === "answer-first" ? "citations-first" : "answer-first";
        updateQaDisplayMode();
      });
      qaCitations?.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
        if (!target) return;
        recordQaEvent({ type: "citation_click", id: target.dataset.qaCitationId, query: qaQuery });
        closeQa();
      });

      mobileMenuToggle?.addEventListener("click", () => {
        if (!siteNavMore) return;
        setSiteNavMenuOpen(!isSiteNavMenuOpen());
        syncMobileToggleState();
      });

      siteNavMoreToggle?.addEventListener("click", () => {
        setSiteNavMenuOpen(!isSiteNavMenuOpen());
        syncMobileToggleState();
      });

      document.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || !(siteNavMore instanceof HTMLElement) || !isSiteNavMenuOpen()) return;
        if (target.closest("[data-site-nav-more]")) return;
        setSiteNavMenuOpen(false);
        syncMobileToggleState();
      });

      readerDensityButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (!button.dataset.readerDensity) return;
          setReaderDensity(button.dataset.readerDensity);
        });
      });

      readerFontButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (!button.dataset.readerFont) return;
          setReaderFont(button.dataset.readerFont);
        });
      });

      if (readerDensitySelect instanceof HTMLSelectElement) {
        readerDensitySelect.addEventListener("change", (event) => {
          const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
          setReaderDensity(value);
        });
      }

      if (readerFontSelect instanceof HTMLSelectElement) {
        readerFontSelect.addEventListener("change", (event) => {
          const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
          setReaderFont(value);
        });
      }

      updateQaDisplayMode();
      initializeReaderPreferences();
      syncSiteNavOverflow(desktopNavMedia.matches);
      syncMobileToggleState();
      updateMobileCtaVisibility();

      if ("addEventListener" in desktopNavMedia) {
        desktopNavMedia.addEventListener("change", (event) => {
          syncSiteNavOverflow(event.matches);
          updateMobileCtaVisibility();
        });
      } else {
        desktopNavMedia.addListener((event) => {
          syncSiteNavOverflow(event.matches);
          updateMobileCtaVisibility();
        });
      }

      window.addEventListener("scroll", updateMobileCtaVisibility, { passive: true });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeSearch();
          closeQa();
          closeHelp();
          return;
        }
        if (inEditable(event.target)) return;
        if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSearch();
          return;
        }
        if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          openSearch();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (event.key === "?") {
          event.preventDefault();
          toggleHelp();
          return;
        }

        if (event.key.toLowerCase() === "g") {
          event.preventDefault();
          setSequence();
          return;
        }

        if (pendingSequence === "g") {
          const key = event.key.toLowerCase();
          resetSequence();
          if (key === "h") navigateTo("/");
          if (key === "r") navigateTo("/read");
          if (key === "n") navigateTo("/release-notes");
          if (key === "d") navigateTo("/downloads");
          if (key === "a") navigateTo("/read/tools");
          if (key === "o") navigateTo("/read/overview");
          if (key === "c") navigateTo("/read/chapters");
          if (key === "m") navigateTo("/read/mechanisms");
          if (key === "t") navigateTo("/read/toolkit");
          if (key === "l") navigateTo("/read/glossary");
          if (key === "e") navigateTo("/read/examples");
          return;
        }

        if (event.key === "[") {
          event.preventDefault();
          updateActiveHeading();
          goToHeading(activeHeadingIndex - 1);
          return;
        }

        if (event.key === "]") {
          event.preventDefault();
          updateActiveHeading();
          goToHeading(activeHeadingIndex + 1);
        }
      });

      if (headings.length) {
        headings.forEach((heading) => heading.setAttribute("tabindex", "-1"));
        if ("IntersectionObserver" in window) {
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                entry.target.classList.toggle("is-in-viewport", entry.isIntersecting);
                if (entry.isIntersecting) {
                  activeHeadingIndex = headings.indexOf(entry.target);
                }
              });
            },
            {
              rootMargin: "-10% 0px -70% 0px",
              threshold: 0.1,
            }
          );
          headings.forEach((heading) => observer.observe(heading));
        } else {
          window.addEventListener("scroll", updateActiveHeading, { passive: true });
        }
      }

      document.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("[data-export-link]") : null;
        if (!target) return;
        const payload = {
          type: "download",
          format: target.dataset.exportFormat,
          scope: target.dataset.exportScope,
          slug: target.dataset.exportSlug ?? null,
          href: target.getAttribute("href"),
          path: window.location.pathname,
        };
        recordExportEvent(payload);
        sendExportAnalytics(payload);
      });
    
