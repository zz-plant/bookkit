/**
 * Release dates are calendar dates, not instants: "2026-02-10" is February
 * 10 wherever the book is built. Formatting one with `new Date(value)` in the
 * build machine's time zone shows February 9 west of Greenwich.
 */

const LEADING_DATE = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/;

/**
 * The calendar date a value names, as midnight UTC: the date a string starts
 * with (YYYY-MM-DD, with or without a time after it, so the author's written
 * day wins over a time zone offset), a Date's day in UTC (YAML reads an
 * unquoted date as midnight UTC), or the day free-form text names. Undefined
 * when there is no date.
 */
export const calendarDate = (value: string | Date): Date | undefined => {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return undefined;
		return new Date(
			Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
		);
	}
	const match = value.trim().match(LEADING_DATE);
	if (match) {
		const [, year, month, day] = match.map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		// Rejects dates that roll over, such as 2026-02-30.
		return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
			? date
			: undefined;
	}
	// Free-form text ("Feb 10, 2026") is read as local midnight; keep its local day.
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime())
		? undefined
		: new Date(
				Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
			);
};

/** "February 10, 2026" for "2026-02-10", in any time zone; undefined when there is no date. */
export const formatCalendarDate = (
	value: string | Date,
	locale = "en-US",
): string | undefined => {
	const date = calendarDate(value);
	return date
		? new Intl.DateTimeFormat(locale, {
				year: "numeric",
				month: "long",
				day: "numeric",
				timeZone: "UTC",
			}).format(date)
		: undefined;
};
