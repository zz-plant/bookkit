import type { MechanismRecord } from "./mechanism-overlap";
import type { ContentSuggestion } from "./types";

export type ToolRecord = {
	slug: string;
	mechanism: string;
	name?: string;
	title?: string;
	owner?: string;
	reviewEveryDays?: number;
	drills?: string[];
	satisfies?: string[];
	escalation?: { to: string; when: string; withinHours?: number };
	file?: string;
};

export type RunbookCoverageOptions = {
	book: string;
	/** The book's configured frame slug. Runbook checks only run for "runbook". */
	frame?: string;
	mechanisms: MechanismRecord[];
	tools: ToolRecord[];
};

export type AuditRunbookCoverageOptions = RunbookCoverageOptions;

export type ComplianceRow = {
	control: string;
	mechanism: string;
	tools: string[];
	drillReady: boolean;
};

export type ComplianceSummary = {
	total: number;
	covered: number;
	uncoveredControls: string[];
};

export const deriveComplianceMatrix = (
	mechanisms: MechanismRecord[],
	tools: ToolRecord[],
): ComplianceRow[] => {
	const toolsByMechanism = new Map<string, ToolRecord[]>();
	const satisfiesByMechanism = new Map<string, string[]>();

	for (const tool of tools) {
		const list = toolsByMechanism.get(tool.mechanism) ?? [];
		list.push(tool);
		toolsByMechanism.set(tool.mechanism, list);
	}

	for (const mechanism of mechanisms) {
		const controls = mechanism.satisfies ?? [];
		if (controls.length > 0) {
			satisfiesByMechanism.set(mechanism.slug, controls);
		}
	}

	const rows: ComplianceRow[] = [];

	for (const [mechanism, controls] of satisfiesByMechanism) {
		const mechanismTools = toolsByMechanism.get(mechanism) ?? [];
		for (const control of controls) {
			rows.push({
				control,
				mechanism,
				tools: mechanismTools.map((t) => t.slug),
				drillReady:
					mechanismTools.length > 0 &&
					mechanismTools.every((t) => (t.drills?.length ?? 0) > 0),
			});
		}
	}

	return rows;
};

export const summarizeCompliance = (
	rows: ComplianceRow[],
): ComplianceSummary => {
	const controlsWithTools = new Set(
		rows.filter((row) => row.tools.length > 0).map((row) => row.control),
	);
	const uncoveredControls = Array.from(
		new Set(
			rows.filter((row) => row.tools.length === 0).map((row) => row.control),
		),
	);

	return {
		total: rows.length,
		covered: rows.filter((row) => controlsWithTools.has(row.control)).length,
		uncoveredControls,
	};
};

export type ReleaseRecord = {
	version: string;
	date: string;
	title?: string;
	changedSections?: string[];
};

/**
 * Release-diff enrichment: joins the HEAD compliance matrix with the release
 * narrative. Fully computable at HEAD — it never reconstructs past state.
 * A toolkit release that leaves a declared control undrilled at HEAD is a
 * drift signal (the release claimed tooling work without closing the loop).
 */
export const auditReleaseControlDrift = (
	rows: ComplianceRow[],
	releases: ReleaseRecord[],
	book: string,
): ContentSuggestion[] => {
	const suggestions: ContentSuggestion[] = [];
	const isRunbookSection = (sections: string[] | undefined): boolean =>
		(sections ?? []).includes("toolkit") ||
		(sections ?? []).includes("mechanisms");

	const toolkitReleases = releases.filter((r) =>
		isRunbookSection(r.changedSections),
	);
	if (toolkitReleases.length === 0) return suggestions;

	const undrilledControls = rows.filter((row) => !row.drillReady);

	if (undrilledControls.length === 0) {
		suggestions.push({
			category: "runbook-coverage",
			severity: "info",
			book,
			message:
				"All toolkit releases keep every declared control drilled at HEAD.",
			nextAction: "No action needed; compliance evidence is current.",
			evidence: {
				releases: toolkitReleases.map((r) => r.version),
				controls: rows.map((r) => r.control),
			},
		});
		return suggestions;
	}

	for (const release of toolkitReleases) {
		for (const row of undrilledControls) {
			suggestions.push({
				category: "runbook-coverage",
				severity: "warning",
				book,
				message: `Release ${release.version} claims runbook section changes, but control "${row.control}" remains undrilled at HEAD (tool: ${row.tools.join(", ") || "none"}).`,
				nextAction:
					"Add a drill to the satisfying tool or mark the control not-applicable in its mechanism.",
				evidence: {
					release: release.version,
					control: row.control,
					mechanism: row.mechanism,
					tools: row.tools,
				},
			});
		}
	}

	return suggestions;
};

