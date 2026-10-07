import {
	createReleaseNotes,
	type ReleaseModule,
	type ReleaseNote,
} from "../releases/notes";
import {
	type BookVersionEntry,
	createVersionEntries,
} from "../releases/versions";

export type BookVersionEntryOptions = {
	latestVersion?: string;
	latestLabel?: string;
};

export const createReleaseNotesFromModules = (
	modules: Record<string, ReleaseModule>,
): ReleaseNote[] => {
	return createReleaseNotes(modules);
};

export const createBookVersionEntries = (
	releases: ReleaseNote[],
	options: BookVersionEntryOptions = {},
): BookVersionEntry[] => {
	if (!releases.length) return [];
	const latestVersion = options.latestVersion ?? releases[0].version;
	return createVersionEntries(releases, {
		latestVersion,
		latestLabel: options.latestLabel ?? "Latest",
	});
};

export const createBookVersionEntriesFromReleaseModules = (
	modules: Record<string, ReleaseModule>,
	options: BookVersionEntryOptions = {},
): BookVersionEntry[] => {
	const releases = createReleaseNotes(modules);
	return createBookVersionEntries(releases, options);
};
