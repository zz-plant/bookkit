import { queryElement } from "./dom";

type MobileNavOptions = {
	headerRoot: HTMLElement;
	mobileCtaRoot: HTMLElement | null;
};

export const initializeMobileNav = ({
	headerRoot,
	mobileCtaRoot,
}: MobileNavOptions): void => {
	const siteNavMore = queryElement(
		headerRoot,
		"[data-site-nav-more]",
		HTMLElement,
	);
	const siteNavMoreToggle = queryElement(
		headerRoot,
		"[data-site-nav-more-toggle]",
		HTMLButtonElement,
	);
	const siteNavMoreOverflow = queryElement(
		headerRoot,
		"[data-site-nav-overflow]",
		HTMLElement,
	);
	const siteSettings = queryElement(
		headerRoot,
		"[data-site-settings]",
		HTMLDetailsElement,
	);
	const mobileMenuToggle = mobileCtaRoot
		? queryElement(mobileCtaRoot, "[data-mobile-menu]", HTMLButtonElement)
		: null;

	let lastScrollY = window.scrollY;
	const desktopNavMedia = window.matchMedia("(min-width: 721px)");

	const setMenuOpen = (open: boolean) => {
		if (!siteNavMore) return;
		siteNavMore.classList.toggle("is-open", open);
		siteNavMoreToggle?.setAttribute("aria-expanded", open ? "true" : "false");
		if (siteNavMoreOverflow) {
			siteNavMoreOverflow.hidden = !open;
		}
	};

	const isMenuOpen = () => Boolean(siteNavMore?.classList.contains("is-open"));

	const syncMobileToggleState = () => {
		const open = isMenuOpen();
		mobileMenuToggle?.setAttribute("aria-expanded", open ? "true" : "false");
		if (mobileMenuToggle) {
			mobileMenuToggle.textContent = open ? "Close menu" : "Menu";
		}
	};

	const syncOverflow = (matchesDesktop: boolean) => {
		if (!siteNavMore) return;
		if (matchesDesktop) {
			mobileMenuToggle?.setAttribute("aria-expanded", "false");
			return;
		}
		setMenuOpen(false);
		siteSettings?.removeAttribute("open");
		mobileMenuToggle?.setAttribute("aria-expanded", "false");
	};

	const setMobileCtaHidden = (hidden: boolean) => {
		const mobileCta = mobileCtaRoot;
		if (!(mobileCta instanceof HTMLElement)) return;
		mobileCta.classList.toggle("mobile-cta--hidden", hidden);
		mobileCta.setAttribute("aria-hidden", hidden ? "true" : "false");
		Reflect.set(mobileCta, "inert", hidden);

		const focusables = mobileCta.querySelectorAll(
			"a, button, input, select, textarea, [tabindex]",
		);
		focusables.forEach((focusable: Element) => {
			if (!(focusable instanceof HTMLElement)) return;
			if (hidden) {
				if (focusable.dataset.mobileCtaPrevTabindex === undefined) {
					focusable.dataset.mobileCtaPrevTabindex =
						focusable.getAttribute("tabindex") ?? "";
				}
				focusable.setAttribute("tabindex", "-1");
				return;
			}
			if (focusable.dataset.mobileCtaPrevTabindex === undefined) return;
			const previous = focusable.dataset.mobileCtaPrevTabindex;
			if (previous) {
				focusable.setAttribute("tabindex", previous);
			} else {
				focusable.removeAttribute("tabindex");
			}
			delete focusable.dataset.mobileCtaPrevTabindex;
		});
	};

	const updateMobileCtaVisibility = () => {
		const mobileCta = mobileCtaRoot;
		if (!(mobileCta instanceof HTMLElement)) return;
		if (!window.matchMedia("(max-width: 720px)").matches) {
			setMobileCtaHidden(false);
			lastScrollY = window.scrollY;
			return;
		}

		if (isMenuOpen()) return;
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

		if (
			mobileCta.contains(document.activeElement) &&
			mobileCta.getAttribute("aria-hidden") === "true"
		) {
			const mainContent = document.getElementById("main-content");
			(mainContent instanceof HTMLElement
				? mainContent
				: document.body
			).focus?.({ preventScroll: true });
		}

		lastScrollY = currentY;
	};

	mobileMenuToggle?.addEventListener("click", () => {
		if (!siteNavMore) return;
		setMenuOpen(!isMenuOpen());
		syncMobileToggleState();
	});

	siteNavMoreToggle?.addEventListener("click", () => {
		setMenuOpen(!isMenuOpen());
		syncMobileToggleState();
	});

	document.addEventListener("click", (event) => {
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (!target || !siteNavMore || !isMenuOpen()) return;
		if (
			target.closest("[data-site-nav-more]") ||
			target.closest("[data-mobile-menu]")
		)
			return;
		setMenuOpen(false);
		syncMobileToggleState();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && isMenuOpen()) {
			setMenuOpen(false);
			syncMobileToggleState();
		}
	});

	syncOverflow(desktopNavMedia.matches);
	syncMobileToggleState();
	updateMobileCtaVisibility();

	desktopNavMedia.addEventListener("change", (event: MediaQueryListEvent) => {
		syncOverflow(event.matches);
		updateMobileCtaVisibility();
	});

	window.addEventListener("scroll", updateMobileCtaVisibility, {
		passive: true,
	});
};
