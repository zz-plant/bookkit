import { queryAllElements } from "./dom";
import { readStoredJson, type StorageLike, writeStoredJson } from "./storage";

type ReaderPreferences = {
	density: string | null;
	font: string | null;
	theme: "light" | "dark" | "auto" | null;
};

type ReaderPrefsOptions = {
	root: HTMLElement;
	storage: StorageLike;
	storageKey: string;
};

const validDensities = ["compact", "comfortable", "relaxed"] as const;
const validFonts = ["serif", "sans"] as const;
const validThemes = ["light", "dark", "auto"] as const;

export const initializeReaderPrefs = ({
	root,
	storage,
	storageKey,
}: ReaderPrefsOptions): void => {
	const densityButtons = queryAllElements(
		root,
		"[data-reader-density]",
		HTMLButtonElement,
	);
	const fontButtons = queryAllElements(
		root,
		"[data-reader-font]",
		HTMLButtonElement,
	);
	const themeButtons = queryAllElements(
		root,
		"[data-reader-theme]",
		HTMLButtonElement,
	);

	const updateButtonState = (
		buttons: HTMLButtonElement[],
		selectedValue: string,
	) => {
		buttons.forEach((button) => {
			const buttonValue =
				button.dataset.readerDensity ??
				button.dataset.readerFont ??
				button.dataset.readerTheme;
			const isActive = buttonValue === selectedValue;
			button.setAttribute("aria-pressed", isActive ? "true" : "false");
			button.classList.toggle("is-active", isActive);
		});
	};

	const loadPreferences = (): ReaderPreferences => {
		const parsed = readStoredJson<Partial<ReaderPreferences>>(
			storage,
			storageKey,
		);
		return {
			density: parsed?.density ?? null,
			font: parsed?.font ?? null,
			theme: parsed?.theme ?? null,
		};
	};

	const savePreferences = (prefs: ReaderPreferences) =>
		writeStoredJson(storage, storageKey, prefs);

	// `remember` is false when a default is applied on load: only a choice the
	// reader made is saved, so a default can change later and a first visit on
	// a narrow window does not fix the text size for every later one.
	const setDensity = (density: string, remember = true) => {
		if (!validDensities.includes(density as (typeof validDensities)[number]))
			return;
		document.body.dataset.readerDensity = density;
		if (remember) savePreferences({ ...loadPreferences(), density });
		updateButtonState(densityButtons, density);
	};

	const setFont = (font: string, remember = true) => {
		if (!validFonts.includes(font as (typeof validFonts)[number])) return;
		document.body.dataset.readerFont = font;
		if (remember) savePreferences({ ...loadPreferences(), font });
		updateButtonState(fontButtons, font);
	};

	const setTheme = (theme: string) => {
		if (!validThemes.includes(theme as (typeof validThemes)[number])) return;
		if (theme === "auto") {
			delete document.documentElement.dataset.theme;
		} else {
			document.documentElement.dataset.theme = theme;
		}
		const prefs = loadPreferences();
		savePreferences({ ...prefs, theme: theme as "light" | "dark" | "auto" });
		updateButtonState(themeButtons, theme);
	};

	const initialize = () => {
		const prefs = loadPreferences();
		// Comfortable at every width: 19px on a desktop, 18px on a phone.
		setDensity(prefs.density ?? "comfortable", false);
		setFont(prefs.font ?? "serif", false);
		if (prefs.theme) {
			setTheme(prefs.theme);
		} else {
			updateButtonState(themeButtons, "auto");
		}
	};

	densityButtons.forEach((button) => {
		button.addEventListener("click", () => {
			if (button.dataset.readerDensity)
				setDensity(button.dataset.readerDensity);
		});
	});
	fontButtons.forEach((button) => {
		button.addEventListener("click", () => {
			if (button.dataset.readerFont) setFont(button.dataset.readerFont);
		});
	});
	themeButtons.forEach((button) => {
		button.addEventListener("click", () => {
			if (button.dataset.readerTheme) setTheme(button.dataset.readerTheme);
		});
	});

	initialize();
};
