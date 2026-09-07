import type { ContentSuggestion } from "./types";

export type ChapterRecord = {
	slug: string;
	title: string;
	mechanisms: string[];
	prerequisites: string[];
	order?: number;
	file?: string;
	/** Raw chapter body; used to detect mechanism slugs referenced in prose. */
	body?: string;
};

export type PrerequisiteSuggestionOptions = {
	book: string;
	chapters: ChapterRecord[];
	/** Known mechanism slugs. */
	mechanismSlugs?: string[];
};

/**
 * Root chapters ("overview") survey the whole book. They declare mechanisms
 * without introducing them and legitimately reference mechanisms before the
 * dedicated chapters exist, so they must not create introducer obligations.
 */
const isRootChapter = (chapter: { slug: string }): boolean =>
	chapter.slug === "overview" || chapter.slug === "00-overview";

export const suggestPrerequisiteEdges = (
	options: PrerequisiteSuggestionOptions,
): ContentSuggestion[] => {
	const chaptersBySlug = new Map(options.chapters.map((c) => [c.slug, c]));
	const knownMechanisms = new Set(options.mechanismSlugs ?? []);
	const suggestions: ContentSuggestion[] = [];

	const transitivePrereqs = (slug: string): Set<string> => {
		const seen = new Set<string>();
		const stack = [...(chaptersBySlug.get(slug)?.prerequisites ?? [])];
		while (stack.length) {
			const current = stack.pop();
			if (!current) continue;
			if (seen.has(current)) continue;
			seen.add(current);
			const prereqs = chaptersBySlug.get(current)?.prerequisites ?? [];
			stack.push(...prereqs);
		}
		return seen;
	};

	const dependsOn = (from: string, to: string): boolean =>
		transitivePrereqs(from).has(to);

	// Chapters that introduce each mechanism, keyed to first (ordered) introducer.
	// Root chapters survey mechanisms rather than introducing them, so they are
	// excluded: a mechanism declared only in the overview is not "introduced" there.
	const introducers = new Map<string, ChapterRecord[]>();
	for (const chapter of options.chapters) {
		if (isRootChapter(chapter)) continue;
		for (const mechanism of chapter.mechanisms) {
			if (!knownMechanisms.has(mechanism)) continue;
			const list = introducers.get(mechanism) ?? [];
			list.push(chapter);
			introducers.set(mechanism, list);
		}
	}

	const referencedMechanisms = new Set<string>();
	for (const chapter of options.chapters) {
		for (const mechanism of chapter.mechanisms) {
			referencedMechanisms.add(mechanism);
			if (!knownMechanisms.has(mechanism)) {
				suggestions.push({
					category: "prerequisite-edge",
					severity: "info",
					book: options.book,
					file: chapter.file ?? chapter.slug,
					message: `Chapter "${chapter.title}" references mechanism "${mechanism}" which is not registered.`,
					nextAction:
						"Register the mechanism, or fix the slug if it was a typo.",
					evidence: { chapter: chapter.slug, mechanism },
				});
				continue;
			}

			// Root chapters are entry points; they are not required to sequence
			// against the mechanisms they survey.
			if (isRootChapter(chapter)) continue;

			for (const introducer of introducers.get(mechanism) ?? []) {
				if (introducer.slug === chapter.slug) continue;
				if (chapter.prerequisites.includes(introducer.slug)) continue;
				if (dependsOn(introducer.slug, chapter.slug)) continue;

				suggestions.push({
					category: "prerequisite-edge",
					severity: "advisory",
					book: options.book,
					file: chapter.file ?? chapter.slug,
					message: `Chapter "${chapter.title}" relies on mechanism "${mechanism}" but does not list "${introducer.title}" as a prerequisite.`,
					nextAction: `Add "${introducer.slug}" to prerequisites of "${chapter.slug}" so readers meet the mechanism before relying on it.`,
					evidence: {
						chapter: chapter.slug,
						mechanism,
						introducedIn: introducer.slug,
					},
				});
			}
		}
	}

	for (const chapter of options.chapters) {
		if (!chapter.body) continue;
		for (const mechanism of knownMechanisms) {
			if (chapter.mechanisms.includes(mechanism)) continue;
			if (
				!new RegExp(
					`\\b${mechanism.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
				).test(chapter.body)
			)
				continue;
			suggestions.push({
				category: "prerequisite-edge",
				severity: "advisory",
				book: options.book,
				file: chapter.file ?? chapter.slug,
				message: `Chapter "${chapter.title}" references mechanism "${mechanism}" in prose but does not declare it in mechanisms frontmatter.`,
				nextAction: `Add "${mechanism}" to the mechanisms list of "${chapter.slug}" so the reading graph registers the dependency.`,
				evidence: {
					chapter: chapter.slug,
					mechanism,
					proseReference: true,
				},
			});
		}
	}

	for (const mechanism of knownMechanisms) {
		if (referencedMechanisms.has(mechanism)) continue;
		suggestions.push({
			category: "prerequisite-edge",
			severity: "advisory",
			book: options.book,
			message: `Mechanism "${mechanism}" is registered but no chapter lists it.`,
			nextAction:
				"Add it to a chapter's mechanisms so readers meet it, or remove the registration if it is dead content.",
			evidence: { mechanism, unreferenced: true },
		});
	}

	for (const [mechanism, introducingChapters] of introducers) {
		for (const introducer of introducingChapters) {
			const usedElsewhere = options.chapters.some(
				(c) => c.slug !== introducer.slug && c.mechanisms.includes(mechanism),
			);
			if (usedElsewhere) continue;
			suggestions.push({
				category: "prerequisite-edge",
				severity: "info",
				book: options.book,
				file: introducer.file ?? introducer.slug,
				message: `Mechanism "${mechanism}" is introduced in "${introducer.title}" but referenced by no other chapter.`,
				nextAction:
					"Either reference it in the relevant chapters, or remove it to avoid an orphan mechanism.",
				evidence: { mechanism, introducedIn: introducer.slug },
			});
		}
	}

	return suggestions;
};
