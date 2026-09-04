import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { requireArg, slugify } from "./_lib";

const rawBook = requireArg("--book");
const slug = slugify(rawBook);
const dryRun = process.argv.includes("--dry-run");

if (!slug) {
	console.error(
		`Invalid --book value "${rawBook}". Provide a value that slugifies to at least one alphanumeric character.`,
	);
	process.exit(1);
}

if (slug !== rawBook) {
	console.warn(`⚠️ Normalizing book slug from "${rawBook}" to "${slug}".`);
}

const root = process.cwd();
const targetDir = join(root, "apps", slug);

if (!existsSync(targetDir)) {
	console.error(`Book app does not exist: apps/${slug}`);
	process.exit(1);
}

if (dryRun) {
	console.log(`📝 Would remove: apps/${slug}`);
} else {
	rmSync(targetDir, { recursive: true, force: true });
	console.log(`✅ Removed book app: apps/${slug}`);
}

console.log(
	"Root package.json is untouched. Books are discovered dynamically via bun run bookkit.",
);
