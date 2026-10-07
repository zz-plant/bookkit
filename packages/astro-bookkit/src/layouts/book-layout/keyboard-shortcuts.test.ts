import { describe, expect, it } from "bun:test";

import { shouldSkipKeyboardShortcut } from "./keyboard-shortcuts";

describe("shouldSkipKeyboardShortcut", () => {
	it("keeps Escape available for dismissing panels from editable targets", () => {
		expect(
			shouldSkipKeyboardShortcut({
				key: "Escape",
				editableTarget: true,
				hasModifier: false,
			}),
		).toBeFalse();
	});

	it("skips non-Escape shortcuts for editable targets and modifier chords", () => {
		expect(
			shouldSkipKeyboardShortcut({
				key: "/",
				editableTarget: true,
				hasModifier: false,
			}),
		).toBeTrue();

		expect(
			shouldSkipKeyboardShortcut({
				key: "?",
				editableTarget: false,
				hasModifier: true,
			}),
		).toBeTrue();
	});
});
