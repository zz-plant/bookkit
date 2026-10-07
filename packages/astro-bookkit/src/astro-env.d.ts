/// <reference types="astro/client" />

// What the engine's middleware puts on `Astro.locals`. Book apps load this
// through `"types": ["@bookkit/astro-bookkit/env"]` in their tsconfig.

import type { PreviewAccessState } from "./preview/access";

declare global {
	namespace App {
		interface Locals {
			originalUrl?: string;
			bookVersion?: string;
			locale?: string;
			localePath?: string;
			preview?: PreviewAccessState;
		}
	}

	interface ImportMetaEnv {
		readonly SITE_URL?: string;
	}
}
