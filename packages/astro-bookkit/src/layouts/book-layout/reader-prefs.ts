import { queryAllElements, queryElement } from "./dom";
import { readStoredJson, writeStoredJson, type StorageLike } from "./storage";

type ReaderPreferences = {
  density: string | null;
  font: string | null;
};

type ReaderPrefsOptions = {
  root: HTMLElement;
  storage: StorageLike;
  storageKey: string;
};

const validDensities = ["compact", "comfortable", "relaxed"] as const;
const validFonts = ["serif", "sans"] as const;

export const initializeReaderPrefs = ({ root, storage, storageKey }: ReaderPrefsOptions): void => {
  const densityButtons = queryAllElements(root, "[data-reader-density]", HTMLButtonElement);
  const fontButtons = queryAllElements(root, "[data-reader-font]", HTMLButtonElement);
  const densitySelect = queryElement(root, "[data-reader-density-select]", HTMLSelectElement);
  const fontSelect = queryElement(root, "[data-reader-font-select]", HTMLSelectElement);

  const updateButtonState = (buttons: HTMLButtonElement[], selectedValue: string) => {
    buttons.forEach((button) => {
      const buttonValue = button.dataset.readerDensity ?? button.dataset.readerFont;
      const isActive = buttonValue === selectedValue;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.classList.toggle("is-active", isActive);
    });
  };

  const loadPreferences = (): ReaderPreferences => {
    const parsed = readStoredJson<Partial<ReaderPreferences>>(storage, storageKey);
    return {
      density: parsed?.density ?? null,
      font: parsed?.font ?? null,
    };
  };

  const savePreferences = (prefs: ReaderPreferences) => writeStoredJson(storage, storageKey, prefs);

  const setDensity = (density: string) => {
    if (!validDensities.includes(density as (typeof validDensities)[number])) return;
    document.body.dataset.readerDensity = density;
    const prefs = loadPreferences();
    savePreferences({ ...prefs, density });
    updateButtonState(densityButtons, density);
    if (densitySelect) densitySelect.value = density;
  };

  const setFont = (font: string) => {
    if (!validFonts.includes(font as (typeof validFonts)[number])) return;
    document.body.dataset.readerFont = font;
    const prefs = loadPreferences();
    savePreferences({ ...prefs, font });
    updateButtonState(fontButtons, font);
    if (fontSelect) fontSelect.value = font;
  };

  const initialize = () => {
    const prefs = loadPreferences();
    setDensity(prefs.density ?? (window.matchMedia("(max-width: 720px)").matches ? "compact" : "comfortable"));
    setFont(prefs.font ?? "serif");
  };

  densityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.readerDensity) setDensity(button.dataset.readerDensity);
    });
  });
  fontButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.readerFont) setFont(button.dataset.readerFont);
    });
  });
  densitySelect?.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement) setDensity(event.target.value);
  });
  fontSelect?.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement) setFont(event.target.value);
  });

  initialize();
};
