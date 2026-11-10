import { probeMechanismBoundary } from "../boundary-probe";
import { readFocusBook } from "../cli";
import { redteamTool } from "../redteam-engine";
import { triageIncident } from "../triage-engine";
import { args, books } from "./context";

/**
 * `bookkit triage`, `redteam`, and `probe`: an incident, a tool, or a pair of
 * mechanisms, tested against the corpus.
 */

/**
 * `triage "<incident>" [book] [--semantic] [--json]`: the mechanisms an
 * incident matches, and a ≤10-minute action.
 */
export async function triageCommand() {
	const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
	const query = positional[0];
	if (!query) {
		console.error(
			'Usage: bun run bookkit triage "<incident or symptom description>" [book] [--semantic] [--json]',
		);
		process.exit(1);
	}
	const bookArg = positional[1] || (readFocusBook(books) ?? undefined);
	const targetBooks = bookArg ? [bookArg] : books;
	const semantic = args.includes("--semantic");

	const result = await triageIncident(query, {
		books: targetBooks,
		semantic,
		limit: 3,
	});

	if (args.includes("--json")) {
		console.log(JSON.stringify(result, null, 2));
		process.exit(0);
	}

	console.log(`\nTriage Diagnosis for: "${query}"\n${"=".repeat(60)}`);
	if (result.candidates.length === 0) {
		console.log(
			"No matching mechanism found in scope. Check spelling or try broader terms.",
		);
		process.exit(0);
	}

	console.log("\nTop Candidate Mechanisms:");
	for (const [i, c] of result.candidates.entries()) {
		console.log(
			`  ${i + 1}. [${c.book}] ${c.title} (${c.slug}) — Score: ${Math.round(c.score * 100)}%`,
		);
		if (c.definition) {
			console.log(`     Definition: ${c.definition}`);
		}
		if (c.matchedTerms.length > 0) {
			console.log(`     Matched: ${c.matchedTerms.join(", ")}`);
		}
	}

	if (result.discriminatingQuestion) {
		const dq = result.discriminatingQuestion;
		console.log(`\nDiscriminating Test:\n  ${dq.prompt}`);
		console.log(
			`  - If true: ${dq.candidateA.title} (${dq.candidateA.criteria})`,
		);
		console.log(
			`  - If false: ${dq.candidateB.title} (${dq.candidateB.criteria})`,
		);
	}

	if (result.action) {
		const act = result.action;
		console.log(
			`\n<= 10-Minute Runbook Action:\n  Tool: ${act.toolName} (Mechanism: ${act.mechanismSlug})`,
		);
		console.log(`  Timebox: ${act.timeboxMinutes} minutes`);
		if (act.trigger) console.log(`  Trigger: ${act.trigger}`);
		console.log("  Steps:");
		for (const step of act.steps) {
			console.log(`    - ${step}`);
		}
		if (act.failureLooksLike.length > 0) {
			console.log("  Failure Looks Like (Warning Flags):");
			for (const fail of act.failureLooksLike) {
				console.log(`    ! ${fail}`);
			}
		}
		if (act.legitimateDemand.length > 0) {
			console.log("  Legitimate Demand (Contestable Asks):");
			for (const demand of act.legitimateDemand) {
				console.log(`    > ${demand}`);
			}
		}
	}
	console.log();
	process.exit(0);
}

/**
 * `redteam <tool> [book] [--json]`: a tool's steps against institutional
 * evasion.
 */
export function redteamCommand() {
	const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
	const toolArg = positional[0];
	if (!toolArg) {
		console.error("Usage: bun run bookkit redteam <tool> [book] [--json]");
		process.exit(1);
	}
	const bookArg = positional[1] || (readFocusBook(books) ?? undefined);
	try {
		const report = redteamTool(toolArg, { book: bookArg });
		if (args.includes("--json")) {
			console.log(JSON.stringify(report, null, 2));
			process.exit(0);
		}

		console.log(
			`\nRed-Team Stress Test: ${report.toolName} [${report.book}]\n${"=".repeat(60)}`,
		);
		console.log(`Adversarial Resilience Score: ${report.resilienceScore}%`);
		console.log(
			`Covered Vectors: ${report.coveredVectors.join(", ") || "None"}`,
		);

		if (report.vulnerabilities.length > 0) {
			console.log(
				`\nVulnerabilities to Bureaucratic Evasion (${report.vulnerabilities.length}):`,
			);
			for (const v of report.vulnerabilities) {
				console.log(`  * ${v.title}`);
				console.log(`    Institutional Move: "${v.institutionalMove}"`);
				console.log(
					`    Hardened Counter-Demand: "${v.hardenedDefense.counterDemand}"`,
				);
			}

			console.log("\nRecommended Hardened Additions for Tool Definition:");
			console.log("  failureLooksLike:");
			for (const f of report.recommendedFailureLooksLike) {
				console.log(`    - "${f}"`);
			}
			console.log("  legitimateDemand:");
			for (const d of report.recommendedLegitimateDemand) {
				console.log(`    - "${d}"`);
			}
		} else {
			console.log(
				"\nNo high-severity bureaucratic evasion vectors uncovered. Tool is well-hardened.",
			);
		}

		if (report.simulatedDialogue.length > 0) {
			console.log("\nSimulated Adversarial Dialogue:");
			for (const turn of report.simulatedDialogue) {
				const tactic = turn.tactic ? ` [${turn.tactic}]` : "";
				console.log(`  ${turn.speaker}${tactic}: ${turn.text}`);
			}
		}
		console.log();
		process.exit(0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

/**
 * `probe <slugA> <slugB> [book] [--json]`: edge cases on the boundary
 * between two mechanisms.
 */
export function probeCommand() {
	const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
	const slugA = positional[0];
	const slugB = positional[1];
	if (!slugA || !slugB) {
		console.error(
			"Usage: bun run bookkit probe <slugA> <slugB> [book] [--json]",
		);
		process.exit(1);
	}
	const bookArg = positional[2] || (readFocusBook(books) ?? undefined);
	try {
		const report = probeMechanismBoundary(slugA, slugB, { book: bookArg });
		if (args.includes("--json")) {
			console.log(JSON.stringify(report, null, 2));
			process.exit(0);
		}

		console.log(
			`\nSynthetic Boundary Probe: ${report.mechanismA.title} vs ${report.mechanismB.title}\n${"=".repeat(60)}`,
		);
		console.log(`Primary Divergence Axis: ${report.divergenceAxis}`);
		console.log(
			`Semantic Ambiguity Score: ${Math.round(report.ambiguityScore * 100)}%`,
		);

		console.log("\nSynthetic Edge-Case Vignettes:");
		for (const [i, v] of report.vignettes.entries()) {
			console.log(`  ${i + 1}. ${v.title} [Verdict: ${v.verdict}]`);
			console.log(`     Scenario: ${v.scenario}`);
			console.log(`     Rationale: ${v.rationale}`);
		}

		console.log("\nSharpening Recommendations:");
		if (report.sharpeningRecommendations.forA.suggestedIsNot) {
			console.log(`  For ${report.mechanismA.slug}:`);
			console.log(
				`    isNot: "${report.sharpeningRecommendations.forA.suggestedIsNot}"`,
			);
		}
		if (report.sharpeningRecommendations.forB.suggestedIsNot) {
			console.log(`  For ${report.mechanismB.slug}:`);
			console.log(
				`    isNot: "${report.sharpeningRecommendations.forB.suggestedIsNot}"`,
			);
		}
		console.log();
		process.exit(0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
