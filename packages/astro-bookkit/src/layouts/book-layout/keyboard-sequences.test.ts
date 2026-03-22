import { describe, expect, it } from "bun:test";

import { resolveKeyboardSequence } from "./keyboard-sequences";

describe("keyboard sequence parsing", () => {
  it("keeps pending g sequences until a destination key arrives", () => {
    expect(resolveKeyboardSequence(null, "g")).toEqual({
      nextPending: "g",
      command: { type: "noop" },
    });

    expect(resolveKeyboardSequence("g", "r")).toEqual({
      nextPending: null,
      command: { type: "navigate", path: "/read" },
    });
  });

  it("maps standalone shortcut keys without a pending sequence", () => {
    expect(resolveKeyboardSequence(null, "/")).toEqual({
      nextPending: null,
      command: { type: "open-search" },
    });
    expect(resolveKeyboardSequence(null, "?")).toEqual({
      nextPending: null,
      command: { type: "toggle-help" },
    });
  });

  it("clears unknown follow-up keys instead of navigating", () => {
    expect(resolveKeyboardSequence("g", "x")).toEqual({
      nextPending: null,
      command: { type: "noop" },
    });
  });
});
