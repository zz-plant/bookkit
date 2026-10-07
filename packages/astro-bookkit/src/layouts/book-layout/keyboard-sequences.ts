export type PendingKeyboardSequence = "g" | null;
export type KeyboardSequenceCommand =
	| { type: "navigate"; path: string }
	| { type: "previous-heading" }
	| { type: "next-heading" }
	| { type: "toggle-help" }
	| { type: "open-search" }
	| { type: "toggle-search" }
	| { type: "dismiss-panels" }
	| { type: "noop" };

const sequenceMap: Record<string, string> = {
	h: "/",
	r: "/read",
	n: "/release-notes",
	d: "/downloads",
	a: "/read/tools",
	o: "/read/overview",
	c: "/read/chapters",
	m: "/read/mechanisms",
	t: "/read/toolkit",
	l: "/read/glossary",
	e: "/read/examples",
};

export const resolveKeyboardSequence = (
	pending: PendingKeyboardSequence,
	key: string,
): {
	nextPending: PendingKeyboardSequence;
	command: KeyboardSequenceCommand;
} => {
	const normalizedKey = key.toLowerCase();

	if (normalizedKey === "escape") {
		return { nextPending: null, command: { type: "dismiss-panels" } };
	}

	if (normalizedKey === "?") {
		return { nextPending: null, command: { type: "toggle-help" } };
	}

	if (normalizedKey === "/") {
		return { nextPending: null, command: { type: "open-search" } };
	}

	if (normalizedKey === "[") {
		return { nextPending: null, command: { type: "previous-heading" } };
	}

	if (normalizedKey === "]") {
		return { nextPending: null, command: { type: "next-heading" } };
	}

	if (normalizedKey === "g") {
		return { nextPending: "g", command: { type: "noop" } };
	}

	if (pending === "g") {
		return sequenceMap[normalizedKey]
			? {
					nextPending: null,
					command: { type: "navigate", path: sequenceMap[normalizedKey] },
				}
			: { nextPending: null, command: { type: "noop" } };
	}

	return { nextPending: null, command: { type: "noop" } };
};
