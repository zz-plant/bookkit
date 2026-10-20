import { describe, expect, it } from "bun:test";

import {
	MENU_READ_SECTIONS,
	readSectionCurrent,
	readSectionOfPath,
	readSectionTitles,
} from "./read-routes";

const marks = (path: string) =>
	Object.fromEntries(
		MENU_READ_SECTIONS.flatMap((key) => {
			const current = readSectionCurrent(key, path);
			return current ? [[key, current]] : [];
		}),
	);

describe("read sections", () => {
	it("names the engine's overview page About this book", () => {
		expect(readSectionTitles.overview).toBe("About this book");
	});

	it("finds the section a path is in", () => {
		expect(readSectionOfPath("/read")).toBe("root");
		expect(readSectionOfPath("/read/")).toBe("root");
		expect(readSectionOfPath("/read/chapters")).toBe("chapters");
		expect(readSectionOfPath("/read/chapters/overview/")).toBe("chapters");
		expect(readSectionOfPath("/read/overview")).toBe("overview");
		expect(readSectionOfPath("/read/chaptersx")).toBe("root");
		expect(readSectionOfPath("/downloads")).toBeNull();
	});

	it("marks the menu's section: page on its index, true below it", () => {
		expect(marks("/read")).toEqual({ root: "page" });
		expect(marks("/read/toolkit")).toEqual({ toolkit: "page" });
		expect(marks("/read/toolkit/classify-alert-severity")).toEqual({
			toolkit: "true",
		});
		// A read page in no listed section marks the hub.
		expect(marks("/read/overview")).toEqual({ root: "true" });
		expect(marks("/release-notes")).toEqual({});
	});
});
