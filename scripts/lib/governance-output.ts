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
