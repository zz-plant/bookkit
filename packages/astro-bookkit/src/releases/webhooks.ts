import {
	type DeliveryResult,
	type DeliveryTarget,
	deliverRelease,
	parseDeliveryTargets,
} from "./delivery";
import type { ReleaseNote } from "./notes";

export type ReleaseWebhookTarget = DeliveryTarget;

export type ReleaseWebhookPayload = {
	event: "release_published";
	release: ReleaseNote;
	book?: {
		slug?: string;
		title?: string;
	};
	at: string;
};

export type ReleaseWebhookResult = DeliveryResult<ReleaseWebhookTarget>;

export const buildReleaseWebhookPayload = ({
	release,
	book,
	at = new Date().toISOString(),
}: {
	release: ReleaseNote;
	book?: ReleaseWebhookPayload["book"];
	at?: string;
}): ReleaseWebhookPayload => ({
	event: "release_published",
	release,
	book,
	at,
});

/** `BOOKKIT_RELEASE_WEBHOOKS`, as `parseDeliveryTargets` reads it. */
export const parseReleaseWebhookTargets = (
	raw?: string | null,
): ReleaseWebhookTarget[] => parseDeliveryTargets(raw);

export const sendReleaseWebhooks = async ({
	release,
	book,
	targets,
}: {
	release: ReleaseNote;
	book?: ReleaseWebhookPayload["book"];
	targets: ReleaseWebhookTarget[];
}): Promise<ReleaseWebhookResult[]> => {
	const payload = buildReleaseWebhookPayload({ release, book });
	return Promise.all(
		targets
			.filter((target) => target.enabled !== false)
			.map((target) =>
				deliverRelease({
					event: "webhook_delivery",
					target,
					payload,
					version: release.version,
				}),
			),
	);
};
