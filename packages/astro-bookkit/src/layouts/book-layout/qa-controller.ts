import { appendHighlightedText, queryAllElements, queryElement, toSafeUrl } from "./dom";
import {
  getQaDisplayToggleLabel,
  loadQaDisplayMode,
  persistQaDisplayMode,
  toggleQaDisplayMode,
} from "./qa-display-mode";
import { buildRankedResults } from "./search-ranking";
import type { SearchIndexStore } from "./search-index-store";
import { readStoredValue, writeStoredValue, type StorageLike } from "./storage";

export type QaEventPayload = {
  type: "question" | "citation_click" | "opt_out" | "opt_in";
  query?: string;
  matches?: number;
  id?: string;
  enabled?: boolean;
};

export type QaController = {
  open: () => Promise<void>;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
};

type QaControllerOptions = {
  root: HTMLElement;
  toggleButton: HTMLButtonElement | null;
  indexStore: SearchIndexStore;
  recordEvent: (payload: QaEventPayload) => void;
  storage: StorageLike;
  disabledKey: string;
  displayModeKey: string;
};

export const initializeQaController = ({
  root,
  toggleButton,
  indexStore,
  recordEvent,
  storage,
  disabledKey,
  displayModeKey,
}: QaControllerOptions): QaController => {
  const closeButton = queryElement(root, "[data-qa-close]", HTMLButtonElement);
  const form = queryElement(root, "[data-qa-form]", HTMLFormElement);
  const input = queryElement(root, "[data-qa-input]", HTMLTextAreaElement);
  const answer = queryElement(root, "[data-qa-answer]", HTMLElement);
  const citations = queryElement(root, "[data-qa-citations]", HTMLElement);
  const status = queryElement(root, "[data-qa-status]", HTMLElement);
  const body = queryElement(root, "[data-qa-body]", HTMLElement);
  const disabledPanel = queryElement(root, "[data-qa-disabled]", HTMLElement);
  const disableButton = queryElement(root, "[data-qa-disable]", HTMLButtonElement);
  const enableButton = queryElement(root, "[data-qa-enable]", HTMLButtonElement);
  const displayToggle = queryElement(root, "[data-qa-display-toggle]", HTMLButtonElement);
  const suggestions = queryAllElements(root, "[data-qa-suggestion]", HTMLButtonElement);

  let query = "";
  let runId = 0;
  let lastFocused: HTMLElement | null = null;
  let displayMode = loadQaDisplayMode(storage, displayModeKey);

  const isDisabled = () => readStoredValue(storage, disabledKey) === "true";
  const setDisabled = (value: boolean) => writeStoredValue(storage, disabledKey, value ? "true" : "false");

  const setOpenState = (open: boolean) => {
    root.hidden = !open;
    root.classList.toggle("is-open", open);
    toggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const updateStatus = (message: string) => {
    if (status) status.textContent = message;
  };

  const updateState = () => {
    const disabled = isDisabled();
    root.classList.toggle("is-disabled", disabled);
    body?.toggleAttribute("hidden", disabled);
    disabledPanel?.toggleAttribute("hidden", !disabled);
    disableButton?.toggleAttribute("disabled", disabled);
  };

  const updateDisplayMode = () => {
    root.dataset.qaDisplayMode = displayMode;
    if (displayToggle) {
      displayToggle.textContent = getQaDisplayToggleLabel(displayMode);
    }
    persistQaDisplayMode(storage, displayModeKey, displayMode);
  };

  const renderAnswer = (
    entries: ReturnType<typeof buildRankedResults>["results"],
    tokens: string[]
  ) => {
    if (!answer || !citations) return;
    answer.replaceChildren();
    citations.replaceChildren();

    if (!entries.length) {
      const emptyState = document.createElement("p");
      emptyState.textContent = "No answer found. Try rephrasing or using fewer words.";
      answer.appendChild(emptyState);
      return;
    }

    const answerParagraph = document.createElement("p");
    answerParagraph.textContent = entries[0]?.snippet ?? "No answer found.";
    const metaParagraph = document.createElement("p");
    metaParagraph.className = "meta";
    metaParagraph.textContent = `Answer assembled from ${entries.length} cited passage${entries.length === 1 ? "" : "s"}.`;
    answer.append(answerParagraph, metaParagraph);

    const heading = document.createElement("h3");
    heading.textContent = "Sources";
    const list = document.createElement("ol");
    list.className = "qa-panel__citation-list";

    entries.forEach((entry) => {
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

    citations.append(heading, list);
  };

  const runQa = async (value: string) => {
    if (isDisabled()) {
      updateStatus("AI Q&A is disabled.");
      return;
    }

    const currentRunId = ++runId;
    const index = await indexStore.load();
    if (currentRunId !== runId) return;

    query = value;
    const normalizedQuery = value.trim().toLowerCase();
    if (!normalizedQuery) {
      updateStatus("Ask a question to see answers.");
      if (answer) {
        const idle = document.createElement("p");
        idle.className = "meta";
        idle.textContent = "No answer yet.";
        answer.replaceChildren(idle);
      }
      citations?.replaceChildren();
      return;
    }

    const { tokens, results } = buildRankedResults(index, normalizedQuery);
    const topResults = results.slice(0, 3);
    renderAnswer(topResults, tokens);
    updateStatus(
      topResults.length
        ? `${topResults.length} cited passage${topResults.length === 1 ? "" : "s"} returned.`
        : "No citations found."
    );
    recordEvent({ type: "question", query: normalizedQuery, matches: topResults.length });
  };

  const open = async () => {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenState(true);
    updateState();
    await indexStore.load();
    window.requestAnimationFrame(() => {
      if (!input || isDisabled()) return;
      input.value = query;
      input.focus({ preventScroll: true });
      input.select();
    });
  };

  const close = () => {
    setOpenState(false);
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
  closeButton?.addEventListener("click", close);
  root.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && !event.target.closest("[data-qa-content]")) {
      close();
    }
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runQa(input?.value ?? "");
  });
  input?.addEventListener("input", (event) => {
    query = event.target instanceof HTMLTextAreaElement ? event.target.value : "";
  });
  disableButton?.addEventListener("click", () => {
    setDisabled(true);
    updateState();
    recordEvent({ type: "opt_out", enabled: false });
  });
  enableButton?.addEventListener("click", () => {
    setDisabled(false);
    updateState();
    recordEvent({ type: "opt_in", enabled: true });
    input?.focus({ preventScroll: true });
  });
  suggestions.forEach((button) => {
    button.addEventListener("click", () => {
      if (!input) return;
      input.value = button.textContent?.trim() ?? "";
      void runQa(input.value);
      input.focus({ preventScroll: true });
    });
  });
  displayToggle?.addEventListener("click", () => {
    displayMode = toggleQaDisplayMode(displayMode);
    updateDisplayMode();
  });
  citations?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    recordEvent({ type: "citation_click", id: target.dataset.qaCitationId, query });
    close();
  });

  updateState();
  updateDisplayMode();

  return {
    open,
    close,
    toggle,
    isOpen: () => !root.hidden,
  };
};
