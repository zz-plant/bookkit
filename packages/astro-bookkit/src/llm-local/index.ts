export type LocalLlmMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type LocalLlmResponse = {
	answer: string;
	done: boolean;
};

export type LocalLlmEngine = {
	state: "idle" | "loading" | "ready" | "unavailable";
	modelName: string;
	complete: (messages: LocalLlmMessage[]) => Promise<LocalLlmResponse>;
	isReady: () => boolean;
};

const DEFAULT_MODEL = "Phi-3-mini-4k-instruct-q4f16_1-MLC";
const FALLBACK_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export const createLocalLlmEngine = async (
	onProgress?: (message: string) => void,
): Promise<LocalLlmEngine | null> => {
	if (typeof window === "undefined") return null;

	try {
		onProgress?.("Loading local language model…");

		// biome-ignore lint/suspicious/noTsIgnore: the optional dependency may be absent, so the import may or may not type-check
		// @ts-ignore — optional dependency, loaded only when WebGPU is enabled
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const webllm: any = await import("@mlc-ai/web-llm");
		const { CreateMLCEngine } = webllm;

		const tryLoad = async (model: string): Promise<unknown | null> => {
			try {
				return await CreateMLCEngine(model, {
					initProgressCallback: (p: { progress: number; text: string }) => {
						const pct = Math.round(p.progress * 100);
						onProgress?.(`${p.text} (${pct}%)`);
					},
				});
			} catch {
				return null;
			}
		};

		let engine = await tryLoad(DEFAULT_MODEL);
		let modelName = DEFAULT_MODEL;

		if (!engine) {
			onProgress?.("Primary model unavailable. Trying fallback…");
			engine = await tryLoad(FALLBACK_MODEL);
			modelName = FALLBACK_MODEL;
		}

		if (!engine) {
			onProgress?.("Local LLM unavailable.");
			return null;
		}

		return {
			state: "ready",
			modelName,
			async complete(messages) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const response: any = await (engine as any).chat.completions.create({
					messages,
					stream: false,
				});
				const content = response.choices?.[0]?.message?.content?.trim() ?? "";
				return { answer: content, done: true };
			},
			isReady: () => true,
		};
	} catch (error) {
		onProgress?.(
			`Local LLM unavailable: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
};
