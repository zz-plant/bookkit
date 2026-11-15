import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../_lib";
import { type BookExportData, loadBookExportData } from "./book-export-data";

const quoteYaml = (value: string): string => JSON.stringify(value);

const escapeCell = (value: string): string =>
	value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

const buildMechanismsReference = (data: BookExportData): string => {
	const lines: string[] = [`# ${data.meta.title} — Mechanisms`, ""];
	if (data.mechanisms.length === 0) {
		lines.push("No mechanisms registered.");
		return `${lines.join("\n")}\n`;
	}
	for (const m of data.mechanisms) {
		lines.push(`## ${m.title} (\`${m.slug}\`)`, "");
		if (m.definition) lines.push(m.definition, "");
		if (m.is.length > 0) {
			lines.push("**Applies when (`is`):**");
			for (const item of m.is) lines.push(`- ${item}`);
			lines.push("");
		}
		if (m.isNot.length > 0) {
			lines.push("**Does not apply when (`isNot`):**");
			for (const item of m.isNot) lines.push(`- ${item}`);
			lines.push("");
		}
		if (m.predictions.length > 0) {
			lines.push("**Predictions:**");
			for (const item of m.predictions) lines.push(`- ${item}`);
			lines.push("");
		}
		if (m.tests.length > 0) {
			lines.push("**Tests:**");
			for (const item of m.tests) lines.push(`- ${item}`);
			lines.push("");
		}
		if (m.body) lines.push(m.body, "");
	}
	return `${lines.join("\n").trimEnd()}\n`;
};

const buildToolsReference = (data: BookExportData): string => {
	const lines: string[] = [
		`# ${data.meta.title} — Toolkit Actions (≤10 min)`,
		"",
	];
	if (data.tools.length === 0) {
		lines.push("No toolkit actions registered.");
		return `${lines.join("\n")}\n`;
	}
	for (const t of data.tools) {
		lines.push(`## ${t.name} (\`${t.slug}\`)`, "");
		const meta: string[] = [
			`- **Mechanism:** \`${t.mechanism}\``,
			`- **Timebox:** ${t.timeboxMinutes} minutes`,
		];
		if (t.trigger) meta.push(`- **Trigger:** ${t.trigger}`);
		if (t.owner) meta.push(`- **Owner:** ${t.owner}`);
		lines.push(...meta, "");
		if (t.steps.length > 0) {
			lines.push("**Steps:**");
			for (const [idx, step] of t.steps.entries()) {
				lines.push(`${idx + 1}. ${step}`);
			}
			lines.push("");
		}
		if (t.failureLooksLike.length > 0) {
			lines.push("**Failure looks like:**");
			for (const item of t.failureLooksLike) lines.push(`- ${item}`);
			lines.push("");
		}
		if (t.legitimateDemand.length > 0) {
			lines.push("**Legitimate demand / exceptions:**");
			for (const item of t.legitimateDemand) lines.push(`- ${item}`);
			lines.push("");
		}
		if (t.escalation) {
			const within = t.escalation.withinHours
				? ` (within ${t.escalation.withinHours}h)`
				: "";
			lines.push(
				`**Escalation:** Escalate to \`${t.escalation.to}\` when ${t.escalation.when}${within}.`,
				"",
			);
		}
		if (t.body) lines.push(t.body, "");
	}
	return `${lines.join("\n").trimEnd()}\n`;
};

const buildExamplesReference = (data: BookExportData): string => {
	const lines: string[] = [`# ${data.meta.title} — Examples`, ""];
	for (const ex of data.examples) {
		lines.push(`## ${ex.title} (${ex.domain})`, "");
		lines.push(`- **Mechanism:** \`${ex.mechanism}\``, "");
		if (ex.body) lines.push(ex.body, "");
	}
	return `${lines.join("\n").trimEnd()}\n`;
};

const buildGlossaryReference = (data: BookExportData): string => {
	const lines: string[] = [`# ${data.meta.title} — Glossary`, ""];
	for (const entry of data.glossary) {
		lines.push(`## ${entry.term} (\`${entry.slug}\`)`, "");
		if (entry.definition) lines.push(entry.definition, "");
		if (entry.mechanism) lines.push(`- **Mechanism:** \`${entry.mechanism}\``);
		if (entry.aliases.length > 0)
			lines.push(`- **Aliases:** ${entry.aliases.join(", ")}`);
		if (entry.body) lines.push("", entry.body);
		lines.push("");
	}
	return `${lines.join("\n").trimEnd()}\n`;
};

