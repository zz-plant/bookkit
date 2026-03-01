      const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
      const helpPanel = document.querySelector("[data-kbd-panel]");
      const helpToggle = document.querySelector("[data-kbd-toggle]");
      const helpClose = document.querySelector("[data-kbd-close]");
      const searchPanel = document.querySelector("[data-search-panel]");
      const searchToggle = document.querySelector("[data-search-toggle]");
      const searchClose = document.querySelector("[data-search-close]");
      const searchInput = document.querySelector("[data-search-input]");
      const searchResults = document.querySelector("[data-search-results]");
      const searchStatus = document.querySelector("[data-search-status]");
      const searchEmpty = document.querySelector("[data-search-empty]");
      const qaPanel = document.querySelector("[data-qa-panel]");
      const qaToggle = document.querySelector("[data-qa-toggle]");
      const qaClose = document.querySelector("[data-qa-close]");
      const qaForm = document.querySelector("[data-qa-form]");
      const qaInput = document.querySelector("[data-qa-input]");
      const qaAnswer = document.querySelector("[data-qa-answer]");
      const qaCitations = document.querySelector("[data-qa-citations]");
      const qaStatus = document.querySelector("[data-qa-status]");
      const qaBody = document.querySelector("[data-qa-body]");
      const qaDisabledPanel = document.querySelector("[data-qa-disabled]");
      const qaDisableButton = document.querySelector("[data-qa-disable]");
      const qaEnableButton = document.querySelector("[data-qa-enable]");
      const qaSuggestions = Array.from(document.querySelectorAll("[data-qa-suggestion]"));
      const qaDisplayToggle = document.querySelector("[data-qa-display-toggle]");
      const siteNavMore = document.querySelector("[data-site-nav-more]");
      const siteSettings = document.querySelector("[data-site-settings]");
      const mobileSearchToggle = document.querySelector("[data-mobile-search]");
      const mobileMenuToggle = document.querySelector("[data-mobile-menu]");
      const mobileCta = document.querySelector("[data-mobile-cta]");
      const siteNavMoreSummary = siteNavMore?.querySelector("summary");
      const readerDensityButtons = Array.from(document.querySelectorAll("[data-reader-density]"));
      const readerFontButtons = Array.from(document.querySelectorAll("[data-reader-font]"));
      const desktopNavMedia = window.matchMedia("(min-width: 721px)");
      const qaEnabled = document.body?.dataset?.qaEnabled === "true";
      const readerPrefsKey = `${analyticsKeyPrefix}.reader.prefs`;
      let lastFocused = null;
      let pendingSequence = null;
      let sequenceTimeout = null;
      let activeHeadingIndex = 0;
      let searchIndex = null;
      let searchQuery = "";
      let searchTimeout = null;
      let qaQuery = "";
      let lastScrollY = window.scrollY;
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

      const syncSiteNavOverflow = (matchesDesktop) => {
        if (!siteNavMore) return;
        if (matchesDesktop) {
          mobileMenuToggle?.setAttribute("aria-expanded", "false");
          return;
        }
        siteNavMore.removeAttribute("open");
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
      };

      const setReaderFont = (font) => {
        if (!["serif", "sans"].includes(font)) return;
        document.body.dataset.readerFont = font;
        const prefs = loadReaderPreferences();
        saveReaderPreferences({ ...prefs, font });
        updateReaderButtonState(readerFontButtons, font);
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

      const escapeHtml = (value) => {
        return value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
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

      const highlightText = (value, tokens) => {
        if (!tokens.length) return escapeHtml(value);
        return tokens.reduce((output, token) => {
          const regex = new RegExp(`(${token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")})`, "gi");
          return output.replace(regex, "<mark>$1</mark>");
        }, escapeHtml(value));
      };

      const recordSearchEvent = (payload) => {
        const event = { ...payload, ts: Date.now() };
        const existing = JSON.parse(localStorage.getItem(searchAnalyticsKey) ?? "[]");
        existing.push(event);
        localStorage.setItem(searchAnalyticsKey, JSON.stringify(existing.slice(-120)));
        window.dispatchEvent(new CustomEvent("book-search", { detail: event }));
      };

      const recordExportEvent = (payload) => {
        const event = { ...payload, ts: Date.now() };
        const existing = JSON.parse(localStorage.getItem(exportAnalyticsKey) ?? "[]");
        existing.push(event);
        localStorage.setItem(exportAnalyticsKey, JSON.stringify(existing.slice(-120)));
        window.dispatchEvent(new CustomEvent("book-export", { detail: event }));
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


      const warmSearchIndex = () => {
        if (!searchPanel || searchIndex) return;
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(() => {
            loadSearchIndex().catch(() => {});
          });
          return;
        }
        window.setTimeout(() => {
          loadSearchIndex().catch(() => {});
        }, 800);
      };

      const recordQaEvent = (payload) => {
        const event = { ...payload, ts: Date.now() };
        const existing = JSON.parse(localStorage.getItem(qaAnalyticsKey) ?? "[]");
        existing.push(event);
        localStorage.setItem(qaAnalyticsKey, JSON.stringify(existing.slice(-120)));
        window.dispatchEvent(new CustomEvent("book-qa", { detail: event }));
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
        qaCitations.innerHTML = "";
        if (!results.length) {
          qaAnswer.innerHTML = "<p>No answer found. Try rephrasing or using fewer words.</p>";
          return;
        }
        const answerText = results[0]?.snippet ?? "No answer found.";
        qaAnswer.innerHTML = `
          <p>${escapeHtml(answerText)}</p>
          <p class="meta">Answer assembled from ${results.length} cited passage${results.length === 1 ? "" : "s"}.</p>
        `;
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
          snippet.innerHTML = highlightText(entry.snippet, tokens);
          item.appendChild(link);
          item.appendChild(snippet);
          list.appendChild(item);
        });
        qaCitations.appendChild(heading);
        qaCitations.appendChild(list);
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
        const index = await loadSearchIndex();
        qaQuery = value;
        const query = value.trim().toLowerCase();
        if (!query) {
          updateQaStatus("Ask a question to see answers.");
          qaAnswer && (qaAnswer.innerHTML = "<p class='meta'>No answer yet.</p>");
          qaCitations && (qaCitations.innerHTML = "");
          return;
        }
        const tokens = query.split(/\s+/).filter(Boolean);
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
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        renderQaAnswer(results, tokens);
        updateQaStatus(
          results.length
            ? `${results.length} cited passage${results.length === 1 ? "" : "s"} returned.`
            : "No citations found."
        );
        recordQaEvent({ type: "question", query, matches: results.length });
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
        const menuOpen = Boolean(siteNavMore && siteNavMore.hasAttribute("open"));
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
        searchResults.innerHTML = "";
        if (!results.length) {
          searchEmpty?.removeAttribute("hidden");
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
            const breadcrumb = entry.section ? `${entry.context} › ${entry.section}` : entry.context;
            link.innerHTML = `
              <div class="search-panel__item-title">${highlightText(entry.title, tokens)}</div>
              <div class="search-panel__item-snippet">${highlightText(entry.snippet, tokens)}</div>
              <div class="search-panel__item-meta">${escapeHtml(entry.label)} • ${escapeHtml(
                breadcrumb
              )}</div>
            `;
            list.appendChild(link);
          });
          section.appendChild(list);
          searchResults.appendChild(section);
        });
      };

      const runSearch = async (value) => {
        const index = await loadSearchIndex();
        searchQuery = value;
        const query = value.trim().toLowerCase();
        if (!query) {
          searchResults && (searchResults.innerHTML = "");
          searchEmpty?.setAttribute("hidden", "true");
          updateSearchStatus("Type a word or phrase to find relevant sections.");
          return;
        }
        const tokens = query.split(/\s+/).filter(Boolean);
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
        const isOpen = siteNavMore.hasAttribute("open");
        if (isOpen) {
          siteNavMore.removeAttribute("open");
        } else {
          siteNavMore.setAttribute("open", "");
        }
        syncMobileToggleState();
      });

      siteNavMoreSummary?.addEventListener("click", () => {
        window.requestAnimationFrame(syncMobileToggleState);
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

      warmSearchIndex();
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
    