import { listBookDirs } from "../_lib";
import { type LoadedBookContent, loadBookContent } from "./load-book";

export type BureaucraticVector =
	| "weaponized-compliance"
	| "moral-deflection"
	| "administrative-reset"
	| "responsibility-diffusion"
	| "escalation-chilling";

export type AttackVectorVulnerability = {
	vector: BureaucraticVector;
	title: string;
	description: string;
	stepAffected?: string;
	institutionalMove: string;
	hardenedDefense: {
		failureMode: string;
		counterDemand: string;
	};
};

export type RedteamReport = {
	toolSlug: string;
	toolName: string;
	mechanismSlug: string;
	book: string;
	timeboxMinutes: number;
	resilienceScore: number;
	coveredVectors: BureaucraticVector[];
	vulnerabilities: AttackVectorVulnerability[];
	recommendedFailureLooksLike: string[];
	recommendedLegitimateDemand: string[];
	simulatedDialogue: Array<{
		speaker: "Operator" | "Institution";
		text: string;
		tactic?: string;
	}>;
};

const BUREAUCRATIC_TACTICS: Record<
	BureaucraticVector,
	{
		title: string;
		description: string;
		institutionalMove: string;
		failureModeTemplate: (_tool: string) => string;
		counterDemandTemplate: (_tool: string) => string;
		keywords: string[];
	}
> = {
	"weaponized-compliance": {
		title: "Weaponized Compliance & Paperwork Mazes",
		description:
			"The institution redirects the request into high-friction procedural forms or unmonitored ticketing queues.",
		institutionalMove:
			"Please submit request form 42-A and wait 30 business days for committee intake.",
		failureModeTemplate: (_tool) =>
			`The request is shunted into an unmonitored ticket queue or committee backlog without a committed review date.`,
		counterDemandTemplate: (_tool) =>
			`Under what published policy is this review mandated, and what is the binding response deadline?`,
		keywords: ["form", "policy", "ticket", "queue", "process", "compliance"],
	},
	"moral-deflection": {
		title: "Moral Deflection & Tone Policing",
		description:
			"The institution reframes structural misalignment as a personal attitude, communication, or teamwork issue.",
		institutionalMove:
			"We are all one team here; why are you taking such an adversarial and bureaucratic posture?",
		failureModeTemplate: (_tool) =>
			`System-level friction is treated as personal friction or lack of trust rather than an engineered invariant.`,
		counterDemandTemplate: (_tool) =>
			`Let's separate personal intent from system mechanics: what objective threshold determines this action?`,
		keywords: [
			"trust",
			"team",
			"communication",
			"collaborative",
			"tone",
			"culture",
		],
	},
	"administrative-reset": {
		title: "Administrative Reset & Queue Attrition",
		description:
			"The institution forces the operator to restart intake or claims past agreements were provisional/obsolete.",
		institutionalMove:
			"Due to recent reorganizations/updates, you will need to re-verify this from the beginning.",
		failureModeTemplate: (_tool) =>
			`Staff require restarting the entire verification process from scratch without citing missing evidence.`,
		counterDemandTemplate: (_tool) =>
			`Which specific item in our prior verified submission is invalid under current policy?`,
		keywords: [
			"restart",
			"reset",
			"re-verify",
			"update",
			"expired",
			"start over",
		],
	},
	"responsibility-diffusion": {
		title: "Responsibility Diffusion & Unnamed Committee",
		description:
			"Decisions are attributed to impersonal committees, consensus, or algorithms so no single human has the lever.",
		institutionalMove:
			"This was a leadership consensus decision; no individual person has the authority to make an exception.",
		failureModeTemplate: (_tool) =>
			`You are given high responsibility for the outcome while decision levers remain in an unnamed committee.`,
		counterDemandTemplate: (_tool) =>
			`Who is the single named individual with authority to sign off on an operational exception?`,
		keywords: [
			"committee",
			"consensus",
			"leadership",
			"policy",
			"system",
			"algorithm",
		],
	},
	"escalation-chilling": {
		title: "Escalation Chilling & Implicit Retaliation",
		description:
			"The institution implies that formal escalation will damage relationships or career standing.",
		institutionalMove:
			"If you escalate this to the VP, it's going to make our group look disorganized and damage relationships.",
		failureModeTemplate: (_tool) =>
			`Escalation paths are treated as personal hostility rather than standard operational safeguards.`,
		counterDemandTemplate: (_tool) =>
			`Per our escalation policy, this threshold requires manager notification to protect team commitments.`,
		keywords: [
			"escalate",
			"vp",
			"relationship",
			"reputation",
			"hostile",
			"career",
		],
	},
};

