import { describe, expect, it } from "bun:test";

import type { SearchEntry } from "../../search";
import { createQueryEngine, normalizeQuery } from "./query-engine";
import type { SearchIndexStore } from "./search-index-store";

const index: SearchEntry[] = [
	{
		id: "chapter-transfer",
		type: "chapters",
		label: "Chapters",
		order: 1,
		title: "Transfer patterns",
		snippet: "Use transfer checkpoints to avoid drift.",
		url: "/read/chapters/transfer-patterns",
		context: "Transfer",
	},
	{
		id: "glossary-governance",
		type: "glossary",
		label: "Glossary",
		order: 2,
		title: "Governance",
		snippet: "Boundaries and review loops.",
		url: "/read/glossary/governance",
		context: "Glossary",
	},
];

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

describe("query engine", () => {
	it("normalizes query text", () => {
		expect(normalizeQuery("  TransFER Loop  ")).toBe("transfer loop");
	});

	it("loads index with status callback and returns ranked results", async () => {
		const statuses: string[] = [];
		const store: SearchIndexStore = {
			load: async (options) => {
				options?.onStatus?.("loading");
				options?.onStatus?.("ready");
				return index;
			},
		};

		const engine = createQueryEngine({
			indexStore: store,
			onStatus: (message) => statuses.push(message),
		});

		const run = await engine.run(" transfer ");

		expect(run.status).toBe("ready");
		if (run.status === "ready") {
			expect(run.normalizedQuery).toBe("transfer");
			expect(run.tokens).toEqual(["transfer"]);
			expect(run.results.map((entry) => entry.id)).toEqual([
				"chapter-transfer",
			]);
		}
		expect(statuses).toEqual(["loading", "ready"]);
	});

	it("marks older run as stale when a newer run finishes first", async () => {
		const first = deferred<SearchEntry[]>();
		const second = deferred<SearchEntry[]>();
		let loadCount = 0;

		const store: SearchIndexStore = {
			load: async () => {
				loadCount += 1;
				return loadCount === 1 ? first.promise : second.promise;
			},
		};

		const engine = createQueryEngine({ indexStore: store });

		const olderRun = engine.run("transfer");
		const newerRun = engine.run("governance");

		second.resolve(index);
		const newerResult = await newerRun;

		first.resolve(index);
		const olderResult = await olderRun;

		expect(newerResult.status).toBe("ready");
		if (newerResult.status === "ready") {
			expect(newerResult.normalizedQuery).toBe("governance");
		}
		expect(olderResult).toEqual({ status: "stale" });
	});
});
