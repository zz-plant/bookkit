import { isEditableTarget, queryElement } from "./dom";
import {
	type PendingKeyboardSequence,
	resolveKeyboardSequence,
} from "./keyboard-sequences";
import type { QaController } from "./qa-controller";
import type { SearchController } from "./search-controller";

type HelpPanelController = {
	close: () => void;
	toggle: () => void;
};

type KeyboardShortcutsOptions = {
	root: HTMLElement;
	toggleButton: HTMLButtonElement | null;
	mainRoot: HTMLElement | null;
	search: SearchController | null;
	qa: QaController | null;
};

export const shouldSkipKeyboardShortcut = ({
	key,
	editableTarget,
	hasModifier,
}: {
	key: string;
	editableTarget: boolean;
	hasModifier: boolean;
}): boolean =>
	key.toLowerCase() !== "escape" && (editableTarget || hasModifier);

const initializeHelpPanel = (
	root: HTMLElement,
	toggleButton: HTMLButtonElement | null,
): HelpPanelController => {
	const closeButton = queryElement(root, "[data-kbd-close]", HTMLButtonElement);
	let lastFocused: HTMLElement | null = null;

	const setOpenState = (open: boolean) => {
		root.hidden = !open;
		root.classList.toggle("is-open", open);
		toggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
	};

	const open = () => {
		lastFocused =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		setOpenState(true);
		closeButton?.focus({ preventScroll: true });
	};

	const close = () => {
		setOpenState(false);
		lastFocused?.focus?.();
	};

	const toggle = () => {
		if (root.hidden) {
			open();
			return;
		}
		close();
	};

	toggleButton?.addEventListener("click", toggle);
	closeButton?.addEventListener("click", close);
	root.addEventListener("click", (event) => {
		if (
			event.target instanceof HTMLElement &&
			!event.target.closest("[data-kbd-content]")
		) {
			close();
		}
	});

	return { close, toggle };
};

export const initializeKeyboardShortcuts = ({
	root,
	toggleButton,
	mainRoot,
	search,
	qa,
}: KeyboardShortcutsOptions): void => {
	const help = initializeHelpPanel(root, toggleButton);
	const headings = mainRoot
		? Array.from(mainRoot.querySelectorAll("h2, h3"))
		: [];
	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	let activeHeadingIndex = 0;
	let pendingSequence: PendingKeyboardSequence = null;
	let sequenceTimeout: number | null = null;

	const resetSequence = () => {
		pendingSequence = null;
		if (sequenceTimeout !== null) {
			window.clearTimeout(sequenceTimeout);
			sequenceTimeout = null;
		}
	};

	const updateSequence = (nextPending: PendingKeyboardSequence) => {
		pendingSequence = nextPending;
		if (sequenceTimeout !== null) {
			window.clearTimeout(sequenceTimeout);
			sequenceTimeout = null;
		}
		if (nextPending) {
			sequenceTimeout = window.setTimeout(resetSequence, 1200);
		}
	};

	const setHeadingHighlight = (target: Element | undefined) => {
		if (!(target instanceof HTMLElement)) return;
		target.classList.add("viewport-highlight");
		window.setTimeout(
			() => target.classList.remove("viewport-highlight"),
			1200,
		);
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

	const goToHeading = (index: number) => {
		if (!headings.length) return;
		const clamped = Math.max(0, Math.min(index, headings.length - 1));
		activeHeadingIndex = clamped;
		const target = headings[clamped];
		target.scrollIntoView({
			behavior: prefersReducedMotion ? "auto" : "smooth",
			block: "start",
		});
		target instanceof HTMLElement && target.focus({ preventScroll: true });
		setHeadingHighlight(target);
	};

	const runCommand = (
		command: ReturnType<typeof resolveKeyboardSequence>["command"],
	) => {
		if (command.type === "dismiss-panels") {
			search?.close();
			qa?.close();
			help.close();
			return;
		}
		if (command.type === "toggle-help") {
			help.toggle();
			return;
		}
		if (command.type === "open-search") {
			void search?.open();
			return;
		}
		if (command.type === "navigate") {
			window.location.href = command.path;
			return;
		}
		if (command.type === "previous-heading") {
			updateActiveHeading();
			goToHeading(activeHeadingIndex - 1);
			return;
		}
		if (command.type === "next-heading") {
			updateActiveHeading();
			goToHeading(activeHeadingIndex + 1);
		}
	};

	document.addEventListener("keydown", (event) => {
		if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			search?.toggle();
			return;
		}

		if (event.key.toLowerCase() === "escape") {
			const { command, nextPending } = resolveKeyboardSequence(
				pendingSequence,
				event.key,
			);
			event.preventDefault();
			updateSequence(nextPending);
			runCommand(command);
			return;
		}

		if (
			shouldSkipKeyboardShortcut({
				key: event.key,
				editableTarget: isEditableTarget(event.target),
				hasModifier: event.metaKey || event.ctrlKey || event.altKey,
			})
		) {
			return;
		}

		const { command, nextPending } = resolveKeyboardSequence(
			pendingSequence,
			event.key,
		);
		if (command.type === "noop") {
			if (nextPending) {
				event.preventDefault();
			}
			updateSequence(nextPending);
			return;
		}

		event.preventDefault();
		updateSequence(nextPending);
		runCommand(command);
	});

	if (!headings.length) return;

	for (const heading of headings) {
		heading.setAttribute("tabindex", "-1");
	}
	if (typeof window.IntersectionObserver === "function") {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					entry.target.classList.toggle("is-in-viewport", entry.isIntersecting);
					if (entry.isIntersecting) {
						activeHeadingIndex = headings.indexOf(entry.target as Element);
					}
				});
			},
			{
				rootMargin: "-10% 0px -70% 0px",
				threshold: 0.1,
			},
		);
		for (const heading of headings) {
			observer.observe(heading);
		}
		return;
	}

	window.addEventListener("scroll", updateActiveHeading, { passive: true });
};
