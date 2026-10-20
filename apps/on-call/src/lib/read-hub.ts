import { type BookConfig, resolveReadHubConfig } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

// Read `readHub` through BookConfig, so leaving it out of book.config.ts still
// type-checks.
const config: BookConfig = bookConfig;

export const readHubConfig = resolveReadHubConfig(config.readHub);
