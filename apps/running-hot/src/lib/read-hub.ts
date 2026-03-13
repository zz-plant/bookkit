const funnelLinks = document.querySelectorAll("[data-funnel-step]");
const releaseCard = document.querySelector("[data-release-card]");
const filterButton = document.querySelector("[data-read-updates-filter]");
const readCards = Array.from(document.querySelectorAll("[data-section-key]"));
const analyticsKey = document.body?.dataset?.analyticsKey || "book";
const visitStorageKey = `${analyticsKey}:read:lastVisit`;
const onboardingKey = `${analyticsKey}.reader.started`;
const previousVisit = localStorage.getItem(visitStorageKey);
const previousVisitMs = previousVisit ? new Date(previousVisit).getTime() : Number.NaN;
const nowIso = new Date().toISOString();

if (Number.isFinite(previousVisitMs) && filterButton && readCards.length > 0) {
  filterButton.hidden = false;
  readCards.forEach((card) => {
    const dateValue = card.getAttribute("data-change-date");
    const changeMs = dateValue ? new Date(dateValue).getTime() : Number.NaN;
    const isNew = Number.isFinite(changeMs) && changeMs > previousVisitMs;
    const chip = card.querySelector("[data-read-new]");
    if (chip) chip.hidden = !isNew;
  });

  let isFiltered = false;
  filterButton.addEventListener("click", () => {
    isFiltered = !isFiltered;
    readCards.forEach((card) => {
      const dateValue = card.getAttribute("data-change-date");
      const changeMs = dateValue ? new Date(dateValue).getTime() : Number.NaN;
      const isNew = Number.isFinite(changeMs) && changeMs > previousVisitMs;
      card.hidden = isFiltered ? !isNew : false;
    });
    filterButton.textContent = isFiltered ? "Show all sections" : "Show sections marked in latest release notes";
  });
}

localStorage.setItem(visitStorageKey, nowIso);

const readOnboardingState = () => {
  try {
    return localStorage.getItem(onboardingKey) === "true";
  } catch {
    return false;
  }
};
const markOnboardingStarted = () => {
  try {
    localStorage.setItem(onboardingKey, "true");
  } catch {
    // no-op: private mode or disabled storage
  }
};

if (!readOnboardingState() && releaseCard) {
  releaseCard.classList.add("read-tools-card--deemphasized");
  const note = document.createElement("p");
  note.className = "meta";
  note.dataset.releaseNote = "true";
  note.textContent = "Release notes stay secondary until you start reading.";
  releaseCard.appendChild(note);
}

funnelLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const step = link.getAttribute("data-funnel-step");
    if (!step) return;
    markOnboardingStarted();
    const payload = JSON.stringify({
      type: "engagement",
      title: `funnel:${step}`,
      path: window.location.pathname,
      durationSeconds: 0,
      scrollDepth: 0,
      timestamp: Date.now(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics.json", new Blob([payload], { type: "application/json" }));
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
