import { describe, expect, it } from "bun:test";
import {
	actionLinksForMechanisms,
	chapterLinksForMechanism,
	chapterReadingOrder,
	mechanismLinksForTerm,
	prerequisiteChapterLinks,
	termLinksForMechanism,
} from "./cross-links";

const entry = <T>(slug: string, frontmatter: T) => ({
	slug,
	module: { frontmatter },
});

const chapters = [
	entry("intro", { title: "Intro", mechanisms: ["triage"] }),
	entry("late", {
		title: "Late",
		order: 2,
		mechanisms: ["triage", "rollback"],
	}),
	entry("early", { title: "Early", order: 1, prerequisites: ["intro"] }),
	entry("drills", { title: "Drills", prerequisites: ["late", "early"] }),
];

describe("chapterReadingOrder", () => {
	it("puts chapters with an `order` first, and keeps file order for the rest", () => {
		expect(chapterReadingOrder(chapters).map((c) => c.slug)).toEqual([
			"early",
			"late",
			"intro",
			"drills",
		]);
	});
});

describe("chapter links", () => {
	it("lists prerequisites in reading order and skips unknown slugs", () => {
		expect(
			prerequisiteChapterLinks(["late", "missing", "early"], chapters),
		).toEqual([
			{ slug: "early", href: "/read/chapters/early", label: "Early" },
			{ slug: "late", href: "/read/chapters/late", label: "Late" },
		]);
	});

	it("finds the chapters that list a mechanism", () => {
		expect(
			chapterLinksForMechanism("triage", chapters).map((link) => link.slug),
		).toEqual(["late", "intro"]);
		expect(chapterLinksForMechanism(undefined, chapters)).toEqual([]);
	});
});

describe("actionLinksForMechanisms", () => {
	it("groups actions by mechanism, shortest first, with a 10-minute default", () => {
		const toolkit = [
			entry("slow", { name: "Slow", mechanism: "triage" }),
			entry("quick", {
				title: "Quick",
				mechanism: "triage",
				timeboxMinutes: 3,
			}),
			entry("undo", { name: "Undo", mechanism: "rollback", timeboxMinutes: 5 }),
		];
		expect(actionLinksForMechanisms(["rollback", "triage"], toolkit)).toEqual([
			{
				slug: "undo",
				href: "/read/toolkit/undo",
				label: "Undo",
				meta: "5 min",
			},
			{
				slug: "quick",
				href: "/read/toolkit/quick",
				label: "Quick",
				meta: "3 min",
			},
			{
				slug: "slow",
				href: "/read/toolkit/slow",
				label: "Slow",
				meta: "10 min",
			},
		]);
	});
});

describe("glossary ↔ mechanism", () => {
	const mechanisms = [
		entry("triage", { title: "Incident Triage" }),
		entry("severity", { title: "Severity" }),
	];
	const glossary = [
		entry("sev-1", { term: "Sev-1", mechanisms: ["triage"] }),
		entry("severity", { term: "Severity" }),
		entry("pager", { term: "Pager", mechanisms: [] }),
	];

	it("links a term to the mechanisms it declares, else the one sharing its slug", () => {
		expect(
			mechanismLinksForTerm(
				{ slug: "sev-1", mechanisms: ["triage"] },
				mechanisms,
			),
		).toEqual([
			{
				slug: "triage",
				href: "/read/mechanisms/triage",
				label: "Incident Triage",
			},
		]);
		expect(
			mechanismLinksForTerm({ slug: "severity" }, mechanisms).map(
				(l) => l.slug,
			),
		).toEqual(["severity"]);
		expect(
			mechanismLinksForTerm({ slug: "pager", mechanisms: [] }, mechanisms),
		).toEqual([]);
	});

	it("links a mechanism back to the terms that name it", () => {
		expect(
			termLinksForMechanism("triage", glossary).map((l) => l.label),
		).toEqual(["Sev-1"]);
		expect(
			termLinksForMechanism("severity", glossary).map((l) => l.label),
		).toEqual(["Severity"]);
	});
});
