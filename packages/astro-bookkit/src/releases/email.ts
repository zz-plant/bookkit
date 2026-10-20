import {
	type DeliveryResult,
	type DeliveryTarget,
	deliverRelease,
	parseDeliveryTargets,
} from "./delivery";
import type { ReleaseNote } from "./notes";

export type ReleaseEmailTarget = DeliveryTarget & {
	/** Recorded with each delivery in the release log. */
	provider?: string;
};

export type ReleaseEmailPayload = {
	event: "release_email";
	release: ReleaseNote;
	book?: {
		slug?: string;
		title?: string;
	};
	at: string;
};

export type ReleaseEmailResult = DeliveryResult<ReleaseEmailTarget>;

export const buildReleaseEmailPayload = ({
	release,
	book,
	at = new Date().toISOString(),
}: {
	release: ReleaseNote;
	book?: ReleaseEmailPayload["book"];
	at?: string;
}): ReleaseEmailPayload => ({
	event: "release_email",
	release,
	book,
	at,
});

/** `BOOKKIT_RELEASE_EMAIL_TARGETS`, as `parseDeliveryTargets` reads it. */
export const parseReleaseEmailTargets = (
	raw?: string | null,
): ReleaseEmailTarget[] => parseDeliveryTargets(raw);

export const sendReleaseEmailHooks = async ({
	release,
	book,
	targets,
}: {
	release: ReleaseNote;
	book?: ReleaseEmailPayload["book"];
	targets: ReleaseEmailTarget[];
}): Promise<ReleaseEmailResult[]> => {
	const payload = buildReleaseEmailPayload({ release, book });
	return Promise.all(
		targets
			.filter((target) => target.enabled !== false)
			.map((target) =>
				deliverRelease({
					event: "email_delivery",
					target,
					payload,
					version: release.version,
					metadata: target.provider ? { provider: target.provider } : undefined,
				}),
			),
	);
};
