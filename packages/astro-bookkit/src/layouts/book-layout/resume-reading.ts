import { queryAllElements, queryElement } from "./dom";
import {
	readStoredJson,
	removeStoredValue,
	type StorageLike,
	writeStoredJson,
} from "./storage";

/**
 * Where a reader left off, kept on this device only: a chapter page records
 * its slug, and the home page and reading hub offer "Continue: <title>" with
 * a way to forget it. Only chapters are remembered. When the browser blocks
 * storage nothing is recorded and nothing is offered; no page breaks.
 */

/** A chapter as `chapterLinksInReadingOrder` lists it. */
export type ResumeChapter = { slug: string; label: string; href: string };

type ResumeOptions = {
	root: ParentNode;
	storage: StorageLike & Pick<Storage, "removeItem">;
	storageKey: string;
};

/** The chapter to offer: the stored slug, if it is still one of `chapters`. */
export const chapterToResume = (
	stored: unknown,
	chapters: readonly ResumeChapter[],
): ResumeChapter | null => {
	const slug =
		stored && typeof stored === "object" && "slug" in stored
			? (stored as { slug: unknown }).slug
			: null;
	return typeof slug === "string"
		? (chapters.find((chapter) => chapter.slug === slug) ?? null)
		: null;
};

const SITE = "https://site.invalid";

/**
 * An address on this site: a path from its root, read as a browser reads
 * it. `//host/…`, `/\host/…`, and `/<tab>/host/…` start with a slash too,
 * but lead to another site.
 */
const isSitePath = (href: string): boolean => {
	if (!href.startsWith("/")) return false;
	try {
		return new URL(href, SITE).origin === SITE;
	} catch {
		return false;
	}
};

/**
 * The chapters a `[data-resume-reading]` block lists (its
 * `data-resume-chapters` JSON), each linking to a page of this site; any
 * other entry is dropped.
 */
export const resumeChapters = (json: string | undefined): ResumeChapter[] => {
	try {
		const parsed = JSON.parse(json ?? "[]");
		return Array.isArray(parsed)
			? parsed.filter(
					(item): item is ResumeChapter =>
						typeof item?.slug === "string" &&
						typeof item?.label === "string" &&
						typeof item?.href === "string" &&
						isSitePath(item.href),
				)
			: [];
	} catch {
		return [];
	}
};

export const initializeResumeReading = ({
	root,
	storage,
	storageKey,
}: ResumeOptions): void => {
	// A chapter page: remember it.
	const chapter = queryElement(root, "[data-resume-chapter]", HTMLElement);
	const slug = chapter?.dataset.resumeChapter;
	if (slug) writeStoredJson(storage, storageKey, { slug });

	// The home page and the hub: offer it.
	for (const block of queryAllElements(
		root,
		"[data-resume-reading]",
		HTMLElement,
	)) {
		const resume = chapterToResume(
			readStoredJson(storage, storageKey),
			resumeChapters(block.dataset.resumeChapters),
		);
		const link = queryElement(block, "[data-resume-link]", HTMLAnchorElement);
		const title = queryElement(block, "[data-resume-title]", HTMLElement);
		if (!resume || !link || !title) continue;
		link.href = resume.href;
		title.textContent = resume.label;
		block.hidden = false;
		queryElement(
			block,
			"[data-resume-clear]",
			HTMLButtonElement,
		)?.addEventListener("click", () => {
			removeStoredValue(storage, storageKey);
			block.hidden = true;
			// The button is gone with the block; keep focus in the page.
			queryElement(document, "#main-content", HTMLElement)?.focus({
				preventScroll: true,
			});
		});
	}
};