export const auditRunbookCoverage = (
	options: RunbookCoverageOptions,
): ContentSuggestion[] => {
	if (options.frame !== "runbook") return [];

	const toolsByMechanism = new Map<string, ToolRecord[]>();
	for (const tool of options.tools) {
		const list = toolsByMechanism.get(tool.mechanism) ?? [];
		list.push(tool);
		toolsByMechanism.set(tool.mechanism, list);
	}

	const suggestions: ContentSuggestion[] = [];

	for (const mechanism of options.mechanisms) {
		const mechanismTools = toolsByMechanism.get(mechanism.slug) ?? [];

		if (mechanismTools.length === 0) {
			suggestions.push({
				category: "runbook-coverage",
				severity: "warning",
				book: options.book,
				message: `Control mechanism "${mechanism.slug}" has no tool that operationalizes it.`,
				nextAction:
					"Add a toolkit primitive bound to this mechanism, or mark the control as not applicable in its own record.",
				evidence: { mechanism: mechanism.slug },
			});
			continue;
		}

		if ((mechanism.satisfies ?? []).length === 0) {
			suggestions.push({
				category: "runbook-coverage",
				severity: "advisory",
				book: options.book,
				message: `Mechanism "${mechanism.slug}" does not declare which controls it satisfies.`,
				nextAction:
					"Add a satisfies list of control IDs so the compliance matrix can map coverage.",
				evidence: { mechanism: mechanism.slug },
			});
		}

		for (const tool of mechanismTools) {
			if ((tool.satisfies ?? []).length === 0) {
				suggestions.push({
					category: "runbook-coverage",
					severity: "advisory",
					book: options.book,
					file: tool.file,
					message: `Tool "${tool.slug}" does not declare the controls it satisfies.`,
					nextAction:
						"Add a satisfies list of control IDs mirroring the mechanism's mapping.",
					evidence: { tool: tool.slug, mechanism: mechanism.slug },
				});
			}

			if ((tool.drills ?? []).length === 0) {
				suggestions.push({
					category: "runbook-coverage",
					severity: "advisory",
					book: options.book,
					file: tool.file,
					message: `Tool "${tool.slug}" has no drills, so the procedure cannot be verified.`,
					nextAction:
						"Add at least one concrete, schedulable drill exercise to the tool frontmatter.",
					evidence: { tool: tool.slug, mechanism: mechanism.slug },
				});
			}

			if (!tool.owner) {
				suggestions.push({
					category: "runbook-coverage",
					severity: "advisory",
					book: options.book,
					file: tool.file,
					message: `Tool "${tool.slug}" has no declared owner.`,
					nextAction:
						"Add an owner to the tool frontmatter so accountability for the procedure is explicit.",
					evidence: { tool: tool.slug, mechanism: mechanism.slug },
				});
			}

			if (!tool.escalation) {
				suggestions.push({
					category: "runbook-coverage",
					severity: "advisory",
					book: options.book,
					file: tool.file,
					message: `Tool "${tool.slug}" has no escalation path for handoff.`,
					nextAction:
						"Add an escalation block naming the target, the trigger, and the time window.",
					evidence: { tool: tool.slug, mechanism: mechanism.slug },
				});
			}
		}
	}

	return suggestions;
};
