import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bookDataPath } from "../utils/book-data";
import {
	deliveryTargetLabel,
	parseDeliveryTargets,
	withoutTargetUrl,
} from "./delivery";
import { parseReleaseEmailTargets, sendReleaseEmailHooks } from "./email";
import type { ReleaseNote } from "./notes";
import { parseReleaseWebhookTargets, sendReleaseWebhooks } from "./webhooks";

// A Slack-style webhook URL: the path is the credential.
const SECRET_PATH = "/services/T000/B000/s3cr3t-path";
const URL_WITH_TOKEN = `https://hooks.example${SECRET_PATH}?token=t0ken`;

const release: ReleaseNote = {
	slug: "2026-10-01",
	title: "First release",
	version: "1.0.0",
	date: "2026-10-01",
	summary: "",
	highlights: [],
	changedSections: [],
	sectionSnapshots: {},
	sectionChangeSource: "manual",
};

describe("parseDeliveryTargets", () => {
	const json = JSON.stringify([
		" https://hooks.example/a ",
		"",
		{
			url: "https://hooks.example/b",
			name: "team",
			secret: "s",
			provider: "postmark",
			headers: { "X-One": "1", "X-Two": 2 },
			enabled: false,
		},
		{ name: "no url" },
		{ url: " " },
		42,
	]);

	it("reads a JSON array of URLs and targets, skipping entries without a URL", () => {
		expect(parseDeliveryTargets(json)).toEqual([
			{ url: "https://hooks.example/a" },
			{
				url: "https://hooks.example/b",
				name: "team",
				secret: "s",
				provider: "postmark",
				headers: { "X-One": "1" },
				enabled: false,
			},
		]);
	});

	it("reads comma-separated URLs, and nothing from an empty value", () => {
		expect(
			parseDeliveryTargets(" https://a.example/x, ,https://b.example/y "),
		).toEqual([{ url: "https://a.example/x" }, { url: "https://b.example/y" }]);
		for (const raw of [undefined, null, "", "  "]) {
			expect(parseDeliveryTargets(raw)).toEqual([]);
		}
	});

	it("is how both the webhook and the email variables are read", () => {
		for (const raw of [json, "https://a.example/x,https://b.example/y"]) {
			expect(parseReleaseWebhookTargets(raw)).toEqual(
				parseDeliveryTargets(raw),
			);
			expect(parseReleaseEmailTargets(raw)).toEqual(parseDeliveryTargets(raw));
		}
	});
});

describe("deliveryTargetLabel", () => {
	it("is the target's name, or its URL's scheme and host", () => {
		expect(deliveryTargetLabel({ name: "team", url: URL_WITH_TOKEN })).toBe(
			"team",
		);
		expect(deliveryTargetLabel({ url: URL_WITH_TOKEN })).toBe(
			"https://hooks.example",
		);
		expect(
			deliveryTargetLabel({ url: "https://user:pass@hooks.example:8443/x" }),
		).toBe("https://hooks.example:8443");
		expect(deliveryTargetLabel({ url: "not a url/s3cr3t" })).toBe(
			"unnamed target",
		);
	});
});

describe("withoutTargetUrl", () => {
	it("replaces the URL, as configured or parsed, and its path and query", () => {
		const target = { url: URL_WITH_TOKEN };
		expect(
			withoutTargetUrl(`Failed to parse URL from ${URL_WITH_TOKEN}`, target),
		).toBe("Failed to parse URL from https://hooks.example");
		expect(
			withoutTargetUrl(`POST ${SECRET_PATH}?token=t0ken refused`, target),
		).toBe("POST https://hooks.example refused");
	});
});

const deliveries = [
	["webhooks", sendReleaseWebhooks],
	["email hooks", sendReleaseEmailHooks],
] as const;

describe.each(deliveries)("release %s", (_, send) => {
	let dataDir: string;
	let savedDataDir: string | undefined;
	let fetched: ReturnType<typeof spyOn>;
	let logged: Array<ReturnType<typeof spyOn>>;

	beforeEach(() => {
		savedDataDir = process.env.BOOKKIT_DATA_DIR;
		dataDir = mkdtempSync(join(tmpdir(), "bookkit-release-log-"));
		process.env.BOOKKIT_DATA_DIR = dataDir;
		logged = (["log", "info", "warn", "error"] as const).map((level) =>
			spyOn(console, level).mockImplementation(() => {}),
		);
	});
	afterEach(() => {
		fetched?.mockRestore();
		for (const spy of logged) spy.mockRestore();
		if (savedDataDir === undefined) delete process.env.BOOKKIT_DATA_DIR;
		else process.env.BOOKKIT_DATA_DIR = savedDataDir;
		rmSync(dataDir, { recursive: true, force: true });
	});

	const releaseLog = () =>
		readFileSync(bookDataPath("release-analytics.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Record<string, unknown>);

	it("records each target by its name or scheme and host, never its URL, whatever the outcome", async () => {
		const answers = [
			async () => new Response(null, { status: 202 }),
			async () => new Response(null, { status: 500 }),
			async () => {
				// How Node's fetch words a URL it cannot use.
				throw new TypeError(`Failed to parse URL from ${URL_WITH_TOKEN}`);
			},
		];
		let call = 0;
		fetched = spyOn(globalThis, "fetch").mockImplementation(() =>
			answers[call++](),
		);

		const results = await send({
			release,
			targets: [
				{ url: URL_WITH_TOKEN, name: "subscribers" },
				{ url: URL_WITH_TOKEN },
				{ url: URL_WITH_TOKEN },
			],
		});

		expect(fetched).toHaveBeenCalledTimes(3);
		expect(results.map(({ status, error }) => ({ status, error }))).toEqual([
			{ status: "success", error: undefined },
			{ status: "failure", error: "HTTP 500" },
			{
				status: "failure",
				error: "Failed to parse URL from https://hooks.example",
			},
		]);
		// The deliveries run at once, so their records may land in any order.
		const records = releaseLog();
		expect(
			records.map((record) => `${record.status} ${record.target}`).sort(),
		).toEqual([
			"failure https://hooks.example",
			"failure https://hooks.example",
			"success subscribers",
		]);
		expect(records.some((record) => "webhook" in record)).toBe(false);

		const written = [
			readFileSync(bookDataPath("release-analytics.jsonl"), "utf8"),
			JSON.stringify(results.map(({ error }) => error)),
			...logged.flatMap((spy) => spy.mock.calls.flat().map(String)),
		].join("\n");
		expect(written).not.toContain("s3cr3t");
		expect(written).not.toContain("t0ken");
	});
});
