import { jsonResponse } from "../utils/http";
import {
	parseReleaseEmailTargets,
	type ReleaseEmailTarget,
	sendReleaseEmailHooks,
} from "./email";
import type { ReleaseModule } from "./notes";
import { createReleaseNotes } from "./notes";
import {
	createReleaseNotesRssResponse,
	type ReleaseNotesRssOptions,
} from "./rss";
import {
	parseReleaseWebhookTargets,
	type ReleaseWebhookTarget,
	sendReleaseWebhooks,
} from "./webhooks";

export type ReleaseEndpointOptions = {
	modules: Record<string, ReleaseModule>;
	siteUrl: string;
	bookTitle: string;
	book?: {
		slug?: string;
		title?: string;
	};
	rss?: Partial<ReleaseNotesRssOptions> & { releaseNotesPath?: string };
	webhookTargets?: ReleaseWebhookTarget[];
	emailTargets?: ReleaseEmailTarget[];
};

const buildReleaseNotesResponse = ({
	modules,
	siteUrl,
	bookTitle,
	rss,
}: {
	modules: Record<string, ReleaseModule>;
	siteUrl: string;
	bookTitle: string;
	rss?: Partial<ReleaseNotesRssOptions> & { releaseNotesPath?: string };
}): Response => {
	const releases = createReleaseNotes(modules);
	return createReleaseNotesRssResponse({
		siteUrl,
		bookTitle,
		releases,
		...(rss ?? {}),
	});
};

const resolveWebhookTargets = (
	rawTargets?: ReleaseWebhookTarget[],
	rawEnv?: string | null,
): ReleaseWebhookTarget[] => {
	if (rawTargets && rawTargets.length) return rawTargets;
	return parseReleaseWebhookTargets(rawEnv);
};

const resolveEmailTargets = (
	rawTargets?: ReleaseEmailTarget[],
	rawEnv?: string | null,
): ReleaseEmailTarget[] => {
	if (rawTargets && rawTargets.length) return rawTargets;
	return parseReleaseEmailTargets(rawEnv);
};

export const createReleaseNotesRssEndpoint = ({
	modules,
	siteUrl,
	bookTitle,
	rss,
}: {
	modules: Record<string, ReleaseModule>;
	siteUrl: string;
	bookTitle: string;
	rss?: Partial<ReleaseNotesRssOptions> & { releaseNotesPath?: string };
}) => {
	return {
		GET: () => buildReleaseNotesResponse({ modules, siteUrl, bookTitle, rss }),
	};
};

export const createReleaseWebhookEndpoint = ({
	modules,
	book,
	webhookTargets,
}: {
	modules: Record<string, ReleaseModule>;
	book?: ReleaseEndpointOptions["book"];
	webhookTargets?: ReleaseWebhookTarget[];
}) => {
	return {
		POST: async () => {
			const targets = resolveWebhookTargets(
				webhookTargets,
				typeof process !== "undefined"
					? process.env.BOOKKIT_RELEASE_WEBHOOKS
					: undefined,
			);
			if (!targets.length) {
				return jsonResponse(
					{ ok: false, error: "No webhook targets configured." },
					400,
				);
			}

			const releases = createReleaseNotes(modules);
			const [latest] = releases;
			if (!latest) {
				return jsonResponse(
					{ ok: false, error: "No releases available." },
					404,
				);
			}

			const results = await sendReleaseWebhooks({
				release: latest,
				book,
				targets,
			});

			return jsonResponse({ ok: true, delivered: results });
		},
	};
};

export const createReleaseEmailEndpoint = ({
	modules,
	book,
	emailTargets,
}: {
	modules: Record<string, ReleaseModule>;
	book?: ReleaseEndpointOptions["book"];
	emailTargets?: ReleaseEmailTarget[];
}) => {
	return {
		POST: async () => {
			const targets = resolveEmailTargets(
				emailTargets,
				typeof process !== "undefined"
					? process.env.BOOKKIT_RELEASE_EMAIL_TARGETS
					: undefined,
			);
			if (!targets.length) {
				return jsonResponse(
					{ ok: false, error: "No email targets configured." },
					400,
				);
			}

			const releases = createReleaseNotes(modules);
			const [latest] = releases;
			if (!latest) {
				return jsonResponse(
					{ ok: false, error: "No releases available." },
					404,
				);
			}

			const results = await sendReleaseEmailHooks({
				release: latest,
				book,
				targets,
			});

			return jsonResponse({ ok: true, delivered: results });
		},
	};
};
