import { existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../_lib";

/**
 * Marks a standalone project made by create-bookkit, and records the engine
 * version it vendors. Such a project has no Biome, engine tests, or
 * architecture doc, so `verify` leaves those gates out there.
 */
export const PROJECT_STAMP = "bookkit.json";

export const isStandaloneProject = (root: string = repoRoot()): boolean =>
	existsSync(join(root, PROJECT_STAMP));
