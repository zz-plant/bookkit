import type { NormalizedErrorPayload } from "@bookkit/astro-bookkit/validators/normalized-error";

/** Shared output format consumed by both CLI --json flag and MCP tool handlers. */
export type GovernanceResult = {
	ok: boolean;
	exitCode: number;
	summary: string;
	errors: GovernanceFinding[];
	warnings: GovernanceFinding[];
};

export type GovernanceFinding = {
	message: string;
	location?: { file: string; line?: number };
	rule?: string;
};

/** Convert flat error/warning arrays into a structured result that
 *  maps each message to a relaxed NormalizedErrorPayload shape. */
export const buildGovernanceResult = (
	errors: string[],
	warnings: string[],
	scriptModule: string,
	rule: string,
	nextAction: string,
): GovernanceResult => {
	const findings = (items: string[]) =>
		items.map((message) => {
			const fileMatch = message.match(
				/(?:\/([^/\n]+\/[^/\n]+\/(?:src\/)?[^\n:]*))(?::(\d+))?$/m,
			);
			const finding: GovernanceFinding = { message };
			if (fileMatch?.[1]) {
				finding.location = { file: fileMatch[1] };
				if (fileMatch[2]) finding.location.line = Number(fileMatch[2]);
			}
			finding.rule = rule;
			return finding;
		});

	const hasErrors = errors.length > 0;
	return {
		ok: !hasErrors,
		exitCode: hasErrors ? 1 : 0,
		summary: hasErrors
			? `${errors.length} error(s), ${warnings.length} warning(s)`
			: `${warnings.length} warning(s)`,
		errors: findings(errors),
		warnings: findings(warnings),
	};
};

export const printGovernanceResult = (
	result: GovernanceResult,
	jsonMode: boolean,
) => {
	if (jsonMode) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		if (result.errors.length) {
			console.error(`\nERRORS (${result.errors.length})`);
			for (const e of result.errors) console.error(`- ${e.message}`);
		}
		if (result.warnings.length) {
			console.log(`\nWARNINGS (${result.warnings.length})`);
			for (const w of result.warnings) console.log(`- ${w.message}`);
		}
	}
	if (result.errors.length) process.exit(result.exitCode);
};
