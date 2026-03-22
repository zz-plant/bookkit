import type { ReleaseNote } from "@bookkit/astro-bookkit";

import { bookRuntime } from "./book-runtime";

export const { releaseModules, getReleaseNotes, getVersionEntries } = bookRuntime;

export type { ReleaseNote };
