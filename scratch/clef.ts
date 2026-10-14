/**
 * One way to ask Cloudflare's Clef decision models a question, shared by the
 * B1 probes in this folder. Sends through the Workers AI REST API when
 * CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set, and otherwise
 * through the signed-in `cf` CLI. Answers are cached by request, so a rerun
 * costs nothing.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../scripts/_lib";

export const CLEF_MODELS = ["clef", "clef-flash", "clef-omni"] as const;
export type ClefModel = (typeof CLEF_MODELS)[number];

/** Price per 1M input tokens; output is free. */
export const CLEF_PRICE: Record<ClefModel, number> = {
	clef: 0.24,
	"clef-flash": 0.038,
	"clef-omni": 0.15,
};

export type ClefAnswer = {
	noul?: number;
	choice?: string;
	score?: number;
	probabilities?: Record<string, number>;
	confidence?: number;
};

export type ClefResult = {
	answers: Record<string, ClefAnswer>;
	inputTokens: number;
	cached: boolean;
};

export const parseClefModel = (args: string[], fallback: ClefModel) => {
	const index = args.indexOf("--model");
	const model = index >= 0 ? args[index + 1] : fallback;
	if (!CLEF_MODELS.includes(model as ClefModel)) {
		console.error(`--model takes ${CLEF_MODELS.join(", ")}; got "${model}".`);
		process.exit(1);
	}
	return model as ClefModel;
};

const cacheDir = join(repoRoot(), "node_modules", ".cache", "bookkit-clef");

type Response = {
	result?: { answers?: Record<string, ClefAnswer>; usage?: Usage };
	answers?: Record<string, ClefAnswer>;
	usage?: Usage;
	errors?: unknown;
};
type Usage = { input_tokens?: number };

const viaApi = async (model: ClefModel, body: string): Promise<Response> => {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/cloudflare/${model}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body,
		},
	);
	const json = (await response.json()) as Response;
	if (!response.ok) {
		throw new Error(
			`HTTP ${response.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`,
		);
	}
	return json;
};

const viaCli = (model: ClefModel, body: string, key: string): Response => {
	mkdirSync(cacheDir, { recursive: true });
	const bodyFile = join(cacheDir, `${key}.request.json`);
	writeFileSync(bodyFile, body);
	const run = spawnSync(
		"cf",
		["ai", "run", `@cf/cloudflare/${model}`, "--body", `@${bodyFile}`, "-q"],
		{ encoding: "utf8" },
	);
	if (run.error || run.status !== 0) {
		throw new Error(
			`cf ai run failed (${run.error?.message ?? `exit ${run.status}`}): ${(run.stderr || run.stdout).slice(0, 300)}. Sign in with \`cf auth create <name>\`, or set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.`,
		);
	}
	return JSON.parse(run.stdout) as Response;
};

export const askClef = async (
	model: ClefModel,
	request: { state: unknown; questions: Record<string, unknown> },
): Promise<ClefResult> => {
	const body = JSON.stringify({ model, ...request });
	const key = createHash("sha256").update(body).digest("hex");
	const cached = join(cacheDir, `${key}.json`);
	if (existsSync(cached)) {
		return { ...JSON.parse(readFileSync(cached, "utf8")), cached: true };
	}
	const json =
		process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
			? await viaApi(model, body)
			: viaCli(model, body, key);
	const answers = json.result?.answers ?? json.answers;
	if (!answers) {
		throw new Error(
			`No answers in the response: ${JSON.stringify(json).slice(0, 300)}`,
		);
	}
	const usage = json.result?.usage ?? json.usage;
	const result = { answers, inputTokens: usage?.input_tokens ?? 0 };
	mkdirSync(cacheDir, { recursive: true });
	writeFileSync(cached, JSON.stringify(result));
	return { ...result, cached: false };
};
