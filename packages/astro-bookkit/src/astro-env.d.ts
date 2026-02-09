/// <reference types="astro/client" />

import type { PreviewAccessState } from "./preview/access";

declare module "astro" {
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

export {};
