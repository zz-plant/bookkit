export type ValidationSeverity = "error" | "warning";

export type ValidationGateLevel = "advisory" | "blocking";

export type ValidationLocation = {
	module: string;
	file?: string;
};

export type NormalizedErrorPayload = {
	machineCode: string;
	humanSummary: string;
	location: ValidationLocation;
	failingRule: string;
	nextAction: string;
	severity: ValidationSeverity;
	gateLevel: ValidationGateLevel;
};
