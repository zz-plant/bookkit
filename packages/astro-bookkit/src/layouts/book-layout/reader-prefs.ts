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

	const setDensity = (density: string) => {
		if (!validDensities.includes(density as (typeof validDensities)[number]))
			return;
		document.body.dataset.readerDensity = density;
		const prefs = loadPreferences();
		savePreferences({ ...prefs, density });
		updateButtonState(densityButtons, density);
	};

	const setFont = (font: string) => {
		if (!validFonts.includes(font as (typeof validFonts)[number])) return;
		document.body.dataset.readerFont = font;
		const prefs = loadPreferences();
		savePreferences({ ...prefs, font });
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
		setDensity(
			prefs.density ??
				(window.matchMedia("(max-width: 720px)").matches
					? "compact"
					: "comfortable"),
		);
		setFont(prefs.font ?? "serif");
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
