import { authorOnly } from "../utils/author-token";
import { jsonResponse } from "../utils/http";
import {
	type DeliveryResult,
	type DeliveryTarget,
	deliveryTargetLabel,
} from "./delivery";
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
	if (rawTargets?.length) return rawTargets;
	return parseReleaseWebhookTargets(rawEnv);
};

const resolveEmailTargets = (
	rawTargets?: ReleaseEmailTarget[],
	rawEnv?: string | null,
): ReleaseEmailTarget[] => {
	if (rawTargets?.length) return rawTargets;
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

/**
 * What the caller sees of each delivery: the target's label (its name, or its
 * URL's scheme and host). A target's secret, headers, and full URL (a Slack or
 * provider webhook URL is itself a credential) stay on the server.
 */
const describeDelivery = (result: DeliveryResult<DeliveryTarget>) => ({
	target: deliveryTargetLabel(result.target),
	status: result.status,
	statusCode: result.statusCode,
	error: result.error,
});

/**
 * POST sends the latest release to every configured target. Only the author or
 * their CI may trigger it: the request must carry BOOKKIT_AUTHOR_TOKEN (see
 * utils/author-token), under `astro dev` too, since it sends real messages.
 */
const createReleaseSendEndpoint = <T extends DeliveryTarget>({
	route,
	modules,
	readTargets,
	noTargetsError,
	send,
}: {
	route: string;
	modules: Record<string, ReleaseModule>;
	readTargets: () => T[];
	noTargetsError: string;
	send: (
		release: ReturnType<typeof createReleaseNotes>[number],
		targets: T[],
	) => Promise<DeliveryResult<T>[]>;
}) => ({
	POST: authorOnly(
		async (_context: { request: Request }) => {
			const targets = readTargets();
			if (!targets.length) {
				return jsonResponse({ ok: false, error: noTargetsError }, 400);
			}

			const [latest] = createReleaseNotes(modules);
			if (!latest) {
				return jsonResponse(
					{ ok: false, error: "No releases available." },
					404,
				);
			}

			const results = await send(latest, targets);
			return jsonResponse({
				ok: true,
				delivered: results.map(describeDelivery),
			});
		},
		{ route },
	),
});

const readEnv = (name: string): string | undefined =>
	typeof process !== "undefined" ? process.env[name] : undefined;

export const createReleaseWebhookEndpoint = ({
	modules,
	book,
	webhookTargets,
}: {
	modules: Record<string, ReleaseModule>;
	book?: ReleaseEndpointOptions["book"];
	webhookTargets?: ReleaseWebhookTarget[];
}) =>
	createReleaseSendEndpoint({
		route: "POST /api/release-webhook.json",
		modules,
		readTargets: () =>
			resolveWebhookTargets(
				webhookTargets,
				readEnv("BOOKKIT_RELEASE_WEBHOOKS"),
			),
		noTargetsError: "No webhook targets configured.",
		send: (release, targets) => sendReleaseWebhooks({ release, book, targets }),
	});

export const createReleaseEmailEndpoint = ({
	modules,
	book,
	emailTargets,
}: {
	modules: Record<string, ReleaseModule>;
	book?: ReleaseEndpointOptions["book"];
	emailTargets?: ReleaseEmailTarget[];
}) =>
	createReleaseSendEndpoint({
		route: "POST /api/release-email.json",
		modules,
		readTargets: () =>
			resolveEmailTargets(
				emailTargets,
				readEnv("BOOKKIT_RELEASE_EMAIL_TARGETS"),
			),
		noTargetsError: "No email targets configured.",
		send: (release, targets) =>
			sendReleaseEmailHooks({ release, book, targets }),
	});