/** Builds a portable Agent Skill pack (`SKILL.md` + `references/`) from book data. */
export function buildSkillPack(data: BookExportData): Record<string, string> {
	const frameLabel = data.meta.frame?.slug
		? `${data.meta.frame.slug} book`
		: "Bookkit book";
	const mechNames = data.mechanisms
		.slice(0, 5)
		.map((m) => m.title)
		.join(", ");
	const descriptionParts = [
		`Apply mechanisms and <=10-minute actions from ${data.meta.title} (${frameLabel}).`,
		data.meta.causalStance || undefined,
		mechNames ? `Covers: ${mechNames}.` : undefined,
	].filter(Boolean);

	const files: Record<string, string> = {
		"references/mechanisms.md": buildMechanismsReference(data),
		"references/tools.md": buildToolsReference(data),
	};
	if (data.examples.length > 0) {
		files["references/examples.md"] = buildExamplesReference(data);
	}
	if (data.glossary.length > 0) {
		files["references/glossary.md"] = buildGlossaryReference(data);
	}

	const skillLines: string[] = [
		"---",
		`name: ${quoteYaml(data.meta.slug)}`,
		`description: ${quoteYaml(descriptionParts.join(" "))}`,
		"---",
		"",
		`# ${data.meta.title}`,
		"",
	];
	if (data.meta.subtitle) skillLines.push(`*${data.meta.subtitle}*`, "");
	if (data.meta.causalStance) skillLines.push(data.meta.causalStance, "");
	if (data.meta.objectives.length > 0) {
		skillLines.push("## Objectives", "");
		for (const obj of data.meta.objectives) skillLines.push(`- ${obj}`);
		skillLines.push("");
	}

	skillLines.push(
		"## Workflow",
		"",
		"1. **Identify candidate mechanisms** from the table below and verify boundaries (`is` vs `isNot`) plus `tests` in [references/mechanisms.md](references/mechanisms.md).",
		"2. **Select a <=10-minute action** bound to that mechanism in [references/tools.md](references/tools.md).",
		"3. **Execute steps within the timebox**, checking `failureLooksLike` and `legitimateDemand` before acting, and follow `escalation` rules if triggered.",
		"",
	);

	if (data.mechanisms.length > 0) {
		skillLines.push(
			"## Mechanisms",
			"",
			"| Mechanism | Definition | Applies when (`is`) |",
			"| --- | --- | --- |",
		);
		for (const m of data.mechanisms) {
			skillLines.push(
				`| \`${m.slug}\` (${escapeCell(m.title)}) | ${escapeCell(m.definition)} | ${escapeCell(m.is.slice(0, 2).join("; "))} |`,
			);
		}
		skillLines.push("");
	}

	if (data.tools.length > 0) {
		skillLines.push(
			"## Toolkit Actions",
			"",
			"| Action | Mechanism | Timebox | Trigger |",
			"| --- | --- | --- | --- |",
		);
		for (const t of data.tools) {
			skillLines.push(
				`| \`${t.slug}\` (${escapeCell(t.name)}) | \`${t.mechanism}\` | ${t.timeboxMinutes}m | ${escapeCell(t.trigger ?? "")} |`,
			);
		}
		skillLines.push("");
	}

	skillLines.push("## References", "");
	skillLines.push(
		"- [Mechanisms, boundaries & tests](references/mechanisms.md)",
	);
	skillLines.push("- [Toolkit actions & escalations](references/tools.md)");
	if (files["references/examples.md"]) {
		skillLines.push("- [Domain examples](references/examples.md)");
	}
	if (files["references/glossary.md"]) {
		skillLines.push("- [Glossary](references/glossary.md)");
	}

	files["SKILL.md"] = `${skillLines.join("\n")}\n`;
	return files;
}

/** Writes `<book>`'s Agent Skill pack to disk. */
export async function exportBookSkills(
	book: string,
	outDir?: string,
): Promise<{ dir: string; files: string[] } | { error: string }> {
	const contentDir = join(repoRoot(), "apps", book, "src", "content", "book");
	if (!existsSync(contentDir)) {
		return { error: `No book "${book}" under apps/.` };
	}
	const data = await loadBookExportData(book);
	const pack = buildSkillPack(data);
	const dir =
		outDir ?? join(repoRoot(), "apps", book, "exports", "skills", book);
	const written: string[] = [];
	for (const [rel, content] of Object.entries(pack).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
		written.push(rel);
	}
	return { dir, files: written };
}
