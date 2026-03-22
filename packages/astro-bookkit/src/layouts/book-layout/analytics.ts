type AnalyticsEvent = Record<string, unknown>;
const previewAnalyticsEndpoint = document.body?.dataset?.previewAnalyticsEndpoint;

const sendPreviewAnalytics = (payload: AnalyticsEvent) => {
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

      const analyticsKeyPrefix = document.body?.dataset?.analyticsKey || "book";
      const analyticsStorageKey = `${analyticsKeyPrefix}.analytics.events`;
      const analyticsSessionKey = `${analyticsKeyPrefix}.analytics.session`;
      const previewAnalyticsKey = `${analyticsKeyPrefix}.preview.analytics`;
      const analyticsEndpoint = document.body?.dataset?.analyticsEndpoint;
      const isPreview = document.body?.dataset?.preview === "true";
      const analyticsLocale = document.body?.dataset?.locale || document.documentElement.lang || "en";
      const analyticsRetentionDays = 90;

      const loadAnalyticsEvents = () => {
        try {
          const stored = localStorage.getItem(analyticsStorageKey);
          const parsed = stored ? JSON.parse(stored) : [];
          const cutoff = Date.now() - analyticsRetentionDays * 24 * 60 * 60 * 1000;
          const filtered = Array.isArray(parsed)
            ? parsed.filter((event) => typeof event?.timestamp === "number" && event.timestamp >= cutoff)
            : [];
          if (filtered.length !== parsed.length) {
            localStorage.setItem(analyticsStorageKey, JSON.stringify(filtered));
          }
          return filtered;
        } catch (error) {
          return [];
        }
      };

      const saveAnalyticsEvents = (events: AnalyticsEvent[]) => {
        localStorage.setItem(analyticsStorageKey, JSON.stringify(events));
      };

      const getSessionId = () => {
        const existing = localStorage.getItem(analyticsSessionKey);
        if (existing) return existing;
        const generated =
          "crypto" in window && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(analyticsSessionKey, generated);
        return generated;
      };

      const recordAnalyticsEvent = (event: AnalyticsEvent) => {
        const events = loadAnalyticsEvents();
        events.push(event);
        saveAnalyticsEvents(events);
        sendAnalyticsEvent(event);
      };

      const sendAnalyticsEvent = (payload: AnalyticsEvent) => {
        if (!analyticsEndpoint) return;
        const body = JSON.stringify(payload);
        if ("sendBeacon" in navigator) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(analyticsEndpoint, blob);
          return;
        }
        fetch(analyticsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      };

      const recordPreviewEvent = () => {
        if (!isPreview) return;
        const tokenHint = document.body?.dataset?.previewHint || "unknown";
        const expiresAt = document.body?.dataset?.previewExpires || null;
        const label = document.body?.dataset?.previewLabel || null;
        const event = {
          type: "preview",
          tokenHint,
          label,
          expiresAt,
          path: window.location.pathname,
          ts: Date.now(),
        };
        const existing = JSON.parse(localStorage.getItem(previewAnalyticsKey) ?? "[]");
        existing.push(event);
        localStorage.setItem(previewAnalyticsKey, JSON.stringify(existing.slice(-120)));
        window.dispatchEvent(new CustomEvent("book-preview", { detail: event }));
        if (typeof sendPreviewAnalytics === "function") {
          sendPreviewAnalytics(event);
        }
      };

      const analyticsVersion = document.body?.dataset?.bookVersion || "draft";
      const path = window.location.pathname;
      const pathSegments = path.split("/").filter(Boolean);
      const isChapter = pathSegments[0] === "read" && pathSegments[1] === "chapters" && pathSegments[2];
      const chapterSlug = isChapter ? pathSegments[2] : null;

      const sessionId = getSessionId();
      const pageViewTimestamp = Date.now();
      recordPreviewEvent();
      recordAnalyticsEvent({
        id: `view-${pageViewTimestamp}-${Math.random().toString(16).slice(2)}`,
        type: "pageview",
        timestamp: pageViewTimestamp,
        sessionId,
        path,
        chapterSlug,
        version: analyticsVersion,
        locale: analyticsLocale,
        title: document.title,
      });

      let maxScrollDepth = 0;
      const updateScrollDepth = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollable <= 0) {
          maxScrollDepth = 1;
          return;
        }
        const ratio = window.scrollY / scrollable;
        if (ratio > maxScrollDepth) {
          maxScrollDepth = ratio;
        }
      };

      let analyticsReported = false;
      const reportEngagement = () => {
        if (analyticsReported) return;
        analyticsReported = true;
        updateScrollDepth();
        const durationSeconds = Math.max(1, Math.round((Date.now() - pageViewTimestamp) / 1000));
        recordAnalyticsEvent({
          id: `engagement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "engagement",
          timestamp: Date.now(),
          sessionId,
          path,
          chapterSlug,
          version: analyticsVersion,
          locale: analyticsLocale,
          durationSeconds,
          scrollDepth: Math.max(0, Math.min(1, maxScrollDepth)),
        });
      };

      updateScrollDepth();
      window.addEventListener("scroll", updateScrollDepth, { passive: true });
      window.addEventListener("beforeunload", reportEngagement);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          reportEngagement();
        }
      });
    
export {};
