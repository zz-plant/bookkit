/**
 * The slug rule: lowercase letters, digits, and hyphens. The content schemas
 * hold every record's slug to it, and the reader endpoints (feedback,
 * analytics) hold the slugs readers send to it, so what reaches the author's
 * dashboards names a page of the book or is refused. No Zod here: the reader
 * script imports it too.
 */
export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/** The longest slug a reader endpoint accepts. */
export const MAX_SLUG_LENGTH = 200;

/** Whether `value` is a page's slug, as a reader endpoint accepts it. */
export const isPageSlug = (value: string): boolean =>
	value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);

/** The rule in words, for an endpoint's refusal: `… is not a page's slug, which has ${SLUG_RULE}`. */
export const SLUG_RULE = `only lowercase letters, digits, and hyphens, and at most ${MAX_SLUG_LENGTH} of them`;
