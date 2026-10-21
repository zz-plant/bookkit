import {
	type BookConfig,
	type ReadHubFirstChapter,
	resolveReadHubConfig,
} from "../book";
import { bookConfig } from "./runtime";

// Read `readHub` through BookConfig, so leaving it out of book.config.ts still
// type-checks.
const config: BookConfig = bookConfig;

/** The reading hub's copy; the default cards end with `firstChapter`. */
export const readHubConfigFor = (firstChapter?: ReadHubFirstChapter) =>
	resolveReadHubConfig(config.readHub, { firstChapter });
