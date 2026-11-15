import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBookExportData } from "./book-export-data";
import { buildBookJsonBundle, exportBookJson } from "./json-export";
import { buildSkillPack, exportBookSkills } from "./skill-export";

const dirs: string[] = [];
const tempDir = () => {
	const dir = mkdtempSync(join(tmpdir(), "bookkit-agent-export-"));
	dirs.push(dir);
	return dir;
};

afterEach(() => {
	while (dirs.length > 0) {
		rmSync(dirs.pop() as string, { recursive: true, force: true });
	}
});

describe("buildBookJsonBundle", () => {
	it("produces a deterministic, versioned JSON bundle with graph edges", async () => {
		const data = await loadBookExportData("on-call");
		const a = buildBookJsonBundle(data);
		const b = buildBookJsonBundle(data);

		expect(a.schemaVersion).toBe(1);
		expect(a.version).toBe(b.version);
		expect(a.book.slug).toBe("on-call");
		expect(a.book.frame?.slug).toBe("runbook");
		expect(a.mechanisms.length).toBeGreaterThan(0);
		expect(a.tools.length).toBeGreaterThan(0);
		expect(a.graph.mechanismTools.length).toBe(a.tools.length);
	});

	it("writes book.json to a custom path", async () => {
		const out = join(tempDir(), "custom-book.json");
		const result = await exportBookJson("on-call", out);
		expect("error" in result).toBe(false);
		if ("error" in result) return;
		expect(existsSync(out)).toBe(true);
		const parsed = JSON.parse(readFileSync(out, "utf8"));
		expect(parsed.version).toBe(result.bundle.version);
	});
});

describe("buildSkillPack", () => {
	it("emits SKILL.md with YAML frontmatter and references/", async () => {
		const data = await loadBookExportData("on-call");
		const pack = buildSkillPack(data);

		expect(pack["SKILL.md"]).toMatch(/^---\nname: "on-call"\ndescription: "/);
		expect(pack["SKILL.md"]).toContain("references/mechanisms.md");
		expect(pack["SKILL.md"]).toContain("references/tools.md");
		expect(pack["references/mechanisms.md"]).toContain("## ");
		expect(pack["references/tools.md"]).toContain("**Steps:**");
	});

	it("writes the skill directory to disk", async () => {
		const dir = join(tempDir(), "on-call-skill");
		const result = await exportBookSkills("on-call", dir);
		expect("error" in result).toBe(false);
		if ("error" in result) return;
		expect(existsSync(join(dir, "SKILL.md"))).toBe(true);
		expect(existsSync(join(dir, "references", "mechanisms.md"))).toBe(true);
		expect(existsSync(join(dir, "references", "tools.md"))).toBe(true);
	});
});