/**
 * Red-teams a tool's steps against institutional bureaucracy and produces
 * hardened additions for failureLooksLike and legitimateDemand.
 */
export function redteamTool(
	toolSlug: string,
	options: { book?: string } = {},
): RedteamReport {
	const books = options.book ? [options.book] : listBookDirs();

	let foundTool: LoadedBookContent["tools"][number] | undefined;
	let foundBook: string = "";
	let foundContent: LoadedBookContent | undefined;

	for (const book of books) {
		const content = loadBookContent(book);
		const match = content.tools.find(
			(t) =>
				t.slug === toolSlug ||
				t.slug.endsWith(`--${toolSlug}`) ||
				t.slug.includes(toolSlug),
		);
		if (match) {
			foundTool = match;
			foundBook = book;
			foundContent = content;
			break;
		}
	}

	if (!foundTool || !foundContent) {
		throw new Error(
			`Tool "${toolSlug}" not found in books: ${books.join(", ")}`,
		);
	}

	const existingFailures = foundTool.failureLooksLike || [];
	const existingDemands = foundTool.legitimateDemand || [];
	const toolSteps = foundTool.steps || [];

	const coveredVectors: BureaucraticVector[] = [];
	const vulnerabilities: AttackVectorVulnerability[] = [];

	for (const [vectorKey, config] of Object.entries(
		BUREAUCRATIC_TACTICS,
	) as Array<
		[BureaucraticVector, (typeof BUREAUCRATIC_TACTICS)[BureaucraticVector]]
	>) {
		// Check if existing failureLooksLike or legitimateDemand already guards this
		const isCovered = config.keywords.some(
			(kw) =>
				existingFailures.some((f) => f.toLowerCase().includes(kw)) ||
				existingDemands.some((d) => d.toLowerCase().includes(kw)),
		);

		if (isCovered) {
			coveredVectors.push(vectorKey);
		} else {
			// Find step most vulnerable
			const vulnerableStep =
				toolSteps.find(
					(step) =>
						step.toLowerCase().includes("ask") ||
						step.toLowerCase().includes("request") ||
						step.toLowerCase().includes("escalate") ||
						step.toLowerCase().includes("state") ||
						step.toLowerCase().includes("submit"),
				) || toolSteps[0];

			vulnerabilities.push({
				vector: vectorKey,
				title: config.title,
				description: config.description,
				stepAffected: vulnerableStep,
				institutionalMove: config.institutionalMove,
				hardenedDefense: {
					failureMode: config.failureModeTemplate(
						foundTool.name || foundTool.slug,
					),
					counterDemand: config.counterDemandTemplate(
						foundTool.name || foundTool.slug,
					),
				},
			});
		}
	}

	const resilienceScore = Math.round(
		(coveredVectors.length / Object.keys(BUREAUCRATIC_TACTICS).length) * 100,
	);

	const recommendedFailureLooksLike = vulnerabilities.map(
		(v) => v.hardenedDefense.failureMode,
	);
	const recommendedLegitimateDemand = vulnerabilities.map(
		(v) => v.hardenedDefense.counterDemand,
	);

	// Construct simulated adversarial dialogue
	const simulatedDialogue: RedteamReport["simulatedDialogue"] = [
		{
			speaker: "Operator",
			text: `Applying tool "${foundTool.name || foundTool.slug}": ${toolSteps[0] || "Asserting operational boundary."}`,
		},
	];

	if (vulnerabilities.length > 0) {
		const topVuln = vulnerabilities[0];
		simulatedDialogue.push({
			speaker: "Institution",
			text: topVuln.institutionalMove,
			tactic: topVuln.title,
		});
		simulatedDialogue.push({
			speaker: "Operator",
			text: topVuln.hardenedDefense.counterDemand,
			tactic: "Hardened Legitimate Demand",
		});
	}

	return {
		toolSlug: foundTool.slug,
		toolName: foundTool.name || foundTool.slug,
		mechanismSlug: foundTool.mechanism,
		book: foundBook,
		timeboxMinutes: foundTool.timeboxMinutes || 10,
		resilienceScore,
		coveredVectors,
		vulnerabilities,
		recommendedFailureLooksLike,
		recommendedLegitimateDemand,
		simulatedDialogue,
	};
}
